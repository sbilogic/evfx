import { readFile, writeFile, mkdir, copyFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { toolArt, heroArt } from './art.mjs';

export const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const [catalog, releases] = await Promise.all(['catalog.json','releases.lock.json'].map(async f=>JSON.parse(await readFile(join(root,f),'utf8'))));
const bytes = n => n >= 1e6 ? `${(n/1e6).toFixed(1)} MB` : `${Math.max(1,Math.round(n/1000))} KB`;

function toolRow(tool,index) {
  const release = releases[tool.id];
  const asset = release?.downloads.find(d=>d.primary) ?? release?.downloads[0];
  const version = release?.version ? `v${release.version}` : tool.status==='lab' ? 'In development' : 'Snapshot';
  const status = ['preview','legacy'].includes(tool.status) ? `<span class="status-badge status-${tool.status}">${tool.status}</span>` : '';
  const action = asset
    ? `<a class="download-link" href="${escape(asset.url)}" aria-label="Download EVFX ${escape(tool.name)}, ${escape(version)}">Download <span aria-hidden="true">↗</span></a><span class="download-size">${escape(asset.name.endsWith('.exe')?'SETUP':'ZIP')} / ${bytes(asset.bytes)}</span>`
    : `<span class="lab-label">${tool.status==='lab'?'IN THE LAB<br>↗ STILL EXPLORING':'RELEASE PENDING'}</span>`;
  const search = `${tool.name} EVFX ${tool.host} ${tool.kind} ${tool.description} ${tool.detail}`.toLocaleLowerCase();
  return `<article id="${tool.id}" class="tool tool-${tool.status}" data-category="${tool.category}" data-search="${escape(search)}">
    <span class="tool-number" aria-hidden="true">${String(index+1).padStart(2,'0')}</span>
    <div class="tool-art">${toolArt(tool.art)}</div>
    <div class="tool-identity"><h3><span class="tool-name-prefix">EVFX </span>${escape(tool.name)}</h3><div class="tool-meta"><span>${escape(tool.host)}</span><span class="meta-dot" aria-hidden="true"></span><span>${escape(version)}</span>${status}</div></div>
    <p class="tool-description">${escape(tool.description)}</p>
    <div class="tool-action">${action}</div>
    <details class="tool-notes"><summary>About & install<span class="sr-only"> EVFX ${escape(tool.name)}</span></summary><div class="notes-content"><div><p class="note-label">WHAT IT DOES</p><p>${escape(tool.detail)}</p></div><div><p class="note-label">GET GOING</p><p>${escape(tool.install)}</p>${release?`<a class="release-link" href="${escape(release.releaseUrl)}">Release notes${release.downloads.length>1?' & portable download':''} ↗</a>`:''}</div><p class="requirements">${escape(tool.requirements)}</p>${asset?`<div class="checksum">SHA-256 <code>${escape(asset.sha256)}</code></div>`:''}</div></details>
  </article>`;
}

let html = await readFile(join(root,'src/index.html'),'utf8');
const replacements = {
  TITLE:escape(catalog.title), COUNT:catalog.tools.length,
  DOWNLOAD_COUNT:catalog.tools.filter(t=>t.status!=='lab').length,
  YEAR: new Date().getFullYear(), HERO_ART:heroArt(),
  TOOLS:catalog.tools.map(toolRow).join('\n')
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
