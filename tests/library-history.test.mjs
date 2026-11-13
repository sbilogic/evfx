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
    assert(html.includes('data-variant="development"'));
    assert(!html.includes('data-variant="development" hidden'));
    assert(html.includes('⚠ Experimental'));
    assert(html.includes('Android APK'));
    assert(html.includes(downloads[1].url));
    assert(!html.includes('portable ZIP'));
  }finally{assert.equal(dirname(resolve(base)),resolve(tmpdir()));assert.match(basename(base),/^evfx-history-/);await rm(base,{recursive:true,force:true});}
});

test('older native releases warn that their installers may predate fixes',async()=>{
  const base=await mkdtemp(join(tmpdir(),'evfx-history-'));
  const source=dirname(dirname(fileURLToPath(import.meta.url)));
  try{
    for(const dir of ['scripts','src'])await cp(join(source,dir),join(base,dir),{recursive:true});
    const url='https://github.com/example/evfx/releases',sha='a'.repeat(64);
    const makeTool=(id,kind)=>({id,name:id,host:'After Effects',category:'ae',kind,art:'screen',description:'A tool.',detail:'A tool.',requirements:'Windows',install:'Run setup.',status:'preview',readiness:{state:'unverified',note:'Unverified.'}});
    const makeRelease=id=>({version:'2.0.0',tag:id+'-v2',prerelease:true,releaseUrl:url+'/tag/'+id+'-v2',downloads:[{name:id+'.zip',url:url+'/download/'+id+'-v2/'+id+'.zip',bytes:100,sha256:sha,primary:true}],history:[{version:'2.0.0',tag:id+'-v2',publishedAt:'2026-01-02T00:00:00Z',releaseUrl:url+'/tag/'+id+'-v2'},{version:'1.0.0',tag:id+'-v1',publishedAt:'2026-01-01T00:00:00Z',releaseUrl:url+'/tag/'+id+'-v1'}]});
    const data={'catalog.json':{repository:'example/evfx',title:'EVFX',tools:[makeTool('native','Native plugin'),makeTool('panel','ScriptUI panel')]},'releases.lock.json':{native:makeRelease('native'),panel:makeRelease('panel')},'support.json':{},'explain.json':{}};
    for(const [file,value] of Object.entries(data))await writeFile(join(base,file),JSON.stringify(value));
    const run=spawnSync(process.execPath,['scripts/build.mjs'],{cwd:base,encoding:'utf8',windowsHide:true});assert.equal(run.status,0,run.stderr);
    const html=await readFile(join(base,'dist/index.html'),'utf8');
    const native=html.match(/<article id="native"[\s\S]*?<\/article>/)?.[0]||'';
    const panel=html.match(/<article id="panel"[\s\S]*?<\/article>/)?.[0]||'';
    assert(native.includes('Older release downloads may not include installer fixes.'));
    assert(!panel.includes('Older release downloads may not include installer fixes.'));
  }finally{assert.equal(dirname(resolve(base)),resolve(tmpdir()));assert.match(basename(base),/^evfx-history-/);await rm(base,{recursive:true,force:true});}
});

