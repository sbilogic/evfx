import { readFile,writeFile,mkdir,rename,unlink,open,stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { uptime } from 'node:os';
import { randomUUID } from 'node:crypto';

export const loadJson=async(path,fallback)=>{try{return JSON.parse((await readFile(path,'utf8')).replace(/^\uFEFF/,''));}catch(error){if(error.code==='ENOENT'&&fallback!==undefined)return fallback;throw error;}};
export async function saveJson(path,value){
  const contents=JSON.stringify(value,null,2)+'\n';
  if(await readFile(path,'utf8').catch(()=>'')===contents)return false;
  await mkdir(dirname(path),{recursive:true});
  const temp=`${path}.${process.pid}.tmp`;
  await writeFile(temp,contents);
  for(let retry=0;;retry++){
    try{await rename(temp,path);return true;}catch(error){if(retry>=5)throw error;await new Promise(r=>setTimeout(r,40*(retry+1)));}
  }
}
export async function withLock(path,callback){
  await mkdir(dirname(path),{recursive:true});
  let handle;
  const token=randomUUID();
  for(let attempt=0;attempt<2;attempt++){
    try{handle=await open(path,'wx');break;}
    catch(error){
      if(error.code!=='EEXIST')throw error;
      const old=await loadJson(path,null).catch(()=>null);
      if(!old&&Date.now()-(await stat(path)).mtimeMs<30000)return {skipped:true,reason:'Another sync is acquiring its lock'};
      let alive=false;
      if(old?.pid&&old.createdAt>Date.now()-uptime()*1000-5000){try{process.kill(old.pid,0);alive=true;}catch{}}
      if(alive)return {skipped:true,reason:'Another EVFX sync is running'};
      await unlink(path).catch(()=>{});
    }
  }
  if(!handle)return {skipped:true,reason:'Sync lock is busy'};
  await handle.writeFile(JSON.stringify({pid:process.pid,createdAt:Date.now(),token}));await handle.close();
  try{return await callback();}finally{if((await loadJson(path,null))?.token===token)await unlink(path).catch(()=>{});}
}
