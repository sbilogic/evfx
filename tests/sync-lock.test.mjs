import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { dirname,basename,resolve,join } from 'node:path';
import { tmpdir } from 'node:os';
import { withLock } from '../scripts/sync-files.mjs';
test('overlapping background/manual runs cannot publish concurrently',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'evfx-lock-'));
  let started,finish;
  const ready=new Promise(r=>{started=r;}),hold=new Promise(r=>{finish=r;});
  try{
    const first=withLock(join(dir,'publisher.lock'),async()=>{started();await hold;return 'first completed';});
    await ready;
    const second=await withLock(join(dir,'publisher.lock'),()=>{throw new Error('Concurrent publisher started');});
    assert.equal(second.skipped,true);finish();assert.equal(await first,'first completed');
  }finally{finish();assert.equal(dirname(resolve(dir)),resolve(tmpdir()));assert.match(basename(dir),/^evfx-lock-/);await rm(dir,{recursive:true,force:true});}
});
