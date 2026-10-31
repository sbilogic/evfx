import { dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadJson,saveJson } from './sync-files.mjs';
const script=fileURLToPath(import.meta.url),root=dirname(dirname(script));

if(process.argv.includes('--status')){
  console.log(JSON.stringify({mode:'after-build',backgroundHelper:'removed',sync:await loadJson(join(root,'.local/auto-sync-status.json'),null)},null,2));
}else if(process.argv.includes('--watch')){
  throw new Error('Continuous background sync has been removed. Use sync-after-build.mjs or Sync EVFX.cmd.');
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
