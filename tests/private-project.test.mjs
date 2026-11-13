import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { remapPrivateProject } from '../scripts/private-project.mjs';

test('moving a private project follows its build without changing external dependencies', () => {
  const old = join(process.cwd(),'old project'), next = join(process.cwd(),'renamed project');
  const external = join(process.cwd(),'shared','dependency.dll');
  const source = {projectRoot:old,versionFile:join(old,'source','version.txt'),
    recipe:{files:[{from:join(old,'release','plugin.aex'),to:'plugin.aex'},{from:external,to:'dependency.dll'}]}};
  const result = remapPrivateProject(source,next);
  assert.equal(result.versionFile,join(next,'source','version.txt'));
  assert.equal(result.recipe.files[0].from,join(next,'release','plugin.aex'));
  assert.equal(result.recipe.files[1].from,external);
  assert.equal(source.projectRoot,old);
});
