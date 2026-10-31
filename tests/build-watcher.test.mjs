import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,rm } from 'node:fs/promises';
import { dirname,basename,resolve,join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { watchLocalBuilds } from '../scripts/build-watcher.mjs';
import { saveJson } from '../scripts/sync-files.mjs';

async function fixture(){
  const base=await mkdtemp(join(tmpdir(),'evfx-watch-')),root=join(base,'collection','EVFX-Site');
  await mkdir(root,{recursive:true});
  const config={roots:[{id:'collection',path:'..'},{id:'dev',path:'../..'}],excludedIds:['smart-denoise','match-grain'],settleSeconds:0.03};
  await saveJson(join(root,'sync.config.json'),config);await saveJson(join(root,'sources.json'),{});
  const project=join(base,'EVFX Probe');await mkdir(join(project,'release'),{recursive:true});
  return {root,project,config,async cleanup(){assert.equal(dirname(resolve(base)),resolve(tmpdir()));assert.match(basename(base),/^evfx-watch-/);await rm(base,{recursive:true,force:true});}};
}
function calls(){
  let count=0;const pending=[];
  return {get count(){return count;},next(){count++;for(const waiter of pending)if(count>=waiter.target)waiter.resolve();},until(target){return count>=target?Promise.resolve():new Promise(resolve=>pending.push({target,resolve}));}};
}

test('file notifications trigger builds and new folders, while idle and source changes do not scan',{timeout:5000},async()=>{
  const f=await fixture(),seen=calls(),errors=[];
  const watcher=await watchLocalBuilds(f.root,{sync:async()=>{seen.next();return {phase:'idle'};},onError:async error=>errors.push(error)});
  try{
    assert.equal(seen.count,1);
    await writeFile(join(f.project,'source.cpp'),'source only');
    await delay(120);assert.equal(seen.count,1);
    const build=join(f.project,'release','EVFX-Probe-1.0.0.zip');
    await writeFile(build,'building');await writeFile(build,'finished');
    await seen.until(2);await delay(120);assert.equal(seen.count,2);
    const next=join(dirname(dirname(f.root)),'EVFX Fresh');await mkdir(next);
    await seen.until(3);
    await mkdir(join(next,'dist'));await writeFile(join(next,'dist','EVFX-Fresh-1.0.0.zip'),'new plugin');
    await seen.until(4);await delay(120);assert.equal(seen.count,4);
    assert.deepEqual(errors,[]);
  }finally{watcher.close();await watcher.done;await f.cleanup();}
});

test('only a pending build gets a settling check, and disabling closes the watcher',{timeout:5000},async()=>{
  const f=await fixture(),seen=calls();
  const watcher=await watchLocalBuilds(f.root,{sync:async()=>{seen.next();return {phase:seen.count===1?'settling':'idle'};}});
  try{
    await seen.until(2);await delay(120);assert.equal(seen.count,2);
    await saveJson(join(f.root,'sync.config.json'),{...f.config,enabled:false});
    await watcher.done;assert.equal(seen.count,2);
  }finally{watcher.close();await f.cleanup();}
});
