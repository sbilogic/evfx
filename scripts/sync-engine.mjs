import { join } from 'node:path';
import { appendFile,readFile,writeFile,stat } from 'node:fs/promises';
import { discoverLocalPlugins } from './local-plugins.mjs';
import { loadJson,saveJson,withLock } from './sync-files.mjs';

export async function syncOnce(root,{force=false,publish,now=()=>Date.now()}={}){
  return withLock(join(root,'.local/scan.lock'),async()=>{
    const config=await loadJson(join(root,'sync.config.json'));
    if(config.enabled===false&&!force)return {phase:'disabled'};
    const state=await loadJson(join(root,'.local/sync-state.json'),{});
    const catalog=await loadJson(join(root,'catalog.json')),sources=await loadJson(join(root,'sources.json'));
    const scan=await discoverLocalPlugins(root,{catalog,sources,config});
    const checkedAt=new Date(now()).toISOString();
    const record=async result=>{
      await saveJson(join(root,'.local/auto-sync-status.json'),{...result,checkedAt,lastPublishedAt:state.lastPublishedAt??null,runnerPid:Number(process.env.EVFX_SYNC_RUNNER_PID)||null});
      return result;
    };
    if(scan.issues.length)return record({phase:'deferred',reason:scan.issues.join('; ')});
    if(state.fingerprint===scan.fingerprint)return record({phase:'idle',tools:scan.catalog.tools.length});
    const settleMs=config.settleSeconds*1000;
    if(!force&&(state.pendingFingerprint!==scan.fingerprint||now()-(state.pendingSince||now())<settleMs||scan.observations.some(file=>now()-file.mtime<settleMs))){
      if(state.pendingFingerprint!==scan.fingerprint){state.pendingSince=now();state.pendingFingerprint=scan.fingerprint;}
      await saveJson(join(root,'.local/sync-state.json'),state);
      return record({phase:'settling',reason:'Waiting for completed build files'});
    }
    const changedIds=Object.keys(scan.toolFingerprints).filter(id=>scan.toolFingerprints[id]!==state.toolFingerprints?.[id]);
    await record({phase:'publishing',changedIds});
    const result=await publish({automatic:true,only:changedIds,expectedFingerprint:scan.fingerprint});
    if(result.skipped)return record({phase:'deferred',reason:result.reason});
    const after=await discoverLocalPlugins(root,{config,catalog:await loadJson(join(root,'catalog.json')),sources:await loadJson(join(root,'sources.json'))});
    // Never lose a change arriving while an earlier snapshot was uploading.
    if(JSON.stringify(scan.observations)!==JSON.stringify(after.observations)){
      return record({phase:'settling',reason:'Another build arrived during publication'});
    }
    state.fingerprint=after.fingerprint;state.toolFingerprints=after.toolFingerprints;
    state.lastPublishedAt=checkedAt;delete state.pendingFingerprint;delete state.pendingSince;
    await saveJson(join(root,'.local/sync-state.json'),state);
    return record({phase:'published',changedIds,tools:after.catalog.tools.length});
  });
}

export async function logSync(root,message){
  const path=join(root,'.local/auto-sync.log');
  const info=await stat(path).catch(()=>null);
  if(info?.size>200000){const tail=(await readFile(path,'utf8')).slice(-60000);await writeFile(path,tail);}
  await appendFile(path,`${new Date().toISOString()} ${message}\n`);
}
