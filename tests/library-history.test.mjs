import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,cp,writeFile,readFile,rm } from 'node:fs/promises';
import { dirname,basename,resolve,join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

test('removed plugins have library redirects without stale cards or explanation pages',async()=>{
  const base=await mkdtemp(join(tmpdir(),'evfx-history-'));
  const source=dirname(dirname(fileURLToPath(import.meta.url)));
  try{
    for(const dir of ['scripts','src'])await cp(join(source,dir),join(base,dir),{recursive:true});
    const data={
      'catalog.json':{repository:'example/evfx',title:'EVFX',tools:[],retired:[{id:'retired-keyer',name:'Old Keyer',aliases:['older-keyer']}]},
      'sources.json':{},'releases.lock.json':{},'support.json':{},
      'sync.config.json':{excludedIds:[]},
      'explain.json':{'retired-keyer':{steps:[['Key','Old explanation.']],limits:[]}}
    };
    for(const [file,value] of Object.entries(data))await writeFile(join(base,file),JSON.stringify(value));
    for(const script of ['check','build']){
      const run=spawnSync(process.execPath,['scripts/'+script+'.mjs'],{cwd:base,encoding:'utf8',windowsHide:true});
      assert.equal(run.status,0,run.stderr);
    }
    const html=await readFile(join(base,'dist/index.html'),'utf8');
    assert(!html.includes('Old Keyer'));
    assert(!html.includes('class="tool'));
    assert(html.includes('data-retired="retired-keyer older-keyer"'));
    for(const id of ['retired-keyer','older-keyer']){
      const redirect=await readFile(join(base,'dist',id,'index.html'),'utf8');
      assert(redirect.includes('url=../#collection'));
      assert(!redirect.includes('Old explanation.'));
    }
    assert(!(await readFile(join(base,'dist/sitemap.xml'),'utf8')).includes('retired-keyer'));
  }finally{
    assert.equal(dirname(resolve(base)),resolve(tmpdir()));assert.match(basename(base),/^evfx-history-/);
    await rm(base,{recursive:true,force:true});
  }
});

test('a Windows alpha lists its matching Android APK with a visible warning',async()=>{
  const base=await mkdtemp(join(tmpdir(),'evfx-history-'));
  const source=dirname(dirname(fileURLToPath(import.meta.url)));
  try{
    for(const dir of ['scripts','src'])await cp(join(source,dir),join(base,dir),{recursive:true});
    const url='https://github.com/example/evfx/releases',tag='omnicast-v0.17.5',sha='a'.repeat(64);
    const tool={id:'omnicast',name:'Omnicast',host:'Windows',category:'windows',kind:'Standalone app',art:'orbit',androidCompanion:true,description:'Share files on a local network.',detail:'Share files on a local network.',requirements:'Windows x64',install:'Run setup.',status:'preview',readiness:{state:'experimental',evidence:'Release notes',note:'Alpha build.'}};
    const downloads=[{name:'Omnicast-Setup-0.17.5.exe',url:url+'/download/'+tag+'/Omnicast-Setup-0.17.5.exe',bytes:100,sha256:sha,primary:true},{name:'Omnicast-Android-0.17.5.apk',url:url+'/download/'+tag+'/Omnicast-Android-0.17.5.apk',bytes:50,sha256:sha,primary:false}];
    const data={'catalog.json':{repository:'example/evfx',title:'EVFX',tools:[tool]},'sources.json':{omnicast:{}},'releases.lock.json':{omnicast:{version:'0.17.5',tag,prerelease:true,releaseUrl:url+'/tag/'+tag,downloads}},'support.json':{},'sync.config.json':{excludedIds:[]},'explain.json':{}};
    for(const [file,value] of Object.entries(data))await writeFile(join(base,file),JSON.stringify(value));
    for(const script of ['check','build']){
      const run=spawnSync(process.execPath,['scripts/'+script+'.mjs'],{cwd:base,encoding:'utf8',windowsHide:true});
      assert.equal(run.status,0,run.stderr);
    }
    const html=await readFile(join(base,'dist/index.html'),'utf8');
    assert(html.includes('data-variant="development" hidden'));
    assert(html.includes('⚠ Experimental'));
    assert(html.includes('Android APK'));
    assert(html.includes(downloads[1].url));
    assert(!html.includes('portable ZIP'));
  }finally{assert.equal(dirname(resolve(base)),resolve(tmpdir()));assert.match(basename(base),/^evfx-history-/);await rm(base,{recursive:true,force:true});}
});
