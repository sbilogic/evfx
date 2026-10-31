import { compareVersions } from './local-plugins.mjs';
import { getReadiness } from './readiness.mjs';
import { lockFromRelease,metadataFromRelease } from './github.mjs';

export function selectReleases(catalog,releases){
  const lock={};
  for(const tool of catalog.tools){
    const candidates=releases.filter(r=>!r.draft).map(release=>({release,meta:metadataFromRelease(release)}))
      .filter(x=>x.meta?.id===tool.id)
      .sort((a,b)=>compareVersions(b.meta.version,a.meta.version)||Date.parse(b.release.published_at)-Date.parse(a.release.published_at));
    if(!candidates.length)continue;
    const latest=lockFromRelease(candidates[0].release,candidates[0].meta);
    const complete=candidates.map(x=>lockFromRelease(x.release,x.meta)).find(r=>getReadiness(tool,r).state==='reviewed');
    lock[tool.id]={...latest,...(complete?{complete}: {})};
  }
  return lock;
}
