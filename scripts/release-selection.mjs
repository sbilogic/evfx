import { compareVersions } from './local-plugins.mjs';
import { getReadiness } from './readiness.mjs';
import { lockFromRelease,metadataFromRelease } from './github.mjs';
import { releaseHistory } from './release-history.mjs';

export function selectReleases(catalog,releases,backfill={}){
  const lock={};
  const core=version=>version?.split('-')[0]??null;
  for(const tool of catalog.tools){
    const candidates=releases.filter(r=>!r.draft).map(release=>({release,meta:metadataFromRelease(release)}))
      .filter(x=>x.meta?.id===tool.id)
      .sort((a,b)=>compareVersions(core(b.meta.version),core(a.meta.version))||Date.parse(b.release.published_at)-Date.parse(a.release.published_at)||compareVersions(b.meta.version,a.meta.version));
    if(!candidates.length)continue;
    const latest=lockFromRelease(candidates[0].release,candidates[0].meta);
    const complete=candidates.map(x=>lockFromRelease(x.release,x.meta)).find(r=>getReadiness(tool,r).state==='reviewed');
    lock[tool.id]={...latest,...(complete?{complete}: {}),history:releaseHistory(candidates,backfill)};
  }
  return lock;
}
