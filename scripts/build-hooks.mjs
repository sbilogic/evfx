import { readFile,writeFile,mkdir,copyFile } from 'node:fs/promises';
import { dirname,resolve,relative,join,sep,basename } from 'node:path';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { findLocalProjects } from './local-plugins.mjs';
import { loadJson,saveJson } from './sync-files.mjs';
import { ensureProjectIdentity,trackedProjects } from './project-identity.mjs';
const normalize=value=>value.replace(/^evfx[\s_-]*/i,'').replace(/[^a-z0-9]/gi,'').toLowerCase();
const read=async path=>readFile(path,'utf8').catch(error=>{if(error.code==='ENOENT')return null;throw error;});

export async function installBuildHooks(root,{remove=false}={}){
  const config=await loadJson(join(root,'sync.config.json'));
  const sources=await loadJson(join(root,'sources.json'),{});
  const catalog=await loadJson(join(root,'catalog.json'),{tools:[]});
  const configured=await loadJson(join(root,'build-hooks.json'),[]);
  const hooks=new Map(configured.map(h=>[resolve(root,h.path),{...h,type:'ps1'}]));
  const excluded=new Set(config.excludedIds.map(normalize));
  for(const project of await findLocalProjects(root,config,trackedProjects(catalog,config))){
    const name=normalize(basename(project.project));
    if(excluded.has(name))continue;
    const preferred=Object.values(sources).find(s=>s.project&&normalize(basename(s.project))===name);
    if(preferred&&((preferred.base||'collection')!==project.base||preferred.project!==project.project))continue;
    if(!remove){
      const old=[...catalog.tools,...(catalog.retired||[])].find(tool=>tool.localProject?.base===project.base&&tool.localProject.project===project.project);
      await ensureProjectIdentity(project.absolute,old?.localProject.identity);
    }
    for(const file of ['package.ps1','build_installer.ps1','tools/Package.ps1','tools/Build-Standalone.ps1']){
      const path=join(project.absolute,file);if(await read(path))hooks.set(path,{type:'ps1'});
    }
    const python=join(project.absolute,'tools/package_addon.py');
    if(await read(python))hooks.set(python,{type:'python'});
    for(const file of ['tools/build.mjs','tools/build-scripts.cjs']){
      const path=join(project.absolute,file),content=await read(path);
      if(content&&/writeFile|copyFile/.test(content)&&/\.jsx/.test(content))hooks.set(path,{type:file.endsWith('.cjs')?'cjs':'mjs'});
    }
    for(const file of ['CMakeLists.txt','plugin/CMakeLists.txt']){
      const path=join(project.absolute,file),content=await read(path);
      if(content&&/\.aex\b/i.test(content))hooks.set(path,{type:'cmake',project:project.absolute});
    }
  }
  const installed=[];
  for(const [path,hook] of hooks){
    const within=relative(resolve(root,'../..'),path);
    if(within==='..'||within.startsWith(`..${sep}`))throw new Error('Build hook escaped the EVFX workspace.');
    const original=await read(path);if(original===null)continue;
    const comment=hook.type==='mjs'||hook.type==='cjs'?'//':'#';
    const start=`${comment} EVFX site hook begin`,end=`${comment} EVFX site hook end`;
    const position=original.indexOf(start),finish=original.indexOf(end);
    if(position>=0&&finish<position)throw new Error(`Incomplete hook preserved: ${path}`);
    const clean=position<0?original:original.slice(0,position)+original.slice(finish+end.length).replace(/^\r?\n/,'');
    const local=file=>relative(dirname(path),join(root,'scripts',file)).split(sep).join('/');
    let lines;
    if(hook.type==='ps1'){
      const helper=local('AfterBuild.ps1').replace(/'/g,"''");
      lines=[`$evfxSiteHook = Join-Path $PSScriptRoot '${helper}'`,`if (${hook.condition?`(${hook.condition}) -and `:''}(Test-Path -LiteralPath $evfxSiteHook)) { & $evfxSiteHook }`];
    }else if(hook.type==='cmake'){
      const helper=local('AfterBuild.cmake'),project=relative(dirname(path),hook.project).split(sep).join('/')||'.';
      lines=[`include("\${CMAKE_CURRENT_LIST_DIR}/${helper}" OPTIONAL)`,`if(COMMAND evfx_site_after_builds)`,`  evfx_site_after_builds("\${CMAKE_CURRENT_LIST_DIR}/${project}")`,'endif()'];
    }else if(hook.type==='python'){
      lines=['if __name__ == "__main__":','    try:','        import subprocess as _evfx_subprocess, shutil as _evfx_shutil, sys as _evfx_sys','        from pathlib import Path as _evfx_Path',`        _evfx_hook = (_evfx_Path(__file__).resolve().parent / ${JSON.stringify(local('sync-after-build.mjs'))}).resolve()`,'        _evfx_node = _evfx_shutil.which("node")','        if _evfx_node and _evfx_hook.is_file():','            _evfx_subprocess.run([_evfx_node, str(_evfx_hook)], stdout=_evfx_sys.stderr, stderr=_evfx_sys.stderr, check=False)','    except OSError as _evfx_error:','        print(f"EVFX site sync will retry on the next build: {_evfx_error}", file=_evfx_sys.stderr)'];
    }else{
      // CommonJS builders need their synchronous path rather than import.meta.
      lines=hook.type==='cjs'?[`try { const evfxChild = require('node:child_process'); const evfxHook = require('node:path').resolve(__dirname, ${JSON.stringify(local('sync-after-build.mjs'))}); process.once('beforeExit', code => { if(code === 0) evfxChild.spawnSync(process.execPath, [evfxHook], {stdio:'inherit',windowsHide:true}); }); } catch(evfxError) { console.warn('EVFX site sync will retry on the next build:', evfxError.message); }`]:[`try { const evfxChild = await import('node:child_process'); const evfxUrl = await import('node:url'); const evfxHook = evfxUrl.fileURLToPath(new URL(${JSON.stringify(local('sync-after-build.mjs'))}, import.meta.url)); process.once('beforeExit', code => { if(code === 0) evfxChild.spawnSync(process.execPath, [evfxHook], {stdio:'inherit',windowsHide:true}); }); } catch(evfxError) { console.warn('EVFX site sync will retry on the next build:', evfxError.message); }`];
    }
    const newline=original.includes('\r\n')?'\r\n':'\n';
    const next=remove?clean:clean.trimEnd()+newline+newline+[start,...lines,end].join(newline)+newline;
    if(next!==original){
      const backup=join(root,'.local/build-hook-backups',createHash('sha256').update(path).digest('hex').slice(0,12)+'.original');
      await mkdir(dirname(backup),{recursive:true});
      await copyFile(path,backup,constants.COPYFILE_EXCL).catch(error=>{if(error.code!=='EEXIST')throw error;});
      await writeFile(path,next);
    }
    installed.push({path,type:hook.type});
  }
  await saveJson(join(root,'.local/build-hooks.json'),{installed:remove?[]:installed,updatedAt:new Date().toISOString()});
  return installed;
}
