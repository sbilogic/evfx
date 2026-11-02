import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,rm,utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,dirname,basename,resolve } from 'node:path';
import { discoverLocalPlugins,compareVersions,versionFromName } from '../scripts/local-plugins.mjs';
import { recordCompletedBuild } from '../scripts/completed-build.mjs';
import { createHash } from 'node:crypto';

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
test('Smart Denoise and Match Grain cannot be rediscovered',async()=>{
  const f=await fixture();try{
    await addPackage(f,'EVFX Smart Denoise');await addPackage(f,'EVFX Match Grain');await addPackage(f,'EVFX Smart Grain');
    const result=await discoverLocalPlugins(f.root,f);
    assert.deepEqual(result.catalog.tools.map(t=>t.id),['smart-grain']);
  }finally{await f.cleanup();}
});

test('a completed collection build absorbs a newly added tool and its old name without hiding native Crop',async()=>{
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
      {id:'blurry',name:'Blurry Helper',tab:'Blurry'},
      {id:'other-native',name:'Other Helper',tab:'Other'}
    ]}}));
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
