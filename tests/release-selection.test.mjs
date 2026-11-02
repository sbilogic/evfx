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

test('latest and reviewed downloads retain their own upload times despite later metadata edits',()=>{
  const old=release('1.0.0'),latest=release('2.0.0',{prerelease:true});
  old.assets[0].created_at='2026-10-30T18:25:03Z';
  latest.assets[0].created_at='2026-11-01T06:51:25Z';
  latest.assets[0].updated_at='2026-11-02T12:00:00Z';
  const lock=selectReleases(catalog,[old,latest]);
  assert.equal(lock.sample.downloads[0].uploadedAt,'2026-11-01T06:51:25Z');
  assert.equal(lock.sample.complete.downloads[0].uploadedAt,'2026-10-30T18:25:03Z');
  assert.equal(lock.sample.publishedAt,latest.published_at);
  const withoutAssetDate=selectReleases(catalog,[release('1.0.0')]);
  assert.equal(withoutAssetDate.sample.downloads[0].uploadedAt,undefined);
});
test('an explicit complete declaration needs runtime verification and the matching artifact hash',()=>{
  const ready={state:'complete',runtimeVerified:true,sha256:sha};
  const lock=selectReleases(catalog,[release('1.0.0'),release('2.0.0',{readiness:ready})]);
  assert.equal(lock.sample.complete.version,'2.0.0');
  const wrong=selectReleases(catalog,[release('1.0.0'),release('2.0.0',{readiness:{...ready,sha256:'b'.repeat(64)}})]);
  assert.equal(wrong.sample.complete.version,'1.0.0');
});
