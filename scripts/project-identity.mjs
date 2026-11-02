import { readFile,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const marker='.evfx-site-id';
export const trackedProjects=(catalog,config)=>[...catalog.tools,...(catalog.retired||[])].flatMap(tool=>
  tool.localProject?[tool.localProject]:tool.status==='lab'?config.roots.map(root=>({base:root.id,project:tool.name})):[]
);

export function retiredPluginIds(catalog){
  const active=new Set(['top','collection',...catalog.tools.flatMap(tool=>[tool.id,...(tool.aliases||[])])]);
  return [...new Set((catalog.retired||[]).flatMap(tool=>[tool.id,...(tool.aliases||[])]))].filter(id=>!active.has(id));
}

export async function readProjectIdentity(directory){
  const value=await readFile(join(directory,marker),'utf8').catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  if(value===null)return null;
  const id=value.trim();
  if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id))throw new Error('Invalid generated EVFX project identity: '+directory);
  return id;
}
export async function ensureProjectIdentity(directory,previous){
  const current=await readProjectIdentity(directory);
  if(current)return current;
  const id=previous||randomUUID();
  await writeFile(join(directory,marker),id+'\n',{flag:'wx'}).catch(error=>{if(error.code!=='EEXIST')throw error;});
  return readProjectIdentity(directory);
}
