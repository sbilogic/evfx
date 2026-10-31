import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncOnce } from './sync-engine.mjs';
import { publishLocal } from './publisher.mjs';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
try{
  // The packaging command has finished. Run once, then release all resources.
  const result=await syncOnce(root,{force:true,publish:publishLocal});
  if(['idle','published'].includes(result.phase))console.log(`EVFX site: ${result.phase==='idle'?'already current':'updated'}.`);
  else {console.error(`EVFX site sync deferred: ${result.reason||result.phase||'another sync is running'}. Use Sync EVFX.cmd to retry.`);process.exitCode=1;}
}catch(error){console.error(`EVFX site sync failed: ${error.message}`);process.exitCode=1;}
