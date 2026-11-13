import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile,stat } from 'node:fs/promises';
import { versionNotes } from './release-history.mjs';

const root=dirname(dirname(fileURLToPath(import.meta.url)));
export function packageNotes(file,version) {
  if(!version||!/\.zip$/i.test(file))return [];
  const result=spawnSync(process.env.EVFX_PYTHON||process.env.PYTHON||'python',
    ['-X','utf8',join(root,'scripts/read-release-notes.py'),file],
    {encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:1_000_000});
  if(result.status!==0)return [];
  try{
    for(const document of JSON.parse(result.stdout)){
      const notes=versionNotes(document,version);
      if(notes.length)return notes;
    }
  }catch{}
  return [];
}

export async function projectNotes(project,version,artifact) {
  if(!project||!version||!artifact)return [];
  const built=await stat(artifact);
  for(const name of ['CHANGELOG.md','RELEASE_NOTES.md','docs/RELEASE_NOTES.md','desktop/README.md','VALIDATION.md']){
    const file=join(project,name),info=await stat(file).catch(()=>null);
    if(!info?.isFile()||info.size>256_000||info.mtimeMs>built.mtimeMs+2000)continue;
    const notes=versionNotes(await readFile(file,'utf8'),version);
    if(notes.length)return notes;
  }
  return [];
}
