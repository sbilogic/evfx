import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encryptVault, decryptVault } from '../src/private.js';
import { github } from './github.mjs';
import { loadJson, saveJson, withLock } from './sync-files.mjs';
import { remapPrivateProject } from './private-project.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const auto = args.includes('--auto');
const onlyIndex = args.indexOf('--only');
const only = onlyIndex < 0 ? null : args[onlyIndex + 1];
if (onlyIndex >= 0 && !only) throw new Error('--only requires a private source ID');
const projectIndex = args.indexOf('--project');
const project = projectIndex < 0 ? null : args[projectIndex + 1];
if (projectIndex >= 0 && (!project || !only)) throw new Error('--project requires a path and --only');
const run = (command, arguments_, options = {}) => {
  const result = spawnSync(command, arguments_, {
    cwd:root, encoding:'utf8', windowsHide:true, timeout:600000,
    env:{...process.env, GIT_TERMINAL_PROMPT:'0', GCM_INTERACTIVE:'Never'}, ...options
  });
  if (result.status !== 0) throw new Error(`${basename(command)} failed: ${result.stderr || result.error?.message || result.stdout}`);
  return result.stdout.trim();
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const key = () => run('powershell.exe', ['-NoProfile','-NonInteractive','-File',join(root,'scripts/private-key.ps1'),'load']);

async function publish() {
  if (auto) {
    if (run('git',['status','--porcelain=v1'])) throw new Error('Site source is being edited');
    if (run('git',['branch','--show-current']) !== 'main') throw new Error('Site checkout is not on main');
    run('git',['fetch','origin','--no-tags']);
    if (run('git',['rev-parse','HEAD']) !== run('git',['rev-parse','origin/main'])) throw new Error('Site is out of sync with GitHub');
  }
  const password = key();
  const config = await loadJson(join(root,'.local/private-sources.json'));
  if (config.version !== 1 || !config.sources || typeof config.sources !== 'object') throw new Error('Invalid private sources');
  const selected = only ? [only] : Object.keys(config.sources);
  if (selected.some(id => !config.sources[id])) throw new Error('Unknown private source');
  if (project) {
    const marker = await stat(join(resolve(project),'.evfx-private')).catch(() => null);
    if (!marker?.isFile()) throw new Error('Private project marker is missing');
    const identity = await loadJson(join(resolve(project),'.evfx-private')).catch(() => null);
    if (identity?.id !== only) throw new Error('Private project marker does not match this build');
    config.sources[only] = remapPrivateProject(config.sources[only],project);
  }
  const encryptedManifest = await readFile(join(root,'src/private.enc')).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  const manifest = encryptedManifest
    ? JSON.parse(new TextDecoder().decode(await decryptVault(encryptedManifest,password)))
    : {version:1,entries:[]};
  const index = await loadJson(join(root,'private-assets.json'),{version:1,assets:[]});
  if (manifest.version !== 1 || !Array.isArray(manifest.entries) || index.version !== 1 || !Array.isArray(index.assets))
    throw new Error('Invalid private vault state');
  const cache = join(root,'.local/vault-assets');
  await mkdir(cache,{recursive:true});
  let release, changed = false;
  for (const id of selected) {
    const source = config.sources[id];
    const temporary = join(root,'.local',`private-${randomBytes(12).toString('hex')}.zip`);
    let bytes;
    try {
      run('python',['scripts/package-private.py'],{input:JSON.stringify({...source.recipe,output:temporary})});
      bytes = await readFile(temporary);
    } finally { await unlink(temporary).catch(() => {}); }
    const old = manifest.entries.find(entry => entry.id === id);
    const buildSha = hash(bytes);
    let entry = {...source.display,id,buildSha};
    if (source.versionFile && source.versionPattern) {
      const match = new RegExp(source.versionPattern,'i').exec(await readFile(source.versionFile,'utf8'));
      if (match?.[1]) entry.version = match[1];
    }
    if (source.nameFile && source.namePattern) {
      const match = new RegExp(source.namePattern,'i').exec(await readFile(source.nameFile,'utf8'));
      if (match?.[1]) entry.name = match[1];
    }
    if (old?.buildSha === buildSha && index.assets.some(asset => asset.name === old.asset)) {
      entry = {...entry,asset:old.asset,uploadedAt:old.uploadedAt};
    } else {
      const name = randomBytes(16).toString('hex')+'.bin';
      const sealed = await encryptVault(bytes,password);
      bytes = null;
      const file = join(cache,name);
      await writeFile(file,sealed);
      const sha256 = hash(sealed);
      if (!release) {
        release = await github('/repos/sbilogic/evfx/releases/tags/private-vault',{allow404:true});
        if (!release) release = await github('/repos/sbilogic/evfx/releases',{
          method:'POST',body:{tag_name:'private-vault',target_commitish:'main',name:'Private downloads',
            body:'Encrypted downloads for the private gallery.',draft:false,prerelease:true,make_latest:'false'}
        });
      }
      const upload = release.upload_url.replace(/\{.*$/,'')+`?name=${name}`;
      const asset = await github(upload,{method:'POST',filePath:file,headers:{'Content-Type':'application/octet-stream'}});
      if (asset.name !== name || asset.size !== sealed.length || asset.digest && asset.digest !== `sha256:${sha256}`)
        throw new Error('Uploaded encrypted asset did not match');
      const url = `https://github.com/sbilogic/evfx/releases/download/private-vault/${name}`;
      if (asset.browser_download_url !== url) throw new Error('Unexpected encrypted asset URL');
      index.assets = index.assets.filter(item => item.name !== old?.asset);
      index.assets.push({name,url,sha256,bytes:sealed.length});
      entry = {...entry,asset:name,uploadedAt:asset.updated_at || asset.created_at};
      changed = true;
      console.log('Uploaded an encrypted private build.');
    }
    if (JSON.stringify(old) !== JSON.stringify(entry)) changed = true;
    manifest.entries = [...manifest.entries.filter(item => item.id !== id),entry];
  }
  if (project) await saveJson(join(root,'.local/private-sources.json'),config);
  if (!changed) { console.log('Private downloads are already current.'); return; }
  await writeFile(join(root,'src/private.enc'),await encryptVault(new TextEncoder().encode(JSON.stringify(manifest)),password));
  await saveJson(join(root,'private-assets.json'),index);
  if (auto) {
    const paths = run('git',['status','--porcelain=v1']).split(/\r?\n/).filter(Boolean).map(line=>line.slice(3).replaceAll('\\','/'));
    if (paths.some(path => !['src/private.enc','private-assets.json'].includes(path)))
      throw new Error('Site source changed during private publication');
    run(process.execPath,['scripts/check.mjs']);
    run(process.execPath,['scripts/build.mjs']);
    run(process.execPath,['scripts/stage-private-assets.mjs']);
    run('git',['add','--','src/private.enc','private-assets.json']);
    if (run('git',['diff','--cached','--name-only'])) {
      run('git',['commit','-m','Update encrypted private downloads']);
      run('git',['push','origin','main']);
    }
    console.log('Private downloads updated.');
  } else console.log('Private downloads prepared.');
}

try {
  const result = await withLock(join(root,'.local/publish.lock'),publish);
  if (result?.skipped) throw new Error(result.reason);
} catch (error) {
  console.error(`Private publication deferred: ${error.message}`);
  process.exitCode = 1;
}
