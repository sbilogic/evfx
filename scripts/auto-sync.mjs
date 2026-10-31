import { dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { loadJson,saveJson,withLock } from './sync-files.mjs';
const script=fileURLToPath(import.meta.url),root=dirname(dirname(script));

if(process.argv.includes('--status')){
  console.log(JSON.stringify({runner:await loadJson(join(root,'.local/runner.json'),null),sync:await loadJson(join(root,'.local/auto-sync-status.json'),null)},null,2));
}else if(process.argv.includes('--watch')){
  await withLock(join(root,'.local/runner.lock'),async()=>{
    const {watchLocalBuilds}=await import('./build-watcher.mjs');
    const {logSync}=await import('./sync-engine.mjs');
    const runner={pid:process.pid,script,startedAt:new Date().toISOString()};
    const watcher=await watchLocalBuilds(root,{
      onState:state=>saveJson(join(root,'.local/runner.json'),{...runner,...state}),
      onError:error=>logSync(root,`File watcher: ${error.message}`),
      sync:()=>new Promise(resolve=>{
        const child=spawn(process.execPath,[script,'--once'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','ignore'],env:{...process.env,EVFX_SYNC_RUNNER_PID:String(process.pid)}});
        let output='';child.stdout.on('data',chunk=>{output=(output+chunk).slice(-100000);});
        child.on('error',error=>resolve({phase:'error',error:error.message}));
        child.on('close',()=>{try{resolve(JSON.parse(output.trim().split(/\r?\n/).at(-1)));}catch{resolve({phase:'error'});}});
      })
    });
    process.once('SIGINT',watcher.close);process.once('SIGTERM',watcher.close);
    await watcher.done;
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
