import test from 'node:test';
import assert from 'node:assert/strict';
import { selectReleases } from '../scripts/release-selection.mjs';
const sha='a'.repeat(64);
const catalog={tools:[{id:'sample',readiness:{state:'reviewed',releaseTag:'sample-1.0.0'}}]};
function release(version,{prerelease=false,readiness}={}){
  const name=`sample-${version}.zip`,meta={id:'sample',version,files:[{name,bytes:123,sha256:sha,primary:true}],...(readiness?{readiness}:{})};
  return {tag_name:`sample-${version}`,published_at:'2026-10-31T00:00:00Z',draft:false,prerelease,
    body:`<!-- evfx-release\n${JSON.stringify(meta)}\n-->`,html_url:`https://github.com/example/evfx/releases/tag/sample-${version}`,
    assets:[{name,size:123,state:'uploaded',digest:`sha256:${sha}`,browser_download_url:`https://github.com/example/evfx/releases/download/sample-${version}/${name}`}]};
}
test('an unverified update preserves the last reviewed download for the complete view',()=>{
  const lock=selectReleases(catalog,[release('1.0.0'),release('2.0.0',{prerelease:true})]);
  assert.equal(lock.sample.version,'2.0.0');
  assert.equal(lock.sample.complete.version,'1.0.0');
});
test('a stable-looking filename alone cannot make an update complete',()=>{
  const lock=selectReleases(catalog,[release('1.0.0'),release('2.0.0')]);
  assert.equal(lock.sample.complete.version,'1.0.0');
});
test('an explicit complete declaration needs runtime verification and the matching artifact hash',()=>{
  const ready={state:'complete',runtimeVerified:true,sha256:sha};
  const lock=selectReleases(catalog,[release('1.0.0'),release('2.0.0',{readiness:ready})]);
  assert.equal(lock.sample.complete.version,'2.0.0');
  const wrong=selectReleases(catalog,[release('1.0.0'),release('2.0.0',{readiness:{...ready,sha256:'b'.repeat(64)}})]);
  assert.equal(wrong.sample.complete.version,'1.0.0');
});
