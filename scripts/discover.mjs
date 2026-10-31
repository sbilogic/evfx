import { dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadJson,saveJson } from './sync-files.mjs';
import { discoverLocalPlugins } from './local-plugins.mjs';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const result=await discoverLocalPlugins(root,{config:await loadJson(join(root,'sync.config.json')),catalog:await loadJson(join(root,'catalog.json')),sources:await loadJson(join(root,'sources.json'))});
if(result.issues.length)throw new Error(result.issues.join('\n'));
if(process.argv.includes('--write')){
  await saveJson(join(root,'catalog.json'),result.catalog);await saveJson(join(root,'sources.json'),result.sources);
  const releases=await loadJson(join(root,'releases.lock.json'));
  for(const id of Object.keys(releases))if(!result.catalog.tools.some(t=>t.id===id))delete releases[id];
  await saveJson(join(root,'releases.lock.json'),releases);
}
console.log(JSON.stringify({tools:result.catalog.tools.map(t=>({id:t.id,name:t.name,version:result.sources[t.id]?.version??null})),observedFiles:result.observations.length,fingerprint:result.fingerprint},null,2));
