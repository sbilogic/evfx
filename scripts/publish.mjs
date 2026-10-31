import { readFile,writeFile,readdir,mkdir,stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname,join,resolve,basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { github,lockFromRelease } from './github.mjs';
import { getReadiness,warningMarkdown } from './readiness.mjs';

const root=dirname(dirname(fileURLToPath(import.meta.url)));
const workspace=resolve(process.env.EVFX_COLLECTION_ROOT||join(root,'..'));
const catalog=JSON.parse(await readFile(join(root,'catalog.json'),'utf8'));
const sources=JSON.parse(await readFile(join(root,'sources.json'),'utf8'));
const locks=JSON.parse(await readFile(join(root,'releases.lock.json'),'utf8'));
const output=join(root,'.packages');
await mkdir(output,{recursive:true});
const prepareOnly=process.argv.includes('--prepare-only');
const onlyArg=process.argv.find(a=>a.startsWith('--only='));
const only=onlyArg?.slice(7).split(',');
const versionCompare=(a,b)=>{const av=a.split('.').map(Number),bv=b.split('.').map(Number);for(let i=0;i<3;i++){if(av[i]!==bv[i])return av[i]-bv[i];}return 0;};
const digest=data=>createHash('sha256').update(data).digest('hex');
const run=(command,args,options={})=>{
  const result=spawnSync(command,args,{cwd:root,encoding:'utf8',windowsHide:true,...options});
  if(result.status!==0)throw new Error(`${command} ${args[0]} failed: ${result.stderr||result.error?.message||result.stdout}`);
  return result.stdout.trim();
};
const prepared=[];
for(const tool of catalog.tools){
  const source=sources[tool.id];
  if(!source||only&&!only.includes(tool.id))continue;
  let version=source.version??null;
  let files=[];
  if(source.directory){
    const directory=join(workspace,source.directory);
    const expression=new RegExp(source.pattern);
    const matches=(await readdir(directory)).map(name=>({name,match:name.match(expression)})).filter(x=>x.match)
      .sort((a,b)=>versionCompare(b.match[1],a.match[1]));
    if(!matches.length)throw new Error(`No packaged build for ${tool.id} in ${source.directory}`);
    version=matches[0].match[1];
    files=[join(directory,matches[0].name),...(source.extras||[]).map(name=>join(directory,name.replaceAll('{version}',version)))];
  }else{
    const bundleBase=source.bundleRoot?join(workspace,source.bundleRoot):workspace;
    const name=`EVFX-${tool.id}-${version||'snapshot'}.zip`;
    const file=join(output,name);
    const guide=`EVFX ${tool.name}${version?' '+version:''}\n\n${tool.detail}\n\nREQUIREMENTS\n${tool.requirements}\n\nINSTALLATION\n${tool.install}\n\nFor a native AEX: close After Effects, then copy the AEX into:\nC:\\Program Files\\Adobe\\Common\\Plug-ins\\7.0\\MediaCore\\EVFX\\\nCreate the EVFX folder if needed. Do not keep duplicate copies in other AE plug-in folders. Administrator permission may be needed. Restart AE.\n\nFor a JSX panel, use your After Effects Scripts/ScriptUI Panels folder, or File > Scripts > Run Script File.\n\nLatest releases: https://github.com/${catalog.repository}/releases\n`;
    run(process.env.PYTHON||'python',['-X','utf8',join(root,'scripts/bundle.py')],{input:JSON.stringify({base:bundleBase,output:file,files:source.files,preservePaths:!!source.bundleRoot,guide})});
    files=[file];
  }
  const assets=[];
  for(let i=0;i<files.length;i++){
    const path=files[i];
    const info=await stat(path);
    if(info.size>=2*1024**3)throw new Error(`Asset exceeds GitHub's 2 GiB limit: ${basename(path)}`);
    const sha256=digest(await readFile(path));
    assets.push({path,name:basename(path),bytes:info.size,sha256,primary:i===0});
  }
  const combined=digest(assets.map(a=>a.sha256).join('\n')).slice(0,10);
  const tag=`${tool.id}-${version?'v'+version:'snapshot'}-${combined}`;
  prepared.push({tool,version,assets,tag});
  console.log(`Prepared ${tool.id} ${version||'snapshot'} · ${assets.map(a=>`${(a.bytes/1e6).toFixed(2)} MB`).join(' + ')}`);
}
if(prepareOnly){console.log('Prepared packages only; no uploads or Git changes.');process.exit(0);}

const user=await github('/user');
const [owner,name]=catalog.repository.split('/');
if(user.login.toLowerCase()!==owner.toLowerCase())throw new Error(`Signed in as ${user.login}; publisher expects ${owner}`);
let repository=await github(`/repos/${catalog.repository}`,{allow404:true});
if(!repository){
  repository=await github('/user/repos',{method:'POST',body:{name,description:'Independent EVFX plugins, scripts, and utilities. Static GitHub Pages catalog and release downloads.',private:false,auto_init:false}});
  console.log(`Created public site repository ${repository.full_name}`);
}
if(repository.private)throw new Error('The site repository is private. A separate public repository is required for free GitHub Pages. No visibility was changed.');

// Seed a new repository before creating releases. Only the public site is staged.
const gitExists=await stat(join(root,'.git')).then(()=>true,()=>false);
if(!gitExists){
  run('git',['init','-b','main']);
  run('git',['remote','add','origin',repository.clone_url]);
}
const remote=run('git',['remote','get-url','origin']);
if(!remote.toLowerCase().endsWith(`github.com/${catalog.repository.toLowerCase()}.git`))throw new Error('Refusing to push to an unexpected Git remote.');
const commit=(message)=>run('git',['-c',`user.name=${user.name||user.login}`,'-c',`user.email=${user.id}+${user.login}@users.noreply.github.com`,'commit','-m',message]);
let hasHead=true;
try{run('git',['rev-parse','--verify','HEAD']);}catch{hasHead=false;}
if(!hasHead){run('git',['add','--','README.md']);commit('Create EVFX release and site repository');run('git',['push','-u','origin','main']);}

for(const item of prepared){
  const {tool,version,assets,tag}=item;
  const buildReadiness=getReadiness(tool,{tag,prerelease:false});
  let release=await github(`/repos/${catalog.repository}/releases/tags/${tag}`,{allow404:true});
  const metadata={id:tool.id,version,files:assets.map(({path,...asset})=>asset)};
  const notes=warningMarkdown(tool,{tag,prerelease:false})+`${tool.detail}\n\n### Requirements\n${tool.requirements}\n\n### Installation\n${tool.install}\n\n${tool.status==='preview'?'**Preview build.** Read the requirements and evaluate on a test shot.\n\n':''}${tool.status==='legacy'?'**Legacy build.** Smart Grain is the current tool for new work.\n\n':''}### SHA-256\n${assets.map(a=>`- \`${a.name}\`: \`${a.sha256}\``).join('\n')}\n\n<!-- evfx-release\n${JSON.stringify(metadata)}\n-->`;
  if(!release){
    release=await github(`/repos/${catalog.repository}/releases`,{method:'POST',body:{tag_name:tag,target_commitish:'main',name:`EVFX ${tool.name} — ${version||'snapshot'}`,body:notes,draft:true,prerelease:buildReadiness.state!=='reviewed',make_latest:'false'}});
  }else if(release.body!==notes){
    release=await github(`/repos/${catalog.repository}/releases/${release.id}`,{method:'PATCH',body:{body:notes,prerelease:buildReadiness.state!=='reviewed',make_latest:'false'}});
  }
  for(const asset of assets){
    const existing=release.assets.find(a=>a.name===asset.name);
    if(existing){
      if(existing.size!==asset.bytes||existing.digest&&existing.digest!==`sha256:${asset.sha256}`)throw new Error(`Existing release asset differs: ${asset.name}`);
      continue;
    }
    const uploadUrl=release.upload_url.replace(/\{.*$/,'')+`?name=${encodeURIComponent(asset.name)}`;
    const uploaded=await github(uploadUrl,{method:'POST',raw:await readFile(asset.path),headers:{'Content-Type':asset.name.endsWith('.zip')?'application/zip':'application/octet-stream'}});
    if(uploaded.digest&&uploaded.digest!==`sha256:${asset.sha256}`)throw new Error(`Uploaded checksum differs: ${asset.name}`);
    release.assets.push(uploaded);
    console.log(`Uploaded ${tool.id} / ${asset.name}`);
  }
  if(release.draft)release=await github(`/repos/${catalog.repository}/releases/${release.id}`,{method:'PATCH',body:{draft:false,make_latest:'false'}});
  // Publishing can return an abbreviated assets list; refresh it before locking.
  release=await github(`/repos/${catalog.repository}/releases/${release.id}`);
  locks[tool.id]=lockFromRelease(release,metadata);
  await writeFile(join(root,'releases.lock.json'),JSON.stringify(locks,null,2)+'\n');
  console.log(`Verified ${tool.id} ${version||'snapshot'}`);
}
run(process.execPath,['scripts/check.mjs','--require-downloads']);
console.log(run(process.execPath,['--test','tests/readiness.test.mjs']));
console.log(run(process.execPath,['scripts/build.mjs']));
run('git',['add','--','.gitignore','README.md','package.json','catalog.json','sources.json','releases.lock.json','src','scripts','tests','.github','Sync EVFX.cmd']);
if(run('git',['diff','--cached','--name-only']).trim()){
  commit('Publish latest EVFX catalog and release checksums');
  run('git',['push','-u','origin','main']);
}
const pages=await github(`/repos/${catalog.repository}/pages`,{allow404:true});
if(!pages)await github(`/repos/${catalog.repository}/pages`,{method:'POST',body:{build_type:'workflow'}});
else if(pages.build_type!=='workflow')throw new Error('Existing Pages configuration differs. It was preserved.');
await github(`/repos/${catalog.repository}/actions/workflows/pages.yml/dispatches`,{method:'POST',body:{ref:'main'}});
console.log(`Published release files. Pages deployment requested: https://${owner}.github.io/${name}/`);
