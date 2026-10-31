import { readFile } from 'node:fs/promises';
import { dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { github } from './github.mjs';
import { getReadiness,warningMarkdown } from './readiness.mjs';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const catalog=JSON.parse(await readFile(join(root,'catalog.json'),'utf8'));
const lock=JSON.parse(await readFile(join(root,'releases.lock.json'),'utf8'));
for(const tool of catalog.tools){
  const locked=lock[tool.id];
  if(!locked)continue;
  const release=await github(`/repos/${catalog.repository}/releases/tags/${locked.tag}`);
  const current={...locked,prerelease:!!release.prerelease};
  const warning=warningMarkdown(tool,current);
  const body=warning+(release.body||'').replace(/<!-- evfx-warning-start -->[\s\S]*?<!-- evfx-warning-end -->\s*/g,'');
  const prerelease=getReadiness(tool,current).state!=='reviewed';
  if(body===release.body&&prerelease===release.prerelease)continue;
  await github(`/repos/${catalog.repository}/releases/${release.id}`,{method:'PATCH',body:{body,prerelease,make_latest:'false'}});
  console.log(`Updated ${tool.id}: ${prerelease?'warning + prerelease label':'reviewed release'}`);
}
