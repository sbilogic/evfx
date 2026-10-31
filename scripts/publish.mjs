import { publishLocal } from './publisher.mjs';
const only=process.argv.find(a=>a.startsWith('--only='))?.slice(7).split(',');
const result=await publishLocal({prepareOnly:process.argv.includes('--prepare-only'),automatic:process.argv.includes('--automatic'),only});
console.log(JSON.stringify(result));
if(result.skipped)process.exitCode=2;
