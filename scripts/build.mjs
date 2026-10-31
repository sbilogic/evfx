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

function toolRow(tool,index,release,variant,hasComplete) {
  const asset = release?.downloads.find(d=>d.primary) ?? release?.downloads[0];
  const version = release?.version ? `v${release.version}${release.build!==undefined?` (build ${release.build})`:''}` : tool.status==='lab' ? 'In development' : 'Snapshot';
  const readiness=getReadiness(tool,release);
  const hasWarning=readiness.state!=='reviewed';
  const rowId=variant==='development'&&hasComplete?`${tool.id}-development`:tool.id;
  const warningId=`${rowId}-warning`;
  const warning=hasWarning?`<aside id="${warningId}" class="tool-warning" aria-label="EVFX ${escape(tool.name)}: ${escape(readiness.title)}"><span class="warning-symbol" aria-hidden="true">⚠</span><p>${escape(readiness.note)}</p></aside>`:'';
  const action = asset
    ? `<a class="download-link" href="${escape(asset.url)}" aria-label="Download EVFX ${escape(tool.name)}, ${escape(version)}"${hasWarning?` aria-describedby="${warningId}"`:''}>Download <span aria-hidden="true">↗</span></a>${hasWarning?`<span class="download-caution">⚠ ${escape(readiness.badge)}</span>`:''}<span class="download-size">${escape(asset.name.endsWith('.exe')?'SETUP':'ZIP')} / ${bytes(asset.bytes)}</span>`
    : `<span class="lab-label">${tool.status==='lab'?'No download':'Release pending'}</span>`;
  const search = `${tool.name} EVFX ${tool.host} ${tool.kind} ${tool.description} ${tool.detail} ${readiness.title||''} ${readiness.note||''}`.toLocaleLowerCase();
  return `<article id="${rowId}" class="tool tool-${tool.status}" data-product="${tool.id}" data-variant="${variant}" data-category="${escape(tool.category)}" data-search="${escape(search)}"${variant==='development'?' hidden':''}>
    <span class="tool-number" aria-hidden="true">${String(index+1).padStart(2,'0')}</span>
    <div class="tool-art">${toolArt(tool.art)}</div>
    <div class="tool-identity"><h3><span class="tool-name-prefix">EVFX </span>${escape(tool.name)}</h3><div class="tool-meta"><span>${escape(tool.host)}</span><span class="meta-dot" aria-hidden="true"></span><span>${escape(version)}</span></div></div>
    <p class="tool-description">${escape(tool.description)}</p>
    <div class="tool-action">${action}</div>
    ${warning}
    ${asset?`<details class="tool-notes"><summary>Install & requirements<span class="sr-only"> — EVFX ${escape(tool.name)}</span></summary><div class="notes-content"><p class="requirements">${escape(tool.requirements)}</p><p>${escape(tool.install)}</p><a class="release-link" href="${escape(release.releaseUrl)}">Release notes${release.downloads.length>1?' & portable ZIP':''} ↗</a><div class="checksum">${release.binary?'ZIP ':''}SHA-256 <code>${escape(asset.sha256)}</code></div>${release.binary?`<div class="checksum">${escape(release.binary.name)} SHA-256 <code>${escape(release.binary.sha256)}</code></div>`:''}</div></details>`:''}
  </article>`;
}

let html = await readFile(join(root,'src/index.html'),'utf8');
const rows=[];
let completeCount=0;
const completeCategories=new Set();
for(const [index,tool] of catalog.tools.entries()){
  const latest=releases[tool.id];
  const complete=latest?.complete||(latest&&getReadiness(tool,latest).state==='reviewed'?latest:null);
  if(complete){rows.push(toolRow(tool,completeCount++,complete,'complete',true));completeCategories.add(tool.category);}
  if(!complete||latest.tag!==complete.tag)rows.push(toolRow(tool,index,latest,'development',!!complete));
}
const categoryLabels=new Map(catalog.tools.map(t=>[t.category,t.host]));
const replacements = {
  TITLE:escape(catalog.title), COUNT:completeCount,
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
