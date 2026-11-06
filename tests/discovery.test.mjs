import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,readFile,rm,utimes,rename,cp,symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,dirname,basename,resolve } from 'node:path';
import { discoverLocalPlugins,compareVersions,versionFromName } from '../scripts/local-plugins.mjs';
import { recordCompletedBuild } from '../scripts/completed-build.mjs';
import { createHash } from 'node:crypto';
import { installBuildHooks } from '../scripts/build-hooks.mjs';
import { ensureProjectIdentity } from '../scripts/project-identity.mjs';

export async function fixture(){
  const base=await mkdtemp(join(tmpdir(),'evfx-discovery-'));
  const root=join(base,'collection','EVFX-Site');await mkdir(root,{recursive:true});
  const config={roots:[{id:'collection',path:'..'},{id:'dev',path:'../..'}],excludedIds:['smart-denoise','match-grain'],settleSeconds:30};
  const catalog={repository:'example/evfx',title:'EVFX',tools:[]};
  const cleanup=()=>{assert.equal(dirname(resolve(base)),resolve(tmpdir()));assert.match(basename(base),/^evfx-discovery-/);return rm(base,{recursive:true,force:true});};
  return {base,root,config,catalog,sources:{},cleanup};
}
export async function addPackage(f,name,version='1.0.0',extra=''){
  const project=join(f.base,name),dir=join(project,'release');await mkdir(dir,{recursive:true});
  await writeFile(join(project,'README.md'),`# ${name}\n\nAn After Effects effect for matte processing.\n`);
  const path=join(dir,`${name.replaceAll(' ','-')}-${version}-Windows${extra}.zip`);await writeFile(path,'fixture distribution');return path;
}
test('version filenames preserve prerelease labels and sort numbered dev builds naturally',()=>{
  assert.equal(versionFromName('EVFX-Flares-0.4.0-dev17-Windows-x64.zip'),'0.4.0-dev17');
  assert(compareVersions('0.4.0-dev17','0.4.0-dev9')>0);
  assert(compareVersions('0.4.0','0.4.0-dev17')>0);
  assert(compareVersions('1.10.0','1.9.0')>0);
});
test('tracked offloaded junctions discover new packages while untracked links stay ignored',async()=>{
  const f=await fixture();try{
    await addPackage({...f,base:join(f.base,'storage')},'EVFX Sequencer','0.10.0');
    const target=join(f.base,'storage/EVFX Sequencer');
    const identity=await ensureProjectIdentity(target);
    await symlink(target,join(f.base,'EVFX Sequencer'),'junction');
    await symlink(target,join(f.base,'EVFX Untracked Link'),'junction');
    f.catalog.tools.push({id:'sequencer',name:'Sequencer',host:'Windows',status:'preview',readiness:{state:'unverified'},localProject:{identity,base:'dev',project:'EVFX Sequencer',names:{folder:'Sequencer',readme:'Sequencer'}}});
    f.sources.sequencer={base:'dev',project:'EVFX Sequencer',version:'0.9.1',artifacts:['EVFX Sequencer/release/old.zip']};
    const result=await discoverLocalPlugins(f.root,f);
    assert.deepEqual(result.issues,[]);
    assert.equal(result.sources.sequencer.version,'0.10.0');
    assert.equal(result.catalog.tools.length,1);
    assert(result.observations.some(file=>file.toolId==='sequencer'&&file.path.includes('0.10.0')));
  }finally{await f.cleanup();}
});
test('new EVFX folders are discovered in either root without catalog edits',async()=>{
  const f=await fixture();try{
    await addPackage(f,'EVFX New Matte');
    const result=await discoverLocalPlugins(f.root,f);
    assert.equal(result.catalog.tools[0].id,'new-matte');
    assert.equal(result.sources['new-matte'].base,'dev');
    assert.equal(result.catalog.tools[0].readiness.state,'unverified');
    assert(!JSON.stringify(result.sources).includes(f.base));
  }finally{await f.cleanup();}
});

test('an explicitly tracked non-EVFX app publishes its matching Android companion with each setup',async()=>{
  const f=await fixture();try{
    const project=join(f.base,'Omnicast'),release=join(project,'release');
    await mkdir(release,{recursive:true});
    await writeFile(join(project,'README.md'),'# Omnicast\n\nA Windows app for local network sharing.');
    await writeFile(join(release,'Omnicast-Setup-0.17.5.exe'),'setup');
    await writeFile(join(release,'Omnicast-Android-0.17.5.apk'),'phone');
    await writeFile(join(release,'Omnicast-Android-0.18.0.apk'),'future phone build');
    const identity=await ensureProjectIdentity(project);
    f.catalog.tools.push({id:'omnicast',name:'Omnicast',host:'Windows',kind:'Standalone app',status:'preview',androidCompanion:true,readiness:{state:'experimental',note:'Alpha'},localProject:{identity,base:'dev',project:'Omnicast',names:{folder:'Omnicast',readme:'Omnicast'}}});
    f.sources.omnicast={base:'dev',project:'Omnicast',version:'0.17.4',artifacts:['Omnicast/release/Omnicast-Setup-0.17.4.exe']};
    const first=await discoverLocalPlugins(f.root,f);
    assert.deepEqual(first.issues,[]);
    assert.equal(first.sources.omnicast.version,'0.17.5');
    assert.deepEqual(first.sources.omnicast.artifacts,['Omnicast/release/Omnicast-Setup-0.17.5.exe','Omnicast/release/Omnicast-Android-0.17.5.apk']);
    await writeFile(join(release,'Omnicast-Setup-0.18.0.exe'),'next setup');
    const next=await discoverLocalPlugins(f.root,{...f,catalog:first.catalog,sources:first.sources});
    assert.equal(next.sources.omnicast.version,'0.18.0');
    assert.deepEqual(next.sources.omnicast.artifacts,['Omnicast/release/Omnicast-Setup-0.18.0.exe','Omnicast/release/Omnicast-Android-0.18.0.apk']);
    await rename(project,join(f.base,'Omnicast Next'));
    const renamed=await discoverLocalPlugins(f.root,{...f,catalog:next.catalog,sources:next.sources});
    assert.equal(renamed.sources.omnicast.project,'Omnicast Next');
    assert.equal(renamed.catalog.tools[0].id,'omnicast');
  }finally{await f.cleanup();}
});

test('a nested native project gets build hooks and follows builds and parent-folder renames',async()=>{
  const f=await fixture();try{
    f.config.excludedIds=['match-grain'];
    await addPackage(f,'EVFX Smart Grain');
    const parent=join(f.base,'EVFX Smart Grain'),nested=join(parent,'denoise');
    await mkdir(join(nested,'release'),{recursive:true});
    await writeFile(join(nested,'README.md'),'# EVFX Smart Denoise\n\nAn After Effects effect for noise reduction.');
    await writeFile(join(nested,'CMakeLists.txt'),'add_library(EVFXSmartDenoise MODULE plugin.cpp)\nset_target_properties(EVFXSmartDenoise PROPERTIES SUFFIX ".aex")\n');
    await writeFile(join(nested,'release/EVFXSmartDenoise-v1.0.3-Windows.zip'),'completed package');
    const identity=await ensureProjectIdentity(nested);
    f.catalog.tools.push({id:'smart-denoise',name:'Smart Denoise',host:'After Effects',kind:'Native plugin',status:'preview',readiness:{state:'experimental',note:'Development build.'},localProject:{identity,base:'dev',project:'EVFX Smart Grain/denoise',names:{folder:'denoise',readme:'Smart Denoise'}}});
    f.sources['smart-denoise']={base:'dev',project:'EVFX Smart Grain/denoise',version:'1.0.2',artifacts:['EVFX Smart Grain/denoise/release/old.zip']};
    for(const [file,data] of Object.entries({'sync.config.json':f.config,'catalog.json':f.catalog,'sources.json':f.sources}))await writeFile(join(f.root,file),JSON.stringify(data));
    await installBuildHooks(f.root);
    const first=await discoverLocalPlugins(f.root,f);
    assert.deepEqual(first.issues,[]);
    assert.equal(first.sources['smart-denoise'].version,'1.0.3');
    assert.deepEqual(first.catalog.tools.map(tool=>tool.id).sort(),['smart-denoise','smart-grain']);
    assert.match(await readFile(join(nested,'CMakeLists.txt'),'utf8'),/evfx_site_after_builds/);
    await writeFile(join(nested,'release/EVFXSmartDenoise-v1.0.4-Windows.zip'),'newer completed package');
    const updated=await discoverLocalPlugins(f.root,{...f,catalog:first.catalog,sources:first.sources});
    assert.equal(updated.sources['smart-denoise'].version,'1.0.4');
    await mkdir(join(nested,'build/dist'),{recursive:true});
    const aex=join(nested,'build/dist/EVFXSmartDenoise.aex');
    await writeFile(aex,'completed native build');
    await recordCompletedBuild(f.root,nested,aex);
    const built=await discoverLocalPlugins(f.root,{...f,catalog:updated.catalog,sources:updated.sources});
    assert(built.sources['smart-denoise'].files[0].endsWith('/build/dist/EVFXSmartDenoise.aex'));
    await rename(parent,join(f.base,'EVFX Renamed Grain'));
    const renamed=await discoverLocalPlugins(f.root,{...f,catalog:built.catalog,sources:built.sources});
    assert.deepEqual(renamed.issues,[]);
    assert.deepEqual(renamed.catalog.tools.map(tool=>tool.id).sort(),['smart-denoise','smart-grain']);
    assert.equal(renamed.sources['smart-denoise'].project,'EVFX Renamed Grain/denoise');
  }finally{await f.cleanup();}
});

test('removed plugin folders leave the active library while their history stays archived',async()=>{
  const f=await fixture();try{
    await addPackage(f,'EVFX Gone');
    for(const [file,data] of Object.entries({'sync.config.json':f.config,'catalog.json':f.catalog,'sources.json':f.sources}))await writeFile(join(f.root,file),JSON.stringify(data));
    await installBuildHooks(f.root);
    const first=await discoverLocalPlugins(f.root,f);
    await rename(join(f.base,'EVFX Gone'),join(f.base,'archived-gone'));
    const removed=await discoverLocalPlugins(f.root,{...f,catalog:first.catalog,sources:first.sources});
    assert.deepEqual(removed.issues,[]);
    assert.deepEqual(removed.catalog.tools,[]);
    assert.deepEqual(removed.sources,{});
    assert.deepEqual(removed.catalog.retired.map(tool=>tool.id),['gone']);
    const again=await discoverLocalPlugins(f.root,{...f,catalog:removed.catalog,sources:removed.sources});
    assert.deepEqual(again.catalog,removed.catalog);
    const stale=join(f.base,'collection','EVFX Gone','release');await mkdir(stale,{recursive:true});
    await writeFile(join(stale,'EVFX-Gone-0.1.0.zip'),'stale build in another root');
    const staleScan=await discoverLocalPlugins(f.root,{...f,catalog:again.catalog,sources:again.sources});
    assert.deepEqual(staleScan.catalog.tools,[]);
    await rename(join(f.base,'archived-gone'),join(f.base,'EVFX Gone'));
    const restored=await discoverLocalPlugins(f.root,{...f,catalog:again.catalog,sources:again.sources});
    assert.deepEqual(restored.catalog.tools.map(tool=>tool.id),['gone']);
    assert.deepEqual(restored.catalog.tools[0].readiness,first.catalog.tools[0].readiness);
    assert.deepEqual(restored.catalog.retired,[]);
  }finally{await f.cleanup();}
});

test('an unavailable scan root cannot retire plugins as if they were deleted',async()=>{
  const f=await fixture();try{
    await addPackage(f,'EVFX Present');
    const first=await discoverLocalPlugins(f.root,f);
    const external=join(f.base,'external');await mkdir(external);
    f.config.roots.push({id:'external',path:'../../external'});
    await rename(external,join(f.base,'offline-external'));
    await assert.rejects(discoverLocalPlugins(f.root,{...f,catalog:first.catalog,sources:first.sources}),{code:'ENOENT'});
    assert.deepEqual(first.catalog.tools.map(tool=>tool.id),['present']);
  }finally{await f.cleanup();}
});

test('removing a selected worktree parent retires that plugin while its workspace root is available',async()=>{
  const f=await fixture();try{
    const parent=join(f.base,'collection','EVFX Parent'),project=join(parent,'worktrees','EVFX Selected');
    await mkdir(join(project,'release'),{recursive:true});
    await writeFile(join(project,'release/EVFX-Selected-1.0.0.zip'),'selected build');
    f.config.roots.push({id:'active',path:'../EVFX Parent/worktrees',projects:['EVFX Selected']});
    f.catalog.tools.push({id:'selected',name:'Selected',status:'preview'});
    f.sources.selected={base:'active',project:'EVFX Selected',version:'1.0.0',artifacts:['EVFX Selected/release/EVFX-Selected-1.0.0.zip']};
    const first=await discoverLocalPlugins(f.root,f);
    await rename(parent,join(f.base,'collection','archived-parent'));
    const removed=await discoverLocalPlugins(f.root,{...f,catalog:first.catalog,sources:first.sources});
    assert.deepEqual(removed.issues,[]);assert.deepEqual(removed.catalog.tools,[]);
    assert.deepEqual(removed.catalog.retired.map(tool=>tool.id),['selected']);
  }finally{await f.cleanup();}
});

test('source-only lab projects follow renames and removals even when they contain plugin folders',async()=>{
  const f=await fixture();try{
    const project=join(f.base,'EVFX Sketch');await mkdir(join(project,'plugins','EVFX Child'),{recursive:true});
    f.catalog.tools.push({id:'sketch',name:'Sketch',status:'lab'});
    for(const [file,data] of Object.entries({'sync.config.json':f.config,'catalog.json':f.catalog,'sources.json':f.sources}))await writeFile(join(f.root,file),JSON.stringify(data));
    await installBuildHooks(f.root);
    const first=await discoverLocalPlugins(f.root,f);
    assert(first.catalog.tools[0].localProject?.identity);
    const renamed=join(f.base,'EVFX Fresh Sketch');await rename(project,renamed);
    const next=await discoverLocalPlugins(f.root,{...f,catalog:first.catalog,sources:first.sources});
    assert.equal(next.catalog.tools[0].name,'Fresh Sketch');
    assert.equal(next.catalog.tools[0].status,'lab');assert.deepEqual(next.sources,{});
    await rename(renamed,join(f.base,'archived-sketch'));
    const removed=await discoverLocalPlugins(f.root,{...f,catalog:next.catalog,sources:next.sources});
    assert.deepEqual(removed.catalog.tools,[]);
    assert.deepEqual(removed.catalog.retired.map(tool=>tool.id),['sketch']);
  }finally{await f.cleanup();}
});

test('a renamed native plugin keeps one identity, its readiness and its old links',async()=>{
  const f=await fixture();try{
    const artifact=await addPackage(f,'EVFX Old Native');
    f.config.roots.find(root=>root.id==='dev').projects=['EVFX Old Native'];
    const readiness={state:'incomplete',note:'Runtime review still required.',evidence:'Existing review'};
    f.catalog.tools.push({id:'studio-keyer',name:'Old Native',host:'After Effects',kind:'Native plugin',readiness,status:'preview'});
    f.sources['studio-keyer']={base:'dev',project:'EVFX Old Native',version:'1.0.0',artifacts:['EVFX Old Native/release/'+basename(artifact)]};
    for(const [file,data] of Object.entries({'sync.config.json':f.config,'catalog.json':f.catalog,'sources.json':f.sources}))await writeFile(join(f.root,file),JSON.stringify(data));
    await installBuildHooks(f.root);
    const first=await discoverLocalPlugins(f.root,f);
    const renamed=join(f.base,'EVFX Fresh Native');
    await writeFile(join(f.root,'catalog.json'),JSON.stringify(first.catalog));
    await writeFile(join(f.root,'sources.json'),JSON.stringify(first.sources));
    await rename(join(f.base,'EVFX Old Native'),renamed);
    await installBuildHooks(f.root);
    const next=await discoverLocalPlugins(f.root,{...f,catalog:first.catalog,sources:first.sources});
    assert.deepEqual(next.issues,[]);
    assert.deepEqual(next.catalog.tools.map(tool=>tool.id),['studio-keyer']);
    assert.equal(next.catalog.tools[0].name,'Fresh Native');
    assert.deepEqual(next.catalog.tools[0].readiness,readiness);
    assert(next.catalog.tools[0].aliases.includes('old-native'));
    assert(next.catalog.tools[0].aliases.includes('fresh-native'));
    assert.equal(next.sources['studio-keyer'].project,'EVFX Fresh Native');
    assert(next.sources['studio-keyer'].artifacts[0].startsWith('EVFX Fresh Native/'));
    await rename(renamed,join(f.base,'collection','EVFX Fresh Native'));
    const moved=await discoverLocalPlugins(f.root,{...f,catalog:next.catalog,sources:next.sources});
    assert.deepEqual(moved.issues,[]);
    assert.deepEqual(moved.catalog.tools.map(tool=>tool.id),['studio-keyer']);
    assert.equal(moved.sources['studio-keyer'].base,'collection');
  }finally{await f.cleanup();}
});

test('product title changes update a plugin name even when its folder stays the same',async()=>{
  const f=await fixture();try{
    await addPackage(f,'EVFX Probe');
    const pkg=join(f.base,'EVFX Probe/package.json');
    await writeFile(pkg,JSON.stringify({productName:'EVFX Probe'}));
    const first=await discoverLocalPlugins(f.root,f);
    await writeFile(pkg,JSON.stringify({productName:'EVFX Spectrum'}));
    const next=await discoverLocalPlugins(f.root,{...f,catalog:first.catalog,sources:first.sources});
    assert.deepEqual(next.catalog.tools.map(tool=>tool.id),['probe']);
    assert.equal(next.catalog.tools[0].name,'Spectrum');
    assert(next.catalog.tools[0].aliases.includes('spectrum'));
    const unchanged=await discoverLocalPlugins(f.root,{...f,catalog:next.catalog,sources:next.sources});
    assert.deepEqual(unchanged.catalog,next.catalog);
    await writeFile(join(f.base,'EVFX Probe/README.md'),'# EVFX Probe v2.0.0\n\nAn After Effects utility.');
    const versionOnly=await discoverLocalPlugins(f.root,{...f,catalog:next.catalog,sources:next.sources});
    assert.equal(versionOnly.catalog.tools[0].name,'Spectrum');
  }finally{await f.cleanup();}
});

test('copied project identities cannot silently rename the active plugin',async()=>{
  const f=await fixture();try{
    await addPackage(f,'EVFX Original');
    for(const [file,data] of Object.entries({'sync.config.json':f.config,'catalog.json':f.catalog,'sources.json':f.sources}))await writeFile(join(f.root,file),JSON.stringify(data));
    await installBuildHooks(f.root);
    const first=await discoverLocalPlugins(f.root,f);
    await cp(join(f.base,'EVFX Original'),join(f.base,'EVFX Copy'),{recursive:true});
    const copied=await discoverLocalPlugins(f.root,{...f,catalog:first.catalog,sources:first.sources});
    assert.deepEqual(copied.issues,[]);
    assert.deepEqual(copied.catalog.tools.map(tool=>tool.name),['Original']);
    assert.equal(copied.sources.original.project,'EVFX Original');
    await cp(join(f.base,'EVFX Copy'),join(f.base,'EVFX Another Copy'),{recursive:true});
    await rename(join(f.base,'EVFX Original'),join(f.base,'archived-original'));
    const ambiguous=await discoverLocalPlugins(f.root,{...f,catalog:first.catalog,sources:first.sources});
    assert(ambiguous.issues.some(issue=>issue.includes('Multiple folders share')));
  }finally{await f.cleanup();}
});
test('updated packages replace older versions and source/reference archives are ignored',async()=>{
  const f=await fixture();try{
    await addPackage(f,'EVFX Flares','0.4.0-dev9');
    await addPackage(f,'EVFX Flares','0.4.0-dev17');
    await addPackage(f,'EVFX Flares','9.0.0','-Source');
    await addPackage(f,'EVFX Flares','9.0.0','-AI-reference');
    const result=await discoverLocalPlugins(f.root,f);
    assert.equal(result.sources.flares.version,'0.4.0-dev17');
    assert.equal(result.catalog.tools[0].readiness.state,'experimental');
  }finally{await f.cleanup();}
});
test('explicitly excluded projects cannot be rediscovered',async()=>{
  const f=await fixture();try{
    await addPackage(f,'EVFX Smart Denoise');await addPackage(f,'EVFX Match Grain');await addPackage(f,'EVFX Smart Grain');
    const result=await discoverLocalPlugins(f.root,f);
    assert.deepEqual(result.catalog.tools.map(t=>t.id),['smart-grain']);
  }finally{await f.cleanup();}
});

test('completed collection builds update additions and removals without hiding native Crop',async()=>{
  const f=await fixture();try{
    await addPackage(f,'EVFX New Utility');
    await addPackage(f,'EVFX Old Utility');
    await addPackage(f,'EVFX Crop');
    const project=join(f.base,'EVFX Utility Collection');await mkdir(project);
    const payload='// EVFX Utility Collection 1.3.0\ncompleted JSX';
    await writeFile(join(project,'Utility.jsx'),payload);
    const collection={schema:1,artifact:'Utility.jsx',sha256:createHash('sha256').update(payload).digest('hex'),members:[
      {id:'new-utility',name:'New Utility',tab:'New Utility',replaces:['old-utility']},
      {id:'crop-to-content',name:'Crop to Content',tab:'Crop'}
    ]};
    await writeFile(join(project,'evfx-release.json'),JSON.stringify({collection}));
    const result=await discoverLocalPlugins(f.root,f);
    assert.deepEqual(result.catalog.tools.map(t=>t.id).sort(),['crop','utility-collection']);
    const tool=result.catalog.tools.find(t=>t.id==='utility-collection');
    assert.equal(tool.description,'New Utility · Crop to Content');
    assert(tool.aliases.includes('new-utility'));assert(tool.aliases.includes('old-utility'));
    assert.deepEqual(result.sources['utility-collection'].collection,collection);
    assert.deepEqual(result.issues,[]);
    await addPackage(f,'EVFX Next Utility');
    const nextPayload=payload+'\nnext tool';
    collection.members.push({id:'next-utility',name:'Next Utility',tab:'Next Utility'});
    collection.sha256=createHash('sha256').update(nextPayload).digest('hex');
    await writeFile(join(project,'Utility.jsx'),nextPayload);
    await writeFile(join(project,'evfx-release.json'),JSON.stringify({collection}));
    const next=await discoverLocalPlugins(f.root,{...f,catalog:result.catalog,sources:result.sources});
    assert.deepEqual(next.catalog.tools.map(t=>t.id).sort(),['crop','utility-collection']);
    assert.equal(next.catalog.tools.find(t=>t.id==='utility-collection').description,'New Utility · Crop to Content · Next Utility');
    assert(next.catalog.tools.find(t=>t.id==='utility-collection').aliases.includes('next-utility'));
    collection.members.shift();
    collection.retired=['new-utility','old-utility'];
    const removedPayload=payload+'\nremoved tool';
    collection.sha256=createHash('sha256').update(removedPayload).digest('hex');
    await writeFile(join(project,'Utility.jsx'),removedPayload);
    await writeFile(join(project,'evfx-release.json'),JSON.stringify({collection}));
    const removed=await discoverLocalPlugins(f.root,{...f,catalog:next.catalog,sources:next.sources});
    assert.deepEqual(removed.issues,[]);
    assert.deepEqual(removed.catalog.tools.map(t=>t.id).sort(),['crop','utility-collection']);
    const current=removed.catalog.tools.find(t=>t.id==='utility-collection');
    assert.equal(current.description,'Crop to Content · Next Utility');
    assert(current.aliases.includes('new-utility'));assert(current.aliases.includes('old-utility'));
  }finally{await f.cleanup();}
});

test('a collection manifest for an unbuilt payload cannot absorb standalone tools',async()=>{
  const f=await fixture();try{
    await addPackage(f,'EVFX New Utility');
    const project=join(f.base,'EVFX Utility Collection');await mkdir(project);
    await writeFile(join(project,'Utility.jsx'),'// EVFX Utility Collection 1.3.0\nprevious completed build');
    await writeFile(join(project,'evfx-release.json'),JSON.stringify({collection:{schema:1,artifact:'Utility.jsx',sha256:'a'.repeat(64),members:[{id:'new-utility',name:'New Utility',tab:'New Utility'}]}}));
    const result=await discoverLocalPlugins(f.root,f);
    assert(result.issues.some(issue=>issue.includes('does not match the completed build')));
    assert(result.catalog.tools.some(tool=>tool.id==='new-utility'));
    assert.equal(result.sources['utility-collection'].collection,undefined);
  }finally{await f.cleanup();}
});

test('invalid retirement aliases defer discovery instead of claiming standalone tools',async()=>{
  const f=await fixture();try{
    await addPackage(f,'EVFX Old Utility');
    const project=join(f.base,'EVFX Utility Collection');await mkdir(project);
    const payload='// EVFX Utility Collection 1.3.0\ncompleted JSX';
    await writeFile(join(project,'Utility.jsx'),payload);
    for(const retired of ['old-utility',['../old-utility'],['current'],['old-utility','old-utility']]){
      await writeFile(join(project,'evfx-release.json'),JSON.stringify({collection:{
        schema:1,artifact:'Utility.jsx',sha256:createHash('sha256').update(payload).digest('hex'),
        members:[{id:'current',name:'Current',tab:'Current'}],retired
      }}));
      const scan=await discoverLocalPlugins(f.root,f);
      assert(scan.issues.length>0);
      assert(scan.catalog.tools.some(tool=>tool.id==='old-utility'));
      assert.equal(scan.sources['utility-collection'].collection,undefined);
    }
  }finally{await f.cleanup();}
});

test('automatically inferred script names cannot hide full native plugins with related names',async()=>{
  const f=await fixture();try{
    for(const [folder,id,kind] of [['EVFX Crop','crop-ae','Plugin + panel'],['EVFX Blurry','blurry','Native plugin']]){
      const path=await addPackage(f,folder);
      f.catalog.tools.push({id,name:folder.replace('EVFX ',''),host:'After Effects',kind});
      f.sources[id]={base:'dev',project:folder,version:'1.0.0',artifacts:[folder+'/release/'+basename(path)]};
    }
    await addPackage(f,'EVFX Other Native');
    await writeFile(join(f.base,'EVFX Other Native','CMakeLists.txt'),'project(OtherNative VERSION 1.0.0)\nset_target_properties(OtherNative PROPERTIES SUFFIX ".aex")');
    const project=join(f.base,'EVFX Utility Collection');await mkdir(project);
    const payload='// EVFX Utility Collection 1.3.0\ncompleted JSX';
    await writeFile(join(project,'Utility.jsx'),payload);
    await writeFile(join(project,'evfx-release.json'),JSON.stringify({collection:{schema:1,artifact:'Utility.jsx',sha256:createHash('sha256').update(payload).digest('hex'),members:[
      {id:'crop-to-content',name:'Crop to Content',tab:'Crop',replaces:['crop']},
      {id:'blurry',name:'Blurry Helper',tab:'Blurry'}
    ],retired:['other-native']}}));
    const result=await discoverLocalPlugins(f.root,f);
    assert.deepEqual(result.catalog.tools.map(tool=>tool.id).sort(),['blurry','crop-ae','other-native','utility-collection']);
    const aliases=result.catalog.tools.find(tool=>tool.id==='utility-collection').aliases;
    assert(!aliases.includes('blurry'));assert(!aliases.includes('other-native'));
    assert.deepEqual(result.issues,[]);
  }finally{await f.cleanup();}
});
test('generated directories and empty project folders do not become downloads',async()=>{
  const f=await fixture();try{
    await mkdir(join(f.base,'EVFX Empty','node_modules','EVFX Fake','release'),{recursive:true});
    await writeFile(join(f.base,'EVFX Empty','node_modules','EVFX Fake','release','EVFX-Fake-9.0.0-Windows.zip'),'not a release');
    const result=await discoverLocalPlugins(f.root,f);
    assert.equal(result.catalog.tools.length,0);
  }finally{await f.cleanup();}
});
test('incomplete readiness metadata cannot declare a new tool complete',async()=>{
  const f=await fixture();try{
    await addPackage(f,'EVFX Test Matte');
    await writeFile(join(f.base,'EVFX Test Matte','evfx-release.json'),JSON.stringify({readiness:{state:'complete',sha256:'a'.repeat(64)}}));
    const result=await discoverLocalPlugins(f.root,f);
    assert.equal(result.sources['test-matte'].review,undefined);
  }finally{await f.cleanup();}
});
test('a project can explicitly report an incomplete build without editing the website catalog',async()=>{
  const f=await fixture();try{
    await addPackage(f,'EVFX Matte');
    let result=await discoverLocalPlugins(f.root,f);
    result.catalog.tools[0].readiness={state:'reviewed',releaseTag:'earlier-build',evidence:'Earlier runtime checks'};
    await writeFile(join(f.base,'EVFX Matte','evfx-release.json'),JSON.stringify({readiness:{state:'incomplete',note:'Mask feathering is unfinished.'}}));
    result=await discoverLocalPlugins(f.root,{...f,catalog:result.catalog,sources:result.sources});
    assert.equal(result.catalog.tools[0].readiness.state,'incomplete');
    assert.equal(result.catalog.tools[0].readiness.note,'Mask feathering is unfinished.');
  }finally{await f.cleanup();}
});

test('a completed native build replaces a stale ZIP while retaining its package template',async()=>{
  const f=await fixture();try{
    await writeFile(join(f.root,'sync.config.json'),JSON.stringify(f.config));
    const zip=await addPackage(f,'EVFX Matte','1.0.0'),project=join(f.base,'EVFX Matte'),binary=join(project,'build','Release','EVFXMatte.aex');
    await mkdir(dirname(binary),{recursive:true});
    const cmake=join(project,'CMakeLists.txt');await writeFile(cmake,'project(EVFXMatte VERSION 1.1.0)');await writeFile(binary,'MZ completed native build');
    const now=Date.now()/1000;await utimes(cmake,now-200,now-200);await utimes(zip,now-100,now-100);
    await recordCompletedBuild(f.root,project,binary);
    let result=await discoverLocalPlugins(f.root,f);
    assert.equal(result.sources.matte.version,'1.1.0');assert.equal(result.sources.matte.files[0],'EVFX Matte/build/Release/EVFXMatte.aex');
    assert.equal(result.sources.matte.templateArtifact,'EVFX Matte/release/EVFX-Matte-1.0.0-Windows.zip');
    assert.equal(result.catalog.tools[0].readiness.state,'unverified');
    const newer=await addPackage(f,'EVFX Matte','1.2.0');await utimes(newer,now+50,now+50);
    result=await discoverLocalPlugins(f.root,f);assert.equal(result.sources.matte.version,'1.2.0');assert.equal(result.sources.matte.templateArtifact,undefined);
    await assert.rejects(recordCompletedBuild(f.root,project,zip),/must be an AEX/);
  }finally{await f.cleanup();}
});

test('an explicitly selected PixelPicker worktree replaces the legacy folder and ignores other worktrees',async()=>{
  const f=await fixture();try{
    const canonical=join(f.root,'..','EVFX-PixelPicker'),worktrees=join(canonical,'.claude','worktrees'),selected='evfx-pixelpicker-redesign',project=join(worktrees,selected);
    await mkdir(join(canonical,'build-aex','Release'),{recursive:true});await writeFile(join(canonical,'build-aex','Release','PixelPicker.aex'),'legacy');
    await mkdir(join(project,'build-aex','Release'),{recursive:true});await mkdir(join(worktrees,'evfx-old-experiment'),{recursive:true});
    const data=Buffer.alloc(22);data.write('MZMIB8REVe');data.writeUInt32LE(4,14);data.writeUInt32LE(1082881,18);
    await writeFile(join(project,'build-aex','Release','EVFX_PixelPicker.aex'),data);
    f.config.roots.push({id:'active',path:'../EVFX-PixelPicker/.claude/worktrees',projects:[selected]});
    f.catalog.tools.push({id:'pixel-picker',name:'PixelPicker',readiness:{state:'unverified'}});
    f.sources['pixel-picker']={base:'active',project:selected,version:'1.1.0',files:[`${selected}/build-aex/Release/EVFX_PixelPicker.aex`]};
    const result=await discoverLocalPlugins(f.root,f),source=result.sources['pixel-picker'];
    assert.equal(result.catalog.tools.length,1);assert.equal(source.version,'2.1.0');assert.equal(source.build,1);assert.equal(source.aeVersion,1082881);
    assert.equal(source.base,'active');assert.equal(source.files[0],`${selected}/build-aex/Release/EVFX_PixelPicker.aex`);
  }finally{await f.cleanup();}
});
