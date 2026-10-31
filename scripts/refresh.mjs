import { readFile,writeFile } from 'node:fs/promises';
import { dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allReleases,metadataFromRelease,lockFromRelease } from './github.mjs';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const catalog=JSON.parse(await readFile(join(root,'catalog.json'),'utf8'));
const known=new Map(catalog.tools.map(t=>[t.id,t]));
const releases=(await allReleases(catalog.repository)).filter(r=>!r.draft)
  .map(release=>({release,meta:metadataFromRelease(release)})).filter(x=>x.meta&&known.has(x.meta.id));
const lock={};
for(const tool of catalog.tools){
  const candidates=releases.filter(({release,meta})=>meta.id===tool.id
    &&(!release.prerelease||['preview','legacy'].includes(tool.status)));
  candidates.sort((a,b)=>{
    const av=/^\d+\.\d+\.\d+$/.test(a.meta.version||'')?a.meta.version.split('.').map(Number):null;
    const bv=/^\d+\.\d+\.\d+$/.test(b.meta.version||'')?b.meta.version.split('.').map(Number):null;
    if(av&&bv){for(let i=0;i<3;i++){if(av[i]!==bv[i])return bv[i]-av[i];}}
    if(av&&!bv)return -1;
    if(bv&&!av)return 1;
    return Date.parse(b.release.published_at)-Date.parse(a.release.published_at);
  });
  if(candidates.length){const {release,meta}=candidates[0];lock[tool.id]=lockFromRelease(release,meta);}
}
// Empty remote results never silently replace an established working catalog.
if(!Object.keys(lock).length)throw new Error('No EVFX release manifests found; existing lock was preserved.');
await writeFile(join(root,'releases.lock.json'),JSON.stringify(lock,null,2)+'\n');
console.log(`Refreshed ${Object.keys(lock).length} tools from GitHub Releases.`);
