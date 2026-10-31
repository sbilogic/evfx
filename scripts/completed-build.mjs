import { stat,realpath } from 'node:fs/promises';
import { join,resolve,relative,sep } from 'node:path';
import { findLocalProjects } from './local-plugins.mjs';
import { loadJson,saveJson,withLock } from './sync-files.mjs';
const normalize=value=>value.replace(/^evfx[\s_-]*/i,'').replace(/[^a-z0-9]/gi,'').toLowerCase();
export async function recordCompletedBuild(root,projectPath,artifactPath){
  const config=await loadJson(join(root,'sync.config.json'));
  const projectReal=await realpath(resolve(projectPath));
  const projects=await findLocalProjects(root,config);
  const project=projects.find(p=>resolve(p.absolute).toLowerCase()===projectReal.toLowerCase());
  if(!project)throw new Error('Completed build is outside the configured EVFX projects.');
  if(config.excludedIds.map(normalize).includes(normalize(project.project.split('/').at(-1))))return;
  const artifact=await realpath(resolve(artifactPath)),part=relative(projectReal,artifact);
  if(part==='..'||part.startsWith(`..${sep}`)||!part||!/\.aex$/i.test(artifact))throw new Error('Completed artifact must be an AEX inside its EVFX project.');
  const info=await stat(artifact);
  if(!info.isFile()||!info.size)throw new Error('Completed artifact is empty.');
  for(let attempt=0;attempt<100;attempt++){
    const result=await withLock(join(root,'.local/completed-builds.lock'),async()=>{
      const path=join(root,'.local/completed-builds.json'),records=await loadJson(path,{});
      records[`${project.base}:${project.project}`]={artifact:part.split(sep).join('/'),size:info.size,mtime:info.mtimeMs};
      await saveJson(path,records);
    });
    if(!result?.skipped)return;
    await new Promise(resolve=>setTimeout(resolve,30));
  }
  throw new Error('Another build is recording its output; retry on the next build.');
}
