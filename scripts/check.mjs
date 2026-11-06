import assert from 'node:assert/strict';
import { readFile,readdir } from 'node:fs/promises';
import { dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderSupport } from './support.mjs';
import { getReadiness } from './readiness.mjs';
import { retiredPluginIds } from './project-identity.mjs';
import { validateMobileRelease } from './mobile-release.mjs';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const load=async name=>JSON.parse(await readFile(join(root,name),'utf8'));
const [catalog,sources,releases]=await Promise.all(['catalog.json','sources.json','releases.lock.json'].map(load));
const config=await load('sync.config.json');
renderSupport(await load('support.json'));
const ids=new Set();
for(const tool of catalog.tools){
  assert.match(tool.id,/^[a-z][a-z0-9-]+$/);
  assert(!ids.has(tool.id),`Duplicate tool ID ${tool.id}`);ids.add(tool.id);
  assert(!config.excludedIds.includes(tool.id),`${tool.id} is excluded from this collection`);
  for(const key of ['name','host','kind','description','detail','requirements','install','art'])assert(tool[key],`${tool.id} needs ${key}`);
  assert.match(tool.category,/^[a-z][a-z0-9-]*$/);
  assert(['release','preview','legacy','lab'].includes(tool.status));
  assert(tool.readiness,`${tool.id} needs an explicit readiness review`);
  assert(['reviewed','incomplete','experimental','unverified','legacy','development'].includes(tool.readiness.state),`${tool.id} has an invalid readiness state`);
  assert(tool.readiness.evidence,`${tool.id} needs a readiness evidence note`);
  if(tool.readiness.state==='reviewed'){
    assert.equal(tool.status,'release',`${tool.id}: preview, legacy and lab tools must carry a warning`);
    assert(tool.readiness.releaseTag,`${tool.id}: a review must identify the exact release`);
  }else assert(tool.readiness.note,`${tool.id} needs a visible warning explaining the limitation`);
  if(tool.status!=='lab')assert(sources[tool.id],`Missing distribution source for ${tool.id}`);
  const release=releases[tool.id];
  if(process.argv.includes('--require-downloads')&&tool.status!=='lab')assert(release,`${tool.id} needs a published release`);
  if(!release)continue;
  if(release.complete){assert.equal(getReadiness(tool,release.complete).state,'reviewed',`${tool.id}: complete download lacks a matching review`);}
  assert.match(release.releaseUrl,new RegExp(`^https://github\\.com/${catalog.repository}/releases/tag/`));
  assert(release.downloads.length>0);
  assert.equal(release.downloads.filter(a=>a.primary).length,1,'Exactly one primary download per tool');
  for(const asset of release.downloads){
    const url=new URL(asset.url);
    assert.equal(url.protocol,'https:');assert.equal(url.hostname,'github.com');
    assert(url.pathname.startsWith(`/${catalog.repository}/releases/download/`));
    assert.match(asset.sha256,/^[a-f0-9]{64}$/);
    assert(asset.bytes>0);
    assert(/\.(exe|zip)$/i.test(asset.name)||tool.androidCompanion&&!asset.primary&&/[-_]android[-_].*\.apk$/i.test(asset.name));
  }
}
for(const id of Object.keys(releases))assert(ids.has(id),`Unknown tool in release lock: ${id}`);
for(const id of Object.keys(sources))assert(ids.has(id),`Unknown distribution source: ${id}`);
const mobile=await load('mobile-releases.json').catch(e=>{if(e.code==='ENOENT')return {};throw e;});
for(const [id,release] of Object.entries(mobile)){assert(ids.has(id),`Unknown mobile tool: ${id}`);validateMobileRelease(release,catalog.repository);}
const aliases=new Set();
for(const tool of catalog.tools)for(const alias of tool.aliases||[]){
  assert.match(alias,/^[a-z][a-z0-9-]+$/);
  assert(!ids.has(alias)&&!aliases.has(alias),`Conflicting legacy URL: ${alias}`);
  aliases.add(alias);
}
const retiredIds=new Set();
for(const tool of catalog.retired||[]){
  assert(!ids.has(tool.id)&&!retiredIds.has(tool.id),'Duplicate retired plugin: '+tool.id);
  retiredIds.add(tool.id);
  for(const id of [tool.id,...(tool.aliases||[])])assert.match(id,/^[a-z][a-z0-9-]+$/);
}
for(const id of retiredPluginIds(catalog))aliases.add(id);
const explain=await load('explain.json');
for(const [id,page] of Object.entries(explain)){
  assert(ids.has(id)||aliases.has(id),`Unknown tool in explain.json: ${id}`);
  assert(page.steps?.length&&page.steps.every(s=>s.length===2&&s[0]&&s[1]),`${id} needs titled steps`);
  assert(Array.isArray(page.limits),`${id} needs a limits list`);
}
for(const file of ['index.html','tool.html','style.css','app.js','favicon.svg'])assert((await readFile(join(root,'src',file))).length>0);
const src=await readFile(join(root,'src/index.html'),'utf8');
assert(!/https?:\/\/[^" ]+\.(?:js|css|woff2?)/.test(src),'Site must not depend on external runtime assets');
assert(src.includes('name="viewport"'));
assert(src.includes('class="skip-link"'));
console.log(`Catalog checks passed: ${ids.size} tools, ${Object.keys(releases).length} release manifests.`);
