import { watch } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { resolve,join,sep } from 'node:path';
import { loadJson } from './sync-files.mjs';
import { sourcePath } from './local-plugins.mjs';

const normalize=value=>String(value).replace(/^evfx[\s_-]*/i,'').replace(/[^a-z0-9]/gi,'').toLowerCase();
const key=path=>process.platform==='win32'?path.toLowerCase():path;
const entries=async path=>readdir(path,{withFileTypes:true}).catch(error=>{if(error.code==='ENOENT')return [];throw error;});
const ignored=/^(?:\.git|\.local|node_modules|__pycache__|\.venv|venv|target|debug|archive|archives|backup|backups)$/i;
const nativeDirs=new Set(['','release','dist','build/release','build/dist','build-aex/release','build-aex-version-fix/release','plugin/build/release']);

/** Listen for local build changes. No interval, idle scans, or network activity. */
export async function watchLocalBuilds(root,{sync,onState=async()=>{},onError=async()=>{}}){
  const watchers=new Map();
  let config,inputs=[],excluded=new Set(),closed=false,running=false,dirty=false,timer;
  let finish;
  const done=new Promise(resolve=>{finish=resolve;});
  const settleMs=()=>Math.max(10,Number(config?.settleSeconds??30)*1000);
  const close=()=>{closed=true;clearTimeout(timer);for(const watcher of watchers.values())watcher.close();watchers.clear();finish();};
  const request=(delay=settleMs())=>{
    if(closed)return;
    dirty=true;clearTimeout(timer);
    if(!running)timer=setTimeout(run,delay);
  };
  function relevant(project,filename){
    if(!filename)return true;
    let parts=String(filename).split(/[\\/]/);
    if(parts.some(part=>ignored.test(part)))return false;
    if(parts[0]?.toLowerCase()==='plugins'&&/^evfx/i.test(parts[1]||'')){
      if(excluded.has(normalize(parts[1])))return false;
      parts=parts.slice(2);
    }
    const absolute=key(resolve(project,String(filename)));
    if(inputs.some(input=>absolute===input||absolute.startsWith(input+sep)))return true;
    const name=parts.at(-1)||'',directory=parts.slice(0,-1).join('/').toLowerCase();
    if(parts.length===1&&/^(?:evfx-release\.json|readme\.md|package\.json|cmakelists\.txt|cargo\.toml)$/i.test(name))return true;
    // Catch packages copied into a newly created directory before recursive watches attach.
    if(!name.includes('.')&&(nativeDirs.has(parts.join('/').toLowerCase())||/^(?:release|releases|dist)$/i.test(parts[0]||'')&&parts.length<=3))return true;
    if(/\.(aex|jsx)$/i.test(name)&&nativeDirs.has(directory))return true;
    return /^(?:release|releases|dist)$/i.test(parts[0]||'')&&parts.length<=4&&/\.(zip|exe)$/i.test(name);
  }
  async function reconcile(){
    config=await loadJson(join(root,'sync.config.json'));
    if(config.enabled===false){close();return;}
    excluded=new Set(config.excludedIds.map(normalize));
    const sources=await loadJson(join(root,'sources.json'));
    inputs=Object.values(sources).flatMap(source=>{
      const paths=source.artifacts||source.files||[];
      return paths.map(path=>key(sourcePath(root,config,source,source.bundleRoot?join(source.bundleRoot,path):path)));
    });
    const scopes=new Map();
    for(const configured of config.roots){
      const directory=resolve(root,configured.path);
      scopes.set(directory,{kind:'root'});
      for(const entry of await entries(directory)){
        const path=join(directory,entry.name);
        if(!entry.isDirectory()||entry.isSymbolicLink()||!/^evfx/i.test(entry.name)||key(path)===key(root)||/^evfx collection$/i.test(entry.name)||excluded.has(normalize(entry.name)))continue;
        scopes.set(path,{kind:'project'});
      }
    }
    scopes.set(root,{kind:'site'});
    scopes.set(join(root,'.git'),{kind:'git'});
    scopes.set(join(root,'.git/refs/heads'),{kind:'commit'});
    for(const [path,watcher] of watchers)if(!scopes.has(path)){watcher.close();watchers.delete(path);}
    for(const [path,scope] of scopes){
      if(watchers.has(path))continue;
      try{
        const watcher=watch(path,{recursive:scope.kind==='project'||scope.kind==='commit'},(event,filename)=>{
          const name=String(filename||'');
          if(scope.kind==='project'&&relevant(path,filename))request();
          if(scope.kind==='root'&&event==='rename'&&(!filename||/^evfx/i.test(name)&&!/^evfx collection$/i.test(name)&&!excluded.has(normalize(name))&&key(join(path,name))!==key(root)))request();
          if(scope.kind==='site'&&/^(?:sync\.config|catalog|sources)\.json$/i.test(name))request();
          // A commit can release a publication deferred while site code was edited.
          if(scope.kind==='git'&&/^(?:index|HEAD|COMMIT_EDITMSG)$/i.test(name))request();
          if(scope.kind==='commit')request();
        });
        watcher.on('error',error=>{watcher.close();watchers.delete(path);void onError(error);request();});
        watchers.set(path,watcher);
      }catch(error){if(error.code!=='ENOENT')throw error;}
    }
    await onState({mode:'filesystem-events',watchedProjects:[...scopes.values()].filter(s=>s.kind==='project').length});
  }
  async function run(refresh=true){
    if(closed)return;
    running=true;dirty=false;
    try{
      if(refresh)await reconcile();
      if(closed)return;
      const result=await sync();
      // A changed build needs a second stable observation, never an idle poll.
      if(result?.phase==='settling')dirty=true;
    }catch(error){await onError(error);}
    finally{running=false;if(dirty&&!closed)request();}
  }
  try{await reconcile();await run(false);}catch(error){close();throw error;}
  return {close,done};
}
