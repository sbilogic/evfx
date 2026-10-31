import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,readFile,rm,unlink } from 'node:fs/promises';
import { dirname,basename,resolve,join } from 'node:path';
import { tmpdir } from 'node:os';
import { installBuildHooks } from '../scripts/build-hooks.mjs';
import { spawnSync } from 'node:child_process';

test('existing and newly created EVFX projects get finite build hooks without duplicates',async()=>{
  const base=await mkdtemp(join(tmpdir(),'evfx-hooks-')),root=join(base,'collection','EVFX-Site');
  await mkdir(root,{recursive:true});
  await writeFile(join(root,'sync.config.json'),JSON.stringify({roots:[{id:'dev',path:'../..'}],excludedIds:['smart-denoise','match-grain']}));
  const project=join(base,'EVFX Probe');await mkdir(join(project,'tools'),{recursive:true});
  const cmake=join(project,'CMakeLists.txt');await writeFile(cmake,'add_library(EVFXProbe MODULE probe.c)\nset_target_properties(EVFXProbe PROPERTIES SUFFIX ".aex")\n');
  const python=join(project,'tools/package_addon.py');await writeFile(python,'print(\'{"packaged": true}\')\n');
  const javascript=join(project,'tools/build.mjs'),jsx=join(project,'new.jsx');
  await writeFile(javascript,`import {writeFile} from 'node:fs/promises';\nasync function main(){await new Promise(r=>setTimeout(r,30));await writeFile(${JSON.stringify(jsx)},'built');}\nmain();\n`);
  try{
    let installed=await installBuildHooks(root);assert.equal(installed.length,3);
    const first=await readFile(cmake,'utf8');assert.match(first,/evfx_site_after_builds\(/);
    await mkdir(join(root,'scripts'),{recursive:true});
    const marker=join(root,'hook-called.json');
    await writeFile(join(root,'scripts/sync-after-build.mjs'),`import{writeFileSync}from'node:fs';writeFileSync(${JSON.stringify(marker)},'called');`);
    const packaged=spawnSync(process.env.EVFX_PYTHON||'python',[python],{encoding:'utf8',windowsHide:true});
    assert.equal(packaged.status,0,packaged.stderr);assert.deepEqual(JSON.parse(packaged.stdout),{packaged:true});assert.equal(await readFile(marker,'utf8'),'called');
    await writeFile(join(root,'scripts/sync-after-build.mjs'),`import{existsSync,writeFileSync}from'node:fs';if(!existsSync(${JSON.stringify(jsx)}))throw Error('Build output not ready');writeFileSync(${JSON.stringify(marker)},'after output');`);
    const built=spawnSync(process.execPath,[javascript],{encoding:'utf8',windowsHide:true});
    assert.equal(built.status,0,built.stderr);assert.equal(await readFile(marker,'utf8'),'after output');
    await unlink(marker);await writeFile(javascript,(await readFile(javascript,'utf8')).replace('main();','process.exitCode=1;'));
    assert.equal(spawnSync(process.execPath,[javascript],{windowsHide:true}).status,1);await assert.rejects(readFile(marker),{code:'ENOENT'});
    await installBuildHooks(root);assert.equal(await readFile(cmake,'utf8'),first);
    const newer=join(base,'EVFX Fresh');await mkdir(newer);await writeFile(join(newer,'package.ps1'),'Write-Output "Packaged"\n');
    installed=await installBuildHooks(root);assert.equal(installed.length,4);assert.match(await readFile(join(newer,'package.ps1'),'utf8'),/AfterBuild.ps1/);
    await installBuildHooks(root,{remove:true});assert(!((await readFile(cmake,'utf8')).includes('EVFX site hook')));
    assert(!((await readFile(python,'utf8')).includes('EVFX site hook')));
  }finally{assert.equal(dirname(resolve(base)),resolve(tmpdir()));assert.match(basename(base),/^evfx-hooks-/);await rm(base,{recursive:true,force:true});}
});
