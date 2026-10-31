import { readdir,readFile,stat } from 'node:fs/promises';
import { resolve,join,relative,basename,dirname,extname,sep } from 'node:path';
import { createHash } from 'node:crypto';

const normalize=value=>String(value).replace(/^evfx[\s_-]*/i,'').replace(/[^a-z0-9]/gi,'').toLowerCase();
const slug=value=>String(value).replace(/^evfx[\s_-]*/i,'').replace(/([a-z])([A-Z])/g,'$1-$2').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase();
const slash=value=>value.split(sep).join('/');
const entries=async path=>readdir(path,{withFileTypes:true}).catch(error=>{if(error.code==='ENOENT')return [];throw error;});
const text=async path=>(await readFile(path,'utf8').catch(()=>'' )).replace(/^\uFEFF/,'');
const readJson=async path=>{try{return JSON.parse(await text(path));}catch{return null;}};
const fileStat=async path=>stat(path).catch(()=>null);
export const versionFromName=name=>name.match(/(?:^|[^\d])(\d+\.\d+\.\d+(?:-(?:dev|alpha|beta|rc|preview)(?:[.-]?\d+)*)?)/i)?.[1]??null;
export function compareVersions(a,b){
  if(!a||!b)return a?1:b?-1:0;
  const [coreA,...preA]=a.split('-'),[coreB,...preB]=b.split('-');
  const av=coreA.split('.').map(Number),bv=coreB.split('.').map(Number);
  for(let i=0;i<3;i++)if(av[i]!==bv[i])return av[i]-bv[i];
  if(!preA.length||!preB.length)return preA.length?-1:preB.length?1:0;
  return preA.join('-').localeCompare(preB.join('-'),'en',{numeric:true});
}
const isDev=version=>!!version&&/-/.test(version);
const inside=(root,path)=>{const part=relative(root,path);return part!==''&&!part.startsWith(`..${sep}`)&&part!=='..'&&!resolve(path).startsWith('\\\\');};

export function sourceRoot(siteRoot,config,source){
  const selected=config.roots.find(r=>r.id===(source.base||'collection'));
  if(!selected)throw new Error(`Unknown local root ${source.base}`);
  return resolve(siteRoot,selected.path);
}
export function sourcePath(siteRoot,config,source,path){
  const base=sourceRoot(siteRoot,config,source),result=resolve(base,path);
  if(!inside(base,result))throw new Error('Distribution input escaped its EVFX root.');
  return result;
}

async function packageFiles(project){
  const result=[];
  async function walk(dir,depth){
    for(const entry of await entries(dir)){
      if(entry.isSymbolicLink())continue;
      const path=join(dir,entry.name);
      if(entry.isFile()&&/\.(zip|exe)$/i.test(entry.name)){
        if(/(?:^|[-_ ])(?:source|research|reference|ai[-_ ]?text|payload|symbols|fixtures?|backup|archive)(?:[-_. ]|$)/i.test(entry.name))continue;
        if(/(?:^|[-_])(?:unit[-_]tests?|test[-_]results|test[-_]output)(?:[-_.]|$)/i.test(entry.name))continue;
        if(extname(entry.name).toLowerCase()==='.exe'&&!/setup|installer/i.test(entry.name))continue;
        const info=await stat(path);
        result.push({path,version:versionFromName(entry.name),mtime:info.mtimeMs,size:info.size});
      }else if(entry.isDirectory()&&depth<2&&!/archive|payload|backup|models|node_modules|\.git|target|^debug$|^tests$|test-output/i.test(entry.name)){
        await walk(path,depth+1);
      }
    }
  }
  for(const dir of ['release','releases','dist'])await walk(join(project,dir),0);
  return result;
}

async function nativeFiles(project){
  const found=[];
  const dirs=['','Release','release','dist','build/Release','build/dist','build-aex/Release','build-aex-version-fix/Release','plugin/build/Release'];
  for(const dir of dirs){
    for(const entry of await entries(join(project,dir))){
      if(entry.isFile()&&!entry.isSymbolicLink()&&/\.(aex|jsx)$/i.test(entry.name)&&!/^test|fixture|smoke|probe/i.test(entry.name)){
        const path=join(project,dir,entry.name),info=await stat(path);
        found.push({path,mtime:info.mtimeMs,size:info.size});
      }
    }
  }
  return found.sort((a,b)=>b.mtime-a.mtime);
}

export function aexMetadata(data){
  // Adobe's Windows PiPL property: vendor 8BIM, key eVER, id, length, value.
  const pipl=data.indexOf(Buffer.from('MIB8REVe'));
  if(pipl>=0&&pipl+20<=data.length&&data.readUInt32LE(pipl+12)===4){
    const aeVersion=data.readUInt32LE(pipl+16);
    const major=((aeVersion>>>19)&7)|(((aeVersion>>>26)&15)<<3),minor=(aeVersion>>>15)&15,patch=(aeVersion>>>11)&15,stage=(aeVersion>>>9)&3,build=aeVersion&511;
    if(aeVersion)return {version:`${major}.${minor}.${patch}${stage===3?'':`-${['dev','alpha','beta'][stage]}${build}`}`,build,aeVersion};
  }
  const index=data.indexOf(Buffer.from([0xbd,0x04,0xef,0xfe]));
  if(index<0||index+16>data.length)return null;
  const ms=data.readUInt32LE(index+8),ls=data.readUInt32LE(index+12);
  const result=[ms>>>16,ms&65535,ls>>>16].join('.');
  return result==='0.0.0'?null:{version:result};
}
async function binaryVersion(path){
  return /\.aex$/i.test(path)?aexMetadata(await readFile(path))?.version??null:null;
}

async function sourceVersion(project,path,fallback){
  const native=await binaryVersion(path);
  if(native)return native;
  if(/\.jsx$/i.test(path)){
    const header=(await text(path)).slice(0,1500);
    const match=header.match(/(?:version|EVFX[^\n]{0,60})[^\n\d]*(\d+\.\d+\.\d+)/i);
    if(match)return match[1];
  }
  const info=await fileStat(path);
  for(const name of ['CMakeLists.txt','plugin/CMakeLists.txt','package.json','Cargo.toml']){
    const candidate=join(project,name),metadataStat=await fileStat(candidate);
    if(!metadataStat||metadataStat.mtimeMs>(info?.mtimeMs??0))continue;
    const content=await text(candidate);
    const match=content.match(/\bVERSION\s+(\d+\.\d+\.\d+)/i)||content.match(/"version"\s*:\s*"(\d+\.\d+\.\d+(?:-[\w.]+)?)"/i)||content.match(/^version\s*=\s*"(\d+\.\d+\.\d+(?:-[\w.]+)?)"/m);
    if(match)return match[1];
  }
  return fallback??null;
}

async function description(project,host){
  const pkg=await readJson(join(project,'package.json'));
  const candidates=[pkg?.description,...(await text(join(project,'README.md'))).split(/\n\s*\n/)].filter(Boolean);
  for(let line of candidates){
    if(/^[#`!|<>*-]|current installed|\bSHA-?256\b|\bregression\b|\buser['’]s\b|\bclient\b|[A-Z]:[\\/]|https?:\/\//i.test(line.trim()))continue;
    line=line.replace(/\*\*/g,'').replace(/`/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/\s+/g,' ').trim();
    line=line.split(/(?<=[.!?])\s+(?=[A-Z])/)[0];
    line=line.replace(/^(?:A|An) (?:Windows x64 )?(?:Adobe )?After Effects (?:effect|plug-in|plugin|tool) for\s+/i,'').replace(/^The Windows x64 AE build contains\s+/i,'').replace(/private D3D11 rendering/gi,'GPU rendering');
    line=line.charAt(0).toUpperCase()+line.slice(1);
    if(line.length>=15&&line.length<=200&&!/\btest(?:s|ing)?\b|\bbenchmark\b/i.test(line))return line;
  }
  return host==='After Effects'?'After Effects effect.':host==='Blender'?'Blender add-on.':'Windows utility.';
}

function projectForSource(source){
  if(source.project)return source.project;
  const parts=(source.bundleRoot||source.directory||source.files?.[0]||source.artifacts?.[0]||'').split(/[\\/]/);
  return parts[1]==='plugins'?parts.slice(0,3).join('/'):parts[0];
}

export async function findLocalProjects(siteRoot,config){
  const projects=[];
  for(const root of config.roots){
    const directory=resolve(siteRoot,root.path);
    for(const entry of await entries(directory)){
      if(!entry.isDirectory()||entry.isSymbolicLink()||!/^evfx/i.test(entry.name))continue;
      if(root.projects&&!root.projects.includes(entry.name))continue;
      const project=join(directory,entry.name);
      if(resolve(project)===resolve(siteRoot)||entry.name==='EVFX Collection')continue;
      const children=await entries(join(project,'plugins'));
      if(children.some(x=>x.isDirectory()&&/^evfx/i.test(x.name))){
        for(const child of children)if(child.isDirectory()&&!child.isSymbolicLink()&&/^evfx/i.test(child.name))projects.push({base:root.id,project:slash(relative(directory,join(project,'plugins',child.name))),absolute:join(project,'plugins',child.name)});
      }else projects.push({base:root.id,project:entry.name,absolute:project});
    }
  }
  return projects;
}

/** Read EVFX distribution folders. No project is built, executed, changed, or uploaded. */
export async function discoverLocalPlugins(siteRoot,{catalog,sources,config}){
  catalog=structuredClone(catalog);sources=structuredClone(sources);
  const excluded=new Set(config.excludedIds.map(normalize));
  catalog.tools=catalog.tools.filter(tool=>!excluded.has(normalize(tool.id)));
  for(const id of Object.keys(sources))if(excluded.has(normalize(id)))delete sources[id];
  const projects=await findLocalProjects(siteRoot,config),observations=[],issues=[];
  const completedBuilds=await readJson(join(siteRoot,'.local/completed-builds.json'))||{};
  const known=new Map(catalog.tools.map(tool=>[normalize(tool.name),tool.id]));
  for(const [id,source] of Object.entries(sources))known.set(normalize(basename(projectForSource(source))),id);
  const visited=new Set();
  for(const project of projects){
    const key=normalize(basename(project.project));
    if(excluded.has(key))continue;
    let id=known.get(key)||slug(basename(project.project));
    if(excluded.has(normalize(id)))continue;
    const existing=sources[id];
    if(existing&&((existing.base||'collection')!==project.base||projectForSource(existing)!==project.project))continue;
    if(visited.has(id))continue;visited.add(id);
    const descriptor=await readJson(join(project.absolute,'evfx-release.json'));
    const packages=await packageFiles(project.absolute);
    packages.sort((a,b)=>compareVersions(b.version,a.version)||b.mtime-a.mtime||(/setup|installer/i.test(b.path)?1:0)-(/setup|installer/i.test(a.path)?1:0));
    let selected=packages[0];
    let source=existing?structuredClone(existing):null;
    const completed=completedBuilds[`${project.base}:${project.project}`];
    const completedPath=completed?resolve(project.absolute,completed.artifact):null;
    const completedInfo=completedPath&&inside(project.absolute,completedPath)&&/\.aex$/i.test(completedPath)?await fileStat(completedPath):null;
    if(completedInfo&&completedInfo.size===completed.size&&completedInfo.mtimeMs===completed.mtime&&(!selected||/\.zip$/i.test(selected.path)&&completed.mtime>selected.mtime)){
      const base=sourceRoot(siteRoot,config,{base:project.base});
      let version=await sourceVersion(project.absolute,completedPath,selected?.version??existing?.version);
      if(selected?.version?.includes('-')&&version===selected.version.split('-')[0])version=selected.version;
      const companions=(await entries(dirname(completedPath))).filter(entry=>entry.isFile()&&!entry.isSymbolicLink()&&/\.(jsx|dll)$/i.test(entry.name)).map(entry=>slash(relative(base,join(dirname(completedPath),entry.name))));
      source={base:project.base,project:project.project,version,files:[slash(relative(base,completedPath)),...companions],...(selected?{templateArtifact:slash(relative(base,selected.path))}:{})};
      selected={path:completedPath,mtime:completedInfo.mtimeMs,size:completedInfo.size};
    }else if(selected){
      const best=packages.filter(p=>p.version===selected.version);
      const setup=best.find(p=>/setup|installer/i.test(basename(p.path)));
      if(setup)selected=setup;
      const extras=best.filter(p=>p.path!==selected.path&&/portable/i.test(basename(p.path)));
      const base=sourceRoot(siteRoot,config,{base:project.base});
      source={base:project.base,project:project.project,version:selected.version,
        artifacts:[selected,...extras].map(p=>slash(relative(base,p.path)))};
    }else if(existing?.bundleRoot){
      source={...existing,base:project.base,project:project.project};
    }else{
      const native=await nativeFiles(project.absolute);
      const preferred=native.find(p=>/\.aex$/i.test(p.path))||native[0];
      if(preferred){
        const base=sourceRoot(siteRoot,config,{base:project.base});
        source={base:project.base,project:project.project,version:await sourceVersion(project.absolute,preferred.path,existing?.version),files:[slash(relative(base,preferred.path))]};
        selected=preferred;
      }else if(!existing){continue;}
    }
    if(!source)continue;
    const aex=source.files?.find(file=>/\.aex$/i.test(file));
    if(aex&&!source.bundleRoot){
      const metadata=aexMetadata(await readFile(sourcePath(siteRoot,config,source,aex)));
      if(metadata?.aeVersion){source.build=metadata.build;source.aeVersion=metadata.aeVersion;}
    }
    // A descriptor can declare an exact, runtime-verified complete package.
    if(descriptor?.readiness?.state==='complete'&&descriptor.readiness.runtimeVerified===true&&/^[a-f0-9]{64}$/i.test(descriptor.readiness.sha256||'')){
      source.review={...descriptor.readiness,evidence:`${project.project}/evfx-release.json`};
    }
    sources[id]=source;
    let tool=catalog.tools.find(tool=>tool.id===id);
    if(!tool){
      const folderName=basename(project.project).replace(/^evfx[\s_-]*/i,'').replace(/([a-z])([A-Z])/g,'$1 $2').trim();
      const readme=await text(join(project.absolute,'README.md'));
      const host=/blender/i.test(project.project)||/bl_info\s*=/.test(await text(join(project.absolute,'__init__.py')))?'Blender':/\.aex$|\.jsx$/i.test(selected?.path||'')||/After Effects/i.test(readme.slice(0,5000))?'After Effects':'Windows';
      const headline=await description(project.absolute,host);
      tool={id,name:folderName,host,category:host==='After Effects'?'ae':host==='Blender'?'blender':'windows',
        kind:host==='After Effects'?'Plugin':host==='Blender'?'Add-on':'Standalone app',art:'screen',description:headline,detail:headline,
        requirements:host==='After Effects'?'Windows x64 · After Effects':host==='Blender'?'Blender · See package requirements':'Windows x64',
        install:source.artifacts?.[0]?.endsWith('.exe')?'Run the setup executable and follow its instructions.':'Extract the ZIP and follow the included installation instructions.',
        status:'preview',autoDiscovered:true,readiness:{state:isDev(source.version)?'experimental':'unverified',releaseTag:null,reviewedAt:new Date().toISOString().slice(0,10),evidence:`${project.project}: automatically discovered distribution`,note:isDev(source.version)?'Development build. Features and runtime stability may be incomplete.':'Newly discovered build; runtime readiness has not been verified.'}};
      catalog.tools.push(tool);known.set(key,id);
    }else if(tool.autoDiscovered){
      tool.description=await description(project.absolute,tool.host);tool.detail=tool.description;
    }
    if(typeof descriptor?.description==='string'&&descriptor.description.length<=200&&!/[A-Z]:[\\/]/i.test(descriptor.description))tool.description=tool.detail=descriptor.description.trim();
    if(['incomplete','experimental','unverified','legacy','development'].includes(descriptor?.readiness?.state)&&typeof descriptor.readiness.note==='string'){
      const state=descriptor.readiness.state,note=descriptor.readiness.note;
      const same=tool.readiness.state===state&&tool.readiness.note===note;
      tool.readiness={state,note,releaseTag:null,reviewedAt:same?tool.readiness.reviewedAt:new Date().toISOString().slice(0,10),evidence:`${project.project}/evfx-release.json`};
      tool.status=state==='legacy'?'legacy':'preview';
    }
    const inputPaths=[...(source.artifacts||(!source.bundleRoot?source.files:[])||[]),...(source.templateArtifact?[source.templateArtifact]:[])];
    for(const input of inputPaths){
      const path=sourcePath(siteRoot,config,source,input),info=await fileStat(path);
      if(info)observations.push({toolId:id,path:slash(path),size:info.size,mtime:info.mtimeMs});
      else issues.push(`${id}: missing distribution ${input}`);
    }
    if(source.bundleRoot){
      const base=sourcePath(siteRoot,config,source,source.bundleRoot);
      const walk=async(dir,depth=0)=>{for(const entry of await entries(dir)){
        if(entry.isSymbolicLink()||entry.name==='__pycache__'||entry.name==='node_modules')continue;
        const path=join(dir,entry.name);
        if(entry.isDirectory()&&depth<4)await walk(path,depth+1);
        else if(entry.isFile()){const info=await stat(path);observations.push({toolId:id,path:slash(path),size:info.size,mtime:info.mtimeMs});}
      }};
      for(const name of source.files){const path=join(base,name),info=await fileStat(path);if(info?.isDirectory())await walk(path);else if(info)observations.push({toolId:id,path:slash(path),size:info.size,mtime:info.mtimeMs});}
    }
    if(descriptor){const info=await stat(join(project.absolute,'evfx-release.json'));observations.push({toolId:id,path:slash(join(project.absolute,'evfx-release.json')),size:info.size,mtime:info.mtimeMs});}
  }
  observations.sort((a,b)=>a.path.localeCompare(b.path));
  const fingerprint=createHash('sha256').update(JSON.stringify({catalog,sources,observations})).digest('hex');
  const toolFingerprints=Object.fromEntries(Object.entries(sources).map(([id,source])=>[id,createHash('sha256').update(JSON.stringify({source,tool:catalog.tools.find(t=>t.id===id),files:observations.filter(o=>o.toolId===id)})).digest('hex')]));
  return {catalog,sources,observations,fingerprint,toolFingerprints,issues};
}
