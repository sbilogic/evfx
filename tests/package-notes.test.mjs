import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp,rm,utimes,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { packageNotes,projectNotes } from '../scripts/package-notes.mjs';

test('package notes follow the actual version and source notes cannot postdate the build',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'evfx-notes-'));
  try{
    const archive=join(dir,'release.zip');
    const code='import zipfile,sys; z=zipfile.ZipFile(sys.argv[1],"w"); z.writestr("CHANGELOG.md","# Tool 1.1.0\\n\\nNew build.\\n\\n# Tool 1.0.0\\n\\nPrevious build."); z.close()';
    const python=spawnSync('python',['-c',code,archive],{encoding:'utf8'});
    assert.equal(python.status,0,python.stderr);
    assert.deepEqual(packageNotes(archive,'1.0.0'),['Previous build.']);
    assert.deepEqual(packageNotes(archive,'2.0.0'),[]);
    const doc=join(dir,'CHANGELOG.md');
    await writeFile(doc,'# Tool 1.1.0\n\nCurrent notes.');
    await utimes(archive,new Date('2026-11-01T00:00:00Z'),new Date('2026-11-01T00:00:00Z'));
    await utimes(doc,new Date('2026-11-02T00:00:00Z'),new Date('2026-11-02T00:00:00Z'));
    assert.deepEqual(await projectNotes(dir,'1.1.0',archive),[]);
    await utimes(doc,new Date('2026-10-31T00:00:00Z'),new Date('2026-10-31T00:00:00Z'));
    assert.deepEqual(await projectNotes(dir,'1.1.0',archive),['Current notes.']);
  }finally{await rm(dir,{recursive:true,force:true});}
});
