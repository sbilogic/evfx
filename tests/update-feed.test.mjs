import test from 'node:test';
import assert from 'node:assert/strict';
import { sequencerUpdateFeed } from '../scripts/update-feed.mjs';

const catalog = { tools:[{id:'sequencer'}] };
const make = (version='0.9.0') => {
  const filename=`EVFX-Sequencer-${version}-Windows-x64-Setup.exe`;
  return {version,tag:`sequencer-v${version}`,publishedAt:'2026-11-04T10:00:00Z',
    releaseUrl:`https://github.com/sbilogic/evfx/releases/tag/sequencer-v${version}`,prerelease:false,
    review:{state:'complete',runtimeVerified:true,sha256:'a'.repeat(64)},
    downloads:[{primary:true,name:filename,url:`https://github.com/sbilogic/evfx/releases/download/sequencer-v${version}/${filename}`,bytes:180000000,sha256:'a'.repeat(64)}]};
};
test('stable update feed contains an immutable reviewed installer and exact digest/size',()=>{
  const feed=sequencerUpdateFeed(catalog,{sequencer:make()});
  assert.equal(feed.product,'evfx-sequencer');assert.equal(feed.schema_version,1);
  assert.equal(feed.release.version,'0.9.0');assert.equal(feed.release.sha256,'a'.repeat(64));
  assert.equal(feed.release.bytes,180000000);
});
test('an unverified new build keeps the last reviewed update, never the development asset',()=>{
  const latest=make('0.10.0'); latest.review.runtimeVerified=false;latest.complete=make('0.9.0');
  assert.equal(sequencerUpdateFeed(catalog,{sequencer:latest}).release.version,'0.9.0');
});
test('missing reviews, prereleases and changed hashes cannot enter automatic updates',()=>{
  for(const mutate of [r=>delete r.review,r=>r.prerelease=true,r=>r.downloads[0].sha256='b'.repeat(64)]){
    const r=make();mutate(r);assert.equal(sequencerUpdateFeed(catalog,{sequencer:r}).release,null);
  }
  assert.equal(sequencerUpdateFeed(catalog,{sequencer:make('0.9.0-beta.1')}).release,null);
});
test('legacy tag reviews cannot replace an exact package review; malformed URLs do not break the feed',()=>{
  const r=make();delete r.review;
  assert.equal(sequencerUpdateFeed({tools:[{id:'sequencer',readiness:{state:'reviewed',releaseTag:r.tag}}]},{sequencer:r}).release,null);
  const broken=make('0.10.0');broken.downloads[0].url='invalid URL';broken.complete=make();
  assert.equal(sequencerUpdateFeed(catalog,{sequencer:broken}).release.version,'0.9.0');
});
test('foreign hosts, repositories, portable archives, credentials and unbounded packages are excluded',()=>{
  for(const mutate of [r=>r.downloads[0].url=r.downloads[0].url.replace('github.com','example.com'),
      r=>r.downloads[0].url=r.downloads[0].url.replace('/sbilogic/','/other/'),
      r=>r.downloads[0].name='portable.zip',r=>r.downloads[0].bytes=1073741825,
      r=>r.downloads[0].url=r.downloads[0].url.replace('https://','https://user:pass@')]){
    const r=make();mutate(r);assert.equal(sequencerUpdateFeed(catalog,{sequencer:r}).release,null);
  }
});
