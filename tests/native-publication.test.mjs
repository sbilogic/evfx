import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,readFile,rm } from 'node:fs/promises';
import { dirname,basename,resolve,join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const site=dirname(dirname(fileURLToPath(import.meta.url)));
const python=process.env.EVFX_PYTHON||'python';
const run=(cmd,args,input)=>{const r=spawnSync(cmd,args,{input,encoding:'utf8',windowsHide:true,timeout:90000,env:{...process.env,MSBUILDDISABLENODEREUSE:'1'}});assert.equal(r.status,0,r.error?.message||r.stderr+r.stdout);return r.stdout;};
const cleanup=async base=>{assert.equal(dirname(resolve(base)),resolve(tmpdir()));assert.match(basename(base),/^evfx-native-/);await rm(base,{recursive:true,force:true});};

test('native package updates preserve install assets, update companion scripts and remain deterministic',async()=>{
  const base=await mkdtemp(join(tmpdir(),'evfx-native-'));
  try{
    const template=join(base,'old.zip');
    run(python,['-c','import json,sys,zipfile\np=json.load(sys.stdin)\nwith zipfile.ZipFile(p["path"],"w") as z:\n for n,v in p["files"].items():z.writestr(n,v)'],JSON.stringify({path:template,files:{'Delivery/OldName.aex':'old binary','Delivery/runtime.jsx':'old script','Delivery/examples/runtime.jsx':'historical script','Delivery/Install.cmd':'keep installer','Delivery/presets.json':'keep presets','Delivery/LICENSE':'keep licence'}}));
    await writeFile(join(base,'NewName.aex'),'new binary');await writeFile(join(base,'runtime.jsx'),'new script');
    const config={base,output:join(base,'new.zip'),files:['NewName.aex','runtime.jsx'],template,guide:'not replacing the existing installer'};
    run(python,[join(site,'scripts/bundle.py')],JSON.stringify(config));
    const files=JSON.parse(run(python,['-c','import json,sys,zipfile\nwith zipfile.ZipFile(sys.argv[1]) as z:print(json.dumps({n:z.read(n).decode() for n in z.namelist()}))',config.output]));
    assert.deepEqual(files,{'Delivery/OldName.aex':'new binary','Delivery/runtime.jsx':'new script','Delivery/examples/runtime.jsx':'historical script','Delivery/Install.cmd':'keep installer','Delivery/presets.json':'keep presets','Delivery/LICENSE':'keep licence'});
    run(python,[join(site,'scripts/bundle.py')],JSON.stringify({...config,output:join(base,'again.zip')}));
    assert.deepEqual(await readFile(config.output),await readFile(join(base,'again.zip')));
  }finally{await cleanup(base);}
});

test('a real CMake Release build invokes publication and Debug builds skip it',{timeout:120000},async()=>{
  const base=await mkdtemp(join(tmpdir(),'evfx-native-'));
  try{
    const marker=join(base,'called.json'),helper=join(base,'hook.mjs');
    await writeFile(helper,`import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(marker)},JSON.stringify(process.argv.slice(2)));`);
    const cmakeModule=join(site,'scripts/AfterBuild.cmake').replaceAll('\\','/');
    await writeFile(join(base,'CMakeLists.txt'),`cmake_minimum_required(VERSION 3.21)\nproject(EVFXProbe LANGUAGES C)\nadd_library(\${PROJECT_NAME} SHARED probe.c)\nset_target_properties(\${PROJECT_NAME} PROPERTIES PREFIX "" SUFFIX ".aex")\nset(EVFX_SITE_SYNC_SCRIPT "${helper.replaceAll('\\','/')}")\ninclude("${cmakeModule}")\nevfx_site_after_builds("\${CMAKE_CURRENT_SOURCE_DIR}")\n`);
    await writeFile(join(base,'probe.c'),'#ifdef _WIN32\n__declspec(dllexport)\n#endif\nint evfx_probe(void) { return 1; }\n');
    const output=join(base,'out');await mkdir(output);
    const args=['-S',base,'-B',output];if(process.platform!=='win32')args.push('-DCMAKE_BUILD_TYPE=Release');
    run('cmake',args);run('cmake',['--build',output,'--config','Release']);
    const called=await readFile(marker,'utf8'),parameters=JSON.parse(called);
    assert.equal(parameters[0],'--project');assert.equal(resolve(parameters[1]),resolve(base));assert.equal(parameters[2],'--artifact');assert.match(parameters[3],/\.aex$/);
    if(process.platform==='win32')run('cmake',['--build',output,'--config','Debug']);
    else {run('cmake',['-S',base,'-B',output,'-DCMAKE_BUILD_TYPE=Debug']);run('cmake',['--build',output,'--config','Debug']);}
    assert.equal(await readFile(marker,'utf8'),called);
  }finally{await cleanup(base);}
});
