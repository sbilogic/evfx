import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncOnce } from './sync-engine.mjs';
import { publishLocal } from './publisher.mjs';
import { recordCompletedBuild } from './completed-build.mjs';
import { installBuildHooks } from './build-hooks.mjs';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
try{
  await installBuildHooks(root);
  const option=name=>{const index=process.argv.indexOf(name);return index<0?null:process.argv[index+1];};
  const artifact=option('--artifact'),project=option('--project');
  if(artifact){if(!project)throw new Error('--artifact requires --project');await recordCompletedBuild(root,project,artifact);}
  // The packaging command has finished. Run once, then release all resources.
  let result,changedAgain=0;
  const deadline=Date.now()+600000;
  do{
    result=await syncOnce(root,{force:true,publish:publishLocal});
    if(result.skipped&&Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,1000));continue;}
    if(result.phase==='settling'&&++changedAgain<=3)continue;
    break;
  }while(true);
  if(['idle','published'].includes(result.phase))console.log(`EVFX site: ${result.phase==='idle'?'already current':'updated'}.`);
  else {console.error(`EVFX site sync deferred: ${result.reason||result.phase||'another sync is running'}. It will retry on the next build.`);process.exitCode=1;}
}catch(error){console.error(`EVFX site sync failed: ${error.message}`);process.exitCode=1;}
