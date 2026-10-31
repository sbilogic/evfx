import assert from 'node:assert/strict';
import { readFile,readdir } from 'node:fs/promises';
import { dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderSupport } from './support.mjs';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const load=async name=>JSON.parse(await readFile(join(root,name),'utf8'));
const [catalog,sources,releases]=await Promise.all(['catalog.json','sources.json','releases.lock.json'].map(load));
renderSupport(await load('support.json'));
const ids=new Set();
for(const tool of catalog.tools){
  assert.match(tool.id,/^[a-z][a-z0-9-]+$/);
  assert(!ids.has(tool.id),`Duplicate tool ID ${tool.id}`);ids.add(tool.id);
  for(const key of ['name','host','kind','description','detail','requirements','install','art'])assert(tool[key],`${tool.id} needs ${key}`);
  assert(['ae','blender','windows'].includes(tool.category));
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
  assert.match(release.releaseUrl,new RegExp(`^https://github\\.com/${catalog.repository}/releases/tag/`));
  assert(release.downloads.length>0);
  assert.equal(release.downloads.filter(a=>a.primary).length,1,'Exactly one primary download per tool');
  for(const asset of release.downloads){
    const url=new URL(asset.url);
    assert.equal(url.protocol,'https:');assert.equal(url.hostname,'github.com');
    assert(url.pathname.startsWith(`/${catalog.repository}/releases/download/`));
    assert.match(asset.sha256,/^[a-f0-9]{64}$/);
    assert(asset.bytes>0);
    assert(/\.(exe|zip)$/.test(asset.name));
  }
}
for(const id of Object.keys(releases))assert(ids.has(id),`Unknown tool in release lock: ${id}`);
for(const id of Object.keys(sources))assert(ids.has(id),`Unknown distribution source: ${id}`);
for(const file of ['index.html','style.css','app.js','favicon.svg'])assert((await readFile(join(root,'src',file))).length>0);
const src=await readFile(join(root,'src/index.html'),'utf8');
assert(!/https?:\/\/[^" ]+\.(?:js|css|woff2?)/.test(src),'Site must not depend on external runtime assets');
assert(src.includes('name="viewport"'));
assert(src.includes('class="skip-link"'));
console.log(`Catalog checks passed: ${ids.size} tools, ${Object.keys(releases).length} release manifests.`);
