import { dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { loadJson,saveJson,withLock } from './sync-files.mjs';
const script=fileURLToPath(import.meta.url),root=dirname(dirname(script));

if(process.argv.includes('--status')){
  console.log(JSON.stringify({runner:await loadJson(join(root,'.local/runner.json'),null),sync:await loadJson(join(root,'.local/auto-sync-status.json'),null)},null,2));
}else if(process.argv.includes('--watch')){
  await withLock(join(root,'.local/runner.lock'),async()=>{
    await saveJson(join(root,'.local/runner.json'),{pid:process.pid,script,startedAt:new Date().toISOString()});
    while(true){
      const config=await loadJson(join(root,'sync.config.json'));
      if(config.enabled===false)break;
      await new Promise(resolve=>{
        const child=spawn(process.execPath,[script,'--once'],{cwd:root,windowsHide:true,stdio:'ignore',env:{...process.env,EVFX_SYNC_RUNNER_PID:String(process.pid)}});
        child.on('error',resolve);child.on('close',resolve);
      });
      await new Promise(resolve=>setTimeout(resolve,Math.max(10,config.intervalSeconds)*1000));
    }
  });
}else{
  const {syncOnce,logSync}=await import('./sync-engine.mjs');
  const {publishLocal}=await import('./publisher.mjs');
  try{
    const result=await syncOnce(root,{force:process.argv.includes('--force'),publish:publishLocal});
    if(!['idle','settling'].includes(result.phase))await logSync(root,JSON.stringify(result));
    console.log(JSON.stringify(result));
  }catch(error){
    await saveJson(join(root,'.local/auto-sync-status.json'),{phase:'error',checkedAt:new Date().toISOString(),error:error.message});
    await logSync(root,error.message);console.error(error.message);process.exitCode=1;
  }
}
