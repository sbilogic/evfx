import { readFile, writeFile, mkdir, copyFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { toolArt, heroArt } from './art.mjs';
import { getReadiness } from './readiness.mjs';
import { renderSupport } from './support.mjs';

export const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const [catalog, releases, supportConfig] = await Promise.all(['catalog.json','releases.lock.json','support.json'].map(async f=>JSON.parse(await readFile(join(root,f),'utf8'))));
const support=renderSupport(supportConfig);
const bytes = n => n >= 1e6 ? `${(n/1e6).toFixed(1)} MB` : `${Math.max(1,Math.round(n/1000))} KB`;

function toolRow(tool,release,variant,hasComplete) {
  const asset = release?.downloads.find(d=>d.primary) ?? release?.downloads[0];
  const version = release?.version ? `v${release.version}${release.build!==undefined?` b${release.build}`:''}` : '';
  const readiness=getReadiness(tool,release);
  const hasWarning=readiness.state!=='reviewed';
  const rowId=variant==='development'&&hasComplete?`${tool.id}-development`:tool.id;
  const warningId=`${rowId}-warning`;
  const meta=[tool.host,version,asset&&`${asset.name.endsWith('.exe')?'Setup':'ZIP'} ${bytes(asset.bytes)}`].filter(Boolean).map(escape).join(' · ');
  const action = asset
    ? `<a class="download" href="${escape(asset.url)}" aria-label="Download EVFX ${escape(tool.name)} ${escape(version)}"${hasWarning?` aria-describedby="${warningId}"`:''}>Download<span aria-hidden="true"> ↓</span></a>`
    : `<span class="no-download">No download</span>`;
  const notes = asset?`<details class="notes"><summary>Install<span class="sr-only"> EVFX ${escape(tool.name)}</span></summary><p class="req">${escape(tool.requirements)}</p><p>${escape(tool.install)}</p><p><a href="${escape(release.releaseUrl)}">Release${release.downloads.length>1?' & portable ZIP':''} ↗</a></p><p class="sha">${release.binary?'ZIP ':''}SHA-256 <code>${escape(asset.sha256)}</code>${release.binary?`<br>${escape(release.binary.name)} <code>${escape(release.binary.sha256)}</code>`:''}</p></details>`:'';
  return `<article id="${rowId}" class="tool${hasWarning?' is-dev':''}" data-product="${tool.id}" data-variant="${variant}"${variant==='development'?' hidden':''}>
    <div class="art">${toolArt(tool.art)}<span class="no" aria-hidden="true"></span>${hasWarning?`<span class="flag">⚠ ${escape(readiness.badge)}</span>`:''}</div>
    <h2>${escape(tool.name)}</h2>
    <p class="desc">${escape(tool.description)}</p>
    ${hasWarning?`<p id="${warningId}" class="warn"><span class="sr-only">${escape(readiness.title)}: </span>${escape(readiness.note)}</p>`:''}
    <div class="line"><span class="meta">${meta}</span>${action}</div>
    ${notes}
  </article>`;
}

let html = await readFile(join(root,'src/index.html'),'utf8');
const rows=[];
let completeCount=0,devCount=0;
const completeCategories=new Set();
for(const [index,tool] of catalog.tools.entries()){
  const latest=releases[tool.id];
  const complete=latest?.complete||(latest&&getReadiness(tool,latest).state==='reviewed'?latest:null);
  if(complete){rows.push(toolRow(tool,complete,'complete',true));completeCount++;completeCategories.add(tool.category);}
  if(!complete||latest.tag!==complete.tag){rows.push(toolRow(tool,latest,'development',!!complete));devCount++;}
}
const categoryLabels=new Map(catalog.tools.map(t=>[t.category,t.host]));
const replacements = {
  TITLE:escape(catalog.title), COUNT:completeCount, DEV_COUNT:devCount,
  DOWNLOAD_COUNT:catalog.tools.filter(t=>t.status!=='lab').length,
  WARNING_COUNT:catalog.tools.filter(t=>getReadiness(t,releases[t.id]).state!=='reviewed').length,
  YEAR: new Date().getFullYear(), HERO_ART:heroArt(),
  TOOLS:rows.join('\n'),
  APP_FILTERS:[...categoryLabels].map(([id,label])=>`<button type="button" data-filter="${escape(id)}" aria-pressed="false"${completeCategories.has(id)?'':' hidden'}>${escape(label)}</button>`).join(''),
  SUPPORT_NAV:support.nav, SUPPORT_SECTION:support.section
};
for(const [key,value] of Object.entries(replacements)) html=html.replaceAll(`{{${key}}}`,String(value));
html=html.replace(/>\s+</g,'><').trim();
await mkdir(join(root,'dist'),{recursive:true});
await writeFile(join(root,'dist/index.html'),html);
for(const file of ['style.css','app.js','favicon.svg']) await copyFile(join(root,'src',file),join(root,'dist',file));
await writeFile(join(root,'dist/.nojekyll'),'');
await writeFile(join(root,'dist/robots.txt'),'User-agent: *\nAllow: /\nSitemap: https://sbilogic.github.io/evfx/sitemap.xml\n');
await writeFile(join(root,'dist/sitemap.xml'),'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://sbilogic.github.io/evfx/</loc></url></urlset>');
let raw=0,gzip=0;
for(const file of await readdir(join(root,'dist'))) {
  const data=await readFile(join(root,'dist',file)); raw+=data.length; gzip+=gzipSync(data).length;
}
console.log(`Built ${catalog.tools.length} tools · ${(raw/1000).toFixed(1)} KB raw / ${(gzip/1000).toFixed(1)} KB gzip · zero dependencies`);
