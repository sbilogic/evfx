import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/package-private.py', import.meta.url));
test('private packaging keeps selected files and produces deterministic archives', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'evfx-private-package-'));
  try {
    await mkdir(join(temp, 'assets'));
    await writeFile(join(temp, 'assets', 'sample.txt'), 'included');
    await writeFile(join(temp, 'binary.aex'), 'built binary');
    const recipe = {
      output:join(temp, 'out.zip'),
      files:[{from:join(temp, 'binary.aex'),to:'Tool/binary.aex'}],
      directories:[{from:join(temp, 'assets'),to:'Tool/assets'}],
      text:[{to:'Tool/README.txt',text:'Read me'}]
    };
    const run = () => spawnSync('python', [script], {input:JSON.stringify(recipe), encoding:'utf8'});
    let result = run();
    assert.equal(result.status, 0, result.stderr);
    const first = await readFile(recipe.output);
    result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(await readFile(recipe.output), first);
    const inspect = spawnSync('python', ['-c',
      'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert set(z.namelist())=={"Tool/binary.aex","Tool/assets/sample.txt","Tool/README.txt"}; assert z.read("Tool/binary.aex")==b"built binary"',
      recipe.output], {encoding:'utf8'});
    assert.equal(inspect.status, 0, inspect.stderr);
    recipe.files[0].to = '../escape.aex';
    assert.notEqual(run().status, 0);
  } finally { await rm(temp, {recursive:true,force:true}); }
});

test('verification for an older binary is clearly marked when a private build changes', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'evfx-private-review-'));
  try {
    const template = join(temp, 'template.zip'), binary = join(temp, 'binary.aex'), output = join(temp, 'out.zip');
    const make = spawnSync('python', ['-c',
      'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1],"w"); z.writestr("Tool/Verification.txt","original review"); z.close()',
      template], {encoding:'utf8'});
    assert.equal(make.status, 0, make.stderr);
    await writeFile(binary, 'updated binary');
    const recipe = {output,template,files:[{from:binary,to:'Tool/binary.aex'}],
      verification:{binary,sha256:'0'.repeat(64),entry:'Tool/Verification.txt'}};
    const result = spawnSync('python', [script], {input:JSON.stringify(recipe), encoding:'utf8'});
    assert.equal(result.status, 0, result.stderr);
    const inspect = spawnSync('python', ['-c',
      'import sys,zipfile; text=zipfile.ZipFile(sys.argv[1]).read("Tool/Verification.txt").decode(); assert "WARNING" in text and "original review" in text',
      output], {encoding:'utf8'});
    assert.equal(inspect.status, 0, inspect.stderr);
  } finally { await rm(temp, {recursive:true,force:true}); }
});
