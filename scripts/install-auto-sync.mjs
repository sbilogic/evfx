import { readFile,writeFile,unlink,mkdir } from 'node:fs/promises';
import { dirname,join,resolve,relative,sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn,spawnSync } from 'node:child_process';
import { loadJson,saveJson } from './sync-files.mjs';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
if(process.platform!=='win32')throw new Error('Login auto-start installation requires Windows.');
if(!process.env.APPDATA||!process.env.USERPROFILE)throw new Error('The current Windows user profile is unavailable.');
const startup=resolve(process.env.APPDATA,'Microsoft/Windows/Start Menu/Programs/Startup');
const withinProfile=relative(resolve(process.env.USERPROFILE),startup);
if(withinProfile.startsWith(`..${sep}`)||withinProfile==='..')throw new Error('Startup path is outside the current user profile.');
const path=join(startup,'EVFX Site Auto Sync.vbs');
const existing=await readFile(path,'utf8').catch(()=>null);
if(existing&&!existing.includes('EVFX Site Auto Sync'))throw new Error('The startup file belongs to another tool and was preserved.');
if(process.argv.includes('--uninstall')){
  const config=await loadJson(join(root,'sync.config.json'));config.enabled=false;
  await saveJson(join(root,'sync.config.json'),config);
  if(existing)await unlink(path);
  console.log('Auto sync disabled. The running watcher closes when it observes the configuration change.');
}else{
  const find=name=>{
    const result=spawnSync('where.exe',[name],{encoding:'utf8',windowsHide:true});
    const path=result.stdout?.trim().split(/\r?\n/)[0];
    if(result.status!==0||!path)throw new Error(`${name} is required.`);
    return path;
  };
  const python=find('python.exe'),git=find('git.exe');
  const vbs=value=>String(value).replace(/"/g,'""');
  const command=`"${process.execPath}" "${join(root,'scripts/auto-sync.mjs')}" --watch`;
  const content=`' EVFX Site Auto Sync - local login helper; no credentials stored.\r\nSet shell = CreateObject("WScript.Shell")\r\nshell.Environment("PROCESS")("EVFX_PYTHON") = "${vbs(python)}"\r\nshell.Environment("PROCESS")("EVFX_GIT") = "${vbs(git)}"\r\nshell.CurrentDirectory = "${vbs(root)}"\r\nshell.Run "${vbs(command)}", 0, False\r\n`;
  await mkdir(startup,{recursive:true});await writeFile(path,content,'utf8');
  const config=await loadJson(join(root,'sync.config.json'));
  if(config.enabled===false){config.enabled=true;await saveJson(join(root,'sync.config.json'),config);}
  const child=spawn(join(process.env.WINDIR,'System32/wscript.exe'),['//B','//NoLogo',path],{windowsHide:true,detached:true,stdio:'ignore'});
  child.unref();
  await saveJson(join(root,'.local/startup.json'),{path,node:process.execPath,installedAt:new Date().toISOString()});
  console.log(`Installed hidden login helper: ${path}`);
}
