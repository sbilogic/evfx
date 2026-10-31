import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,dirname,basename,resolve } from 'node:path';
import { syncOnce } from '../scripts/sync-engine.mjs';
import { discoverLocalPlugins } from '../scripts/local-plugins.mjs';
import { loadJson,saveJson } from '../scripts/sync-files.mjs';

test('auto sync waits for stable files, publishes changes once, and stays idle afterward',async()=>{
  const base=await mkdtemp(join(tmpdir(),'evfx-auto-')),root=join(base,'collection','EVFX-Site');
  await mkdir(root,{recursive:true});
  const config={roots:[{id:'collection',path:'..'},{id:'dev',path:'../..'}],excludedIds:['smart-denoise','match-grain'],settleSeconds:30,intervalSeconds:60};
  await saveJson(join(root,'sync.config.json'),config);
  await saveJson(join(root,'catalog.json'),{repository:'example/evfx',title:'EVFX',tools:[]});await saveJson(join(root,'sources.json'),{});
  const releaseDir=join(base,'EVFX Probe','release');await mkdir(releaseDir,{recursive:true});
  const artifact=join(releaseDir,'EVFX-Probe-1.0.0-Windows.zip');await writeFile(artifact,'first build');
  let clock=Date.now()+100000,calls=0;
  const publish=async options=>{
    calls++;assert.deepEqual(options.only,['probe']);
    const discovered=await discoverLocalPlugins(root,{config,catalog:await loadJson(join(root,'catalog.json')),sources:await loadJson(join(root,'sources.json'))});
    await saveJson(join(root,'catalog.json'),discovered.catalog);await saveJson(join(root,'sources.json'),discovered.sources);
    return {published:true};
  };
  try{
    assert.equal((await syncOnce(root,{publish,now:()=>clock})).phase,'settling');
    clock+=10000;assert.equal((await syncOnce(root,{publish,now:()=>clock})).phase,'settling');assert.equal(calls,0);
    clock+=31000;assert.equal((await syncOnce(root,{publish,now:()=>clock})).phase,'published');assert.equal(calls,1);
    clock+=60000;assert.equal((await syncOnce(root,{publish,now:()=>clock})).phase,'idle');assert.equal(calls,1);
    await writeFile(artifact,'updated build with changed bytes');
    clock+=60000;assert.equal((await syncOnce(root,{publish,now:()=>clock})).phase,'settling');
    clock+=31000;assert.equal((await syncOnce(root,{publish,now:()=>clock})).phase,'published');assert.equal(calls,2);
  }finally{assert.equal(dirname(resolve(base)),resolve(tmpdir()));assert.match(basename(base),/^evfx-auto-/);await rm(base,{recursive:true,force:true});}
});
