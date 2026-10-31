import { readFile,writeFile,mkdir,copyFile } from 'node:fs/promises';
import { dirname,resolve,relative,join,sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { loadJson,saveJson } from './sync-files.mjs';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const hooks=await loadJson(join(root,'build-hooks.json'));
const remove=process.argv.includes('--uninstall');
const marker=/# EVFX site hook begin\r?\n[\s\S]*?# EVFX site hook end\r?\n?/;
const installed=[];
for(const hook of hooks){
  const path=resolve(root,hook.path),within=relative(resolve(root,'../..'),path);
  if(within==='..'||within.startsWith(`..${sep}`)||!path.endsWith('.ps1'))throw new Error('Build hook escaped the EVFX workspace.');
  const original=await readFile(path,'utf8').catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  if(original===null)continue;
  if(original.includes('# EVFX site hook begin')&&!marker.test(original))throw new Error(`Incomplete hook preserved: ${hook.path}`);
  const clean=original.replace(marker,'');
  const helper=relative(dirname(path),join(root,'scripts/AfterBuild.ps1')).split(sep).join('\\').replace(/'/g,"''");
  const lines=['# EVFX site hook begin',`$evfxSiteHook = Join-Path $PSScriptRoot '${helper}'`,`if (${hook.condition?`(${hook.condition}) -and `:''}(Test-Path -LiteralPath $evfxSiteHook)) { & $evfxSiteHook }`,'# EVFX site hook end'];
  const newline=original.includes('\r\n')?'\r\n':'\n';
  const next=remove?clean:clean.trimEnd()+newline+newline+lines.join(newline)+newline;
  if(next!==original){
    const backup=join(root,'.local/build-hook-backups',createHash('sha256').update(path).digest('hex').slice(0,12)+'.ps1');
    await mkdir(dirname(backup),{recursive:true});
    await copyFile(path,backup,constants.COPYFILE_EXCL).catch(error=>{if(error.code!=='EEXIST')throw error;});
    await writeFile(path,next);
  }
  installed.push(path);
}
await saveJson(join(root,'.local/build-hooks.json'),{installed:remove?[]:installed,updatedAt:new Date().toISOString()});
console.log(`${remove?'Removed':'Installed'} one-shot build hooks: ${installed.length}. No background process or startup entry.`);
