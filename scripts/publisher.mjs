import { readFile,mkdir,stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname,join,basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { github,lockFromRelease } from './github.mjs';
import { getReadiness,warningMarkdown } from './readiness.mjs';
import { discoverLocalPlugins,sourcePath,sourceRoot } from './local-plugins.mjs';
import { loadJson,saveJson,withLock } from './sync-files.mjs';

const root=dirname(dirname(fileURLToPath(import.meta.url)));
const generated=new Set(['catalog.json','sources.json','releases.lock.json']);
const git=process.env.EVFX_GIT||'git';
const digest=value=>createHash('sha256').update(value).digest('hex');
const hashFile=async path=>{const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest('hex');};
const run=(command,args,options={})=>{
  const result=spawnSync(command,args,{cwd:root,encoding:'utf8',windowsHide:true,timeout:300000,
    env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never'},...options});
  if(result.status!==0)throw new Error(`${basename(command)} ${args[0]} failed: ${result.stderr||result.error?.message||result.stdout}`);
  return result.stdout.trim();
};
export function siteIsBeingEdited(){
  const dirty=run(git,['status','--porcelain=v1','-z']).split('\0').filter(Boolean);
  return dirty.some(line=>!generated.has(line.slice(3)));
}

async function publish({automatic=false,prepareOnly=false,only=null,expectedFingerprint=null}={}){
  if(automatic){
    if(siteIsBeingEdited())return {skipped:true,reason:'Site source is being edited'};
    if(run(git,['branch','--show-current'])!=='main')return {skipped:true,reason:'Site checkout is not on main'};
    run(git,['fetch','origin','--no-tags']);
    const head=run(git,['rev-parse','HEAD']),remote=run(git,['rev-parse','origin/main']);
    if(head!==remote){
      if(run(git,['status','--porcelain']).trim())return {skipped:true,reason:'Local sync data and the remote branch both changed'};
      run(git,['merge','--ff-only','origin/main']);
    }
  }
  const config=await loadJson(join(root,'sync.config.json'));
  let catalog=await loadJson(join(root,'catalog.json')),sources=await loadJson(join(root,'sources.json'));
  const scan=await discoverLocalPlugins(root,{catalog,sources,config});
  if(expectedFingerprint&&expectedFingerprint!==scan.fingerprint)return {skipped:true,reason:'Release files changed during sync'};
  if(scan.issues.length)throw new Error(scan.issues.join('\n'));
  ({catalog,sources}=scan);
  const locks=await loadJson(join(root,'releases.lock.json'));
  for(const id of Object.keys(locks))if(!catalog.tools.some(t=>t.id===id))delete locks[id];
  const output=join(root,'.packages');await mkdir(output,{recursive:true});
  const prepared=[];
  for(const tool of catalog.tools){
    const source=sources[tool.id];
    if(!source||only&&!only.includes(tool.id))continue;
    const version=source.version??null;
    let paths;
    if(source.artifacts){paths=source.artifacts.map(p=>sourcePath(root,config,source,p));}
    else{
      const base=source.bundleRoot?sourcePath(root,config,source,source.bundleRoot):sourceRoot(root,config,source);
      const path=join(output,`EVFX-${tool.id}-${version||'snapshot'}.zip`);
      const guide=`EVFX ${tool.name}${version?' '+version:''}\n\n${tool.detail}\n\nREQUIREMENTS\n${tool.requirements}\n\nINSTALLATION\n${tool.install}\n\nFor a native AEX: close After Effects, then copy the AEX into:\nC:\\Program Files\\Adobe\\Common\\Plug-ins\\7.0\\MediaCore\\EVFX\\\nCreate the EVFX folder if needed. Do not keep duplicate copies in other AE plug-in folders. Administrator permission may be needed. Restart AE.\n\nFor a JSX panel, use your After Effects Scripts/ScriptUI Panels folder, or File > Scripts > Run Script File.\n\nLatest releases: https://github.com/${catalog.repository}/releases\n`;
      run(process.env.EVFX_PYTHON||process.env.PYTHON||'python',['-X','utf8',join(root,'scripts/bundle.py')],{input:JSON.stringify({base,output:path,files:source.files,preservePaths:!!source.bundleRoot,guide})});
      paths=[path];
    }
    const assets=[];
    for(let i=0;i<paths.length;i++){
      const path=paths[i],info=await stat(path);
      if(info.size>=2*1024**3)throw new Error(`Asset exceeds GitHub's 2 GiB limit: ${basename(path)}`);
      assets.push({path,name:basename(path),bytes:info.size,sha256:await hashFile(path),primary:i===0});
    }
    const verified=await loadJson(join(root,'.local/verified-packages.json'),{});
    for(const asset of assets)if(!verified[asset.sha256]){
      console.log(run(process.env.EVFX_PYTHON||process.env.PYTHON||'python',['-X','utf8',join(root,'scripts/verify-package.py'),asset.path]));
      verified[asset.sha256]=true;
    }
    await saveJson(join(root,'.local/verified-packages.json'),verified);
    const tag=`${tool.id}-${version?'v'+version:'snapshot'}-${digest(assets.map(a=>a.sha256).join('\n')).slice(0,10)}`;
    let validatedSource=source.review?.state==='complete'&&source.review.runtimeVerified===true&&source.review.sha256?.toLowerCase()===assets[0].sha256;
    if(!validatedSource&&source.review?.runtimeVerified===true&&source.review.state==='complete'&&!source.bundleRoot&&source.files?.length===1){
      validatedSource=(await hashFile(sourcePath(root,config,source,source.files[0])))===source.review.sha256?.toLowerCase();
    }
    if(validatedSource&&!version?.includes('-')){
      tool.status='release';
      tool.readiness={state:'reviewed',releaseTag:tag,reviewedAt:new Date().toISOString().slice(0,10),evidence:source.review.evidence};
    }
    prepared.push({tool,version,assets,tag,validatedSource});
    console.log(`Prepared ${tool.id} ${version||'snapshot'}`);
  }
  // Reject a build that changed while its payload was being prepared.
  for(const observation of scan.observations){
    const info=await stat(observation.path);
    if(info.size!==observation.size||info.mtimeMs!==observation.mtime)throw new Error('Build files are still changing; publication deferred.');
  }
  if(prepareOnly)return {prepared:prepared.map(({tool,version,assets})=>({id:tool.id,version,assets:assets.map(({path,...asset})=>asset)})),fingerprint:scan.fingerprint};
  await saveJson(join(root,'catalog.json'),catalog);await saveJson(join(root,'sources.json'),sources);await saveJson(join(root,'releases.lock.json'),locks);
  console.log(run(process.execPath,['scripts/check.mjs']));
  console.log(run(process.execPath,['--test']));

  const user=await github('/user'),[owner,name]=catalog.repository.split('/');
  if(user.login.toLowerCase()!==owner.toLowerCase())throw new Error(`Signed in as ${user.login}; publisher expects ${owner}`);
  const repository=await github(`/repos/${catalog.repository}`);
  if(repository.private)throw new Error('The configured site repository must be public for free hosting.');
  const remote=run(git,['remote','get-url','origin']);
  if(!remote.toLowerCase().endsWith(`github.com/${catalog.repository.toLowerCase()}.git`))throw new Error('Unexpected site Git remote.');
  let releaseChanged=false;
  for(const {tool,version,assets,tag,validatedSource} of prepared){
    const previous=locks[tool.id];
    const complete=previous?.complete||(previous&&getReadiness(tool,previous).state==='reviewed'?previous:null);
    let release=await github(`/repos/${catalog.repository}/releases/tags/${tag}`,{allow404:true});
    const ready=getReadiness(tool,{tag,version,prerelease:false}).state==='reviewed'&&!version?.includes('-')&&(!release?.prerelease||validatedSource);
    const metadata={id:tool.id,version,files:assets.map(({path,...asset})=>asset),...(ready?{readiness:{state:'complete',runtimeVerified:true,sha256:assets[0].sha256,evidence:tool.readiness.evidence}}:{})};
    const notes=warningMarkdown(tool,{tag,version,prerelease:!ready})+`${tool.detail}\n\n### Requirements\n${tool.requirements}\n\n### Installation\n${tool.install}\n\n### SHA-256\n${assets.map(a=>`- \`${a.name}\`: \`${a.sha256}\``).join('\n')}\n\n<!-- evfx-release\n${JSON.stringify(metadata)}\n-->`;
    if(!release){
      release=await github(`/repos/${catalog.repository}/releases`,{method:'POST',body:{tag_name:tag,target_commitish:'main',name:`EVFX ${tool.name} — ${version||'snapshot'}`,body:notes,draft:true,prerelease:!ready,make_latest:'false'}});releaseChanged=true;
    }else if(release.body!==notes||release.prerelease!==!ready){
      release=await github(`/repos/${catalog.repository}/releases/${release.id}`,{method:'PATCH',body:{body:notes,prerelease:!ready,make_latest:'false'}});releaseChanged=true;
    }
    for(const asset of assets){
      let existing=release.assets.find(a=>a.name===asset.name);
      if(existing&&(existing.state!=='uploaded'||existing.size!==asset.bytes||existing.digest&&existing.digest!==`sha256:${asset.sha256}`)){
        if(!release.draft)throw new Error(`Published release asset differs: ${asset.name}`);
        await github(`/repos/${catalog.repository}/releases/assets/${existing.id}`,{method:'DELETE'});existing=null;
      }
      if(existing)continue;
      const uploadUrl=release.upload_url.replace(/\{.*$/,'')+`?name=${encodeURIComponent(asset.name)}`;
      const uploaded=await github(uploadUrl,{method:'POST',filePath:asset.path,headers:{'Content-Type':asset.name.endsWith('.zip')?'application/zip':'application/octet-stream'}});
      if(uploaded.digest&&uploaded.digest!==`sha256:${asset.sha256}`)throw new Error(`Uploaded checksum differs: ${asset.name}`);
      release.assets.push(uploaded);releaseChanged=true;console.log(`Uploaded ${asset.name}`);
    }
    if(release.draft)await github(`/repos/${catalog.repository}/releases/${release.id}`,{method:'PATCH',body:{draft:false,make_latest:'false'}});
    release=await github(`/repos/${catalog.repository}/releases/${release.id}`);
    const next=lockFromRelease(release,metadata);
    const {complete:unused,...oldComplete}=complete||{};
    locks[tool.id]={...next,...(ready?{complete:{...next}}:complete&&complete.tag!==tag?{complete:oldComplete}:{})};
    await saveJson(join(root,'releases.lock.json'),locks);
    console.log(`Verified ${tool.id}`);
  }
  console.log(run(process.execPath,['scripts/check.mjs','--require-downloads']));
  console.log(run(process.execPath,['scripts/build.mjs']));
  if(automatic)run(git,['add','--',...generated]);
  else run(git,['add','--','.gitignore','README.md','package.json','catalog.json','sources.json','support.json','sync.config.json','releases.lock.json','src','scripts','tests','.github','Sync EVFX.cmd']);
  let pushed=false;
  if(run(git,['diff','--cached','--name-only'])){
    run(git,['-c',`user.name=${user.name||user.login}`,'-c',`user.email=${user.id}+${user.login}@users.noreply.github.com`,'commit','-m','Sync EVFX releases and catalog']);
    run(git,['push','-u','origin','main']);pushed=true;
  }
  if(releaseChanged&&!pushed)await github(`/repos/${catalog.repository}/actions/workflows/pages.yml/dispatches`,{method:'POST',body:{ref:'main'}});
  return {published:true,changed:releaseChanged||pushed,tools:prepared.length,url:`https://${owner}.github.io/${name}/`};
}

export const publishLocal=options=>withLock(join(root,'.local/publish.lock'),()=>publish(options));
