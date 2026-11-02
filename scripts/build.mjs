import { readFile, writeFile, mkdir, copyFile, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { toolArt, heroArt } from './art.mjs';
import { getReadiness } from './readiness.mjs';
import { renderSupport } from './support.mjs';
import { collectionDescription } from './collections.mjs';

export const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const [catalog, releases, supportConfig, explain] = await Promise.all(['catalog.json','releases.lock.json','support.json','explain.json'].map(async f=>JSON.parse(await readFile(join(root,f),'utf8'))));
const support=renderSupport(supportConfig);
const [styleVersion,appVersion]=await Promise.all(['style.css','app.js'].map(async file=>createHash('sha256').update(await readFile(join(root,'src',file))).digest('hex').slice(0,10)));
const bytes = n => n >= 1e6 ? `${(n/1e6).toFixed(1)} MB` : `${Math.max(1,Math.round(n/1000))} KB`;
const site = 'https://sbilogic.github.io/evfx/';
const utcTime = new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:'UTC',timeZoneName:'short'});

// Meta, download and install notes, shared by the grid and the detail pages.
function download(tool,release,warningId) {
  const asset = release?.downloads.find(d=>d.primary) ?? release?.downloads[0];
  const version = release?.version ? `v${release.version}${release.build!==undefined?` b${release.build}`:''}` : '';
  const meta=[tool.host,version,asset&&`${asset.name.endsWith('.exe')?'Setup':'ZIP'} ${bytes(asset.bytes)}`].filter(Boolean).map(escape).join(' · ');
  const timestamp=asset?.uploadedAt||release?.publishedAt;
  const date=new Date(timestamp);
  const uploaded=asset&&Number.isFinite(date.getTime())?`<span class="upload-time">${asset.uploadedAt?'Uploaded':'Published'} <time datetime="${escape(timestamp)}" title="${escape(date.toUTCString())}">${escape(utcTime.format(date))}</time></span>`:'';
  const action = asset
    ? `<a class="download" href="${escape(asset.url)}" aria-label="Download EVFX ${escape(tool.name)} ${escape(version)}"${warningId?` aria-describedby="${warningId}"`:''}>Download<span aria-hidden="true"> ↓</span></a>`
    : `<span class="no-download">No download</span>`;
  const notes = asset?`<details class="notes"><summary>Install<span class="sr-only"> EVFX ${escape(tool.name)}</span></summary><p class="req">${escape(tool.requirements)}</p><p>${escape(tool.install)}</p><p><a href="${escape(release.releaseUrl)}">Release${release.downloads.length>1?' & portable ZIP':''} ↗</a></p><p class="sha">${release.binary?'ZIP ':''}SHA-256 <code>${escape(asset.sha256)}</code>${release.binary?`<br>${escape(release.binary.name)} <code>${escape(release.binary.sha256)}</code>`:''}</p></details>`:'';
  return `<div class="line"><span class="release-meta"><span class="meta">${meta}</span>${uploaded}</span>${action}</div>${notes}`;
}

function toolRow(tool,release,variant,hasComplete) {
  const readiness=getReadiness(tool,release);
  const hasWarning=readiness.state!=='reviewed';
  const rowId=variant==='development'&&hasComplete?`${tool.id}-development`:tool.id;
  const warningId=`${rowId}-warning`;
  const page=variant==='complete'&&explain[tool.id]?`./${tool.id}/`:null;
  const aliases=tool.aliases?.length?` data-aliases="${escape(tool.aliases.join(' '))}"`:'';
  const art=`${toolArt(tool.art)}<span class="no" aria-hidden="true"></span>${hasWarning?`<span class="flag">⚠ ${escape(readiness.badge)}</span>`:''}`;
  return `<article id="${rowId}" class="tool${hasWarning?' is-dev':''}" data-product="${tool.id}" data-variant="${variant}"${aliases}${variant==='development'?' hidden':''}>
    ${page?`<a class="art" href="${page}" tabindex="-1" aria-hidden="true">${art}</a>`:`<div class="art">${art}</div>`}
    <h3>${page?`<a href="${page}">${escape(tool.name)}</a>`:escape(tool.name)}</h3>
    <p class="desc">${escape(release?.collection?collectionDescription(release.collection):tool.description)}</p>
    ${page?`<a class="how" href="${page}">How it works <span aria-hidden="true">→</span></a>`:''}
    ${hasWarning?`<p id="${warningId}" class="warn"><span class="sr-only">${escape(readiness.title)}: </span>${escape(readiness.note)}</p>`:''}
    ${download(tool,release,hasWarning&&warningId)}
  </article>`;
}

function detailPage(template,tool,release) {
  const {steps,limits}=explain[tool.id];
  const body=`<article class="detail">
    <div class="detail-art" aria-hidden="true">${toolArt(tool.art)}</div>
    <div class="detail-head"><h1>${escape(tool.name)}</h1><p class="desc">${escape(release?.collection?collectionDescription(release.collection):tool.description)}</p>${download(tool,release)}</div>
    <section class="flow" aria-labelledby="flow-title"><h2 id="flow-title">How it works</h2><ol>${steps.map(([title,text])=>`<li><h3>${escape(title)}</h3><p>${escape(text)}</p></li>`).join('')}</ol></section>
    <section class="limits" aria-labelledby="limits-title"><h2 id="limits-title">Limits</h2><ul>${limits.map(l=>`<li>${escape(l)}</li>`).join('')}</ul></section>
  </article>`;
  return template.replaceAll('{{NAME}}',escape(tool.name)).replaceAll('{{DESCRIPTION}}',escape(release?.collection?collectionDescription(release.collection):tool.description))
    .replaceAll('{{URL}}',`${site}${tool.id}/`).replace('{{BODY}}',body);
}

let html = await readFile(join(root,'src/index.html'),'utf8');
const pageTemplate = await readFile(join(root,'src/tool.html'),'utf8');
const groups=new Map(),pages=[];
let completeCount=0,devCount=0;
for(const tool of catalog.tools){
  const latest=releases[tool.id];
  const complete=latest?.complete||(latest&&getReadiness(tool,latest).state==='reviewed'?latest:null);
  if(!groups.has(tool.category))groups.set(tool.category,{host:tool.host,rows:[],complete:0});
  const group=groups.get(tool.category);
  if(complete){group.rows.push(toolRow(tool,complete,'complete',true));group.complete++;completeCount++;if(explain[tool.id])pages.push([tool,complete]);}
  if(!complete||latest.tag!==complete.tag){group.rows.push(toolRow(tool,latest,'development',!!complete));devCount++;}
}
const year=new Date().getFullYear();
const replacements = {
  TITLE:escape(catalog.title), COUNT:completeCount, DEV_COUNT:devCount,
  YEAR:year, HERO_ART:heroArt(), TOOLS:[...groups].map(([category,group])=>`<section class="library-group" data-category-group="${category}" aria-labelledby="host-${category}"${group.complete?'':' hidden'}><h2 id="host-${category}" class="library-label">${escape(group.host)}</h2><div class="grid">${group.rows.join('\n')}</div></section>`).join('\n'), SUPPORT_NAV:support.nav,
  STYLE_VERSION:styleVersion, APP_VERSION:appVersion
};
const fill=text=>{for(const [key,value] of Object.entries(replacements)) text=text.replaceAll(`{{${key}}}`,String(value));return text.replace(/>\s+</g,'><').trim();};
await rm(join(root,'dist'),{recursive:true,force:true});
await mkdir(join(root,'dist'),{recursive:true});
await writeFile(join(root,'dist/index.html'),fill(html));
for(const [tool,release] of pages){
  await mkdir(join(root,'dist',tool.id),{recursive:true});
  await writeFile(join(root,'dist',tool.id,'index.html'),fill(detailPage(pageTemplate,tool,release)));
}
for(const tool of catalog.tools)for(const alias of tool.aliases||[]){
  await mkdir(join(root,'dist',alias),{recursive:true});
  const destination=`../#${tool.id}`;
  await writeFile(join(root,'dist',alias,'index.html'),`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="refresh" content="0;url=${destination}"><link rel="canonical" href="${site}#${tool.id}"><title>EVFX ${escape(tool.name)}</title></head><body><a href="${destination}">Continue to ${escape(tool.name)}</a></body></html>`);
}
for(const file of ['style.css','app.js','favicon.svg']) await copyFile(join(root,'src',file),join(root,'dist',file));
await writeFile(join(root,'dist/.nojekyll'),'');
await writeFile(join(root,'dist/robots.txt'),`User-agent: *\nAllow: /\nSitemap: ${site}sitemap.xml\n`);
await writeFile(join(root,'dist/sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['',...pages.map(([t])=>`${t.id}/`)].map(p=>`<url><loc>${site}${p}</loc></url>`).join('')}</urlset>`);
let raw=0,gzip=0;
for(const file of await readdir(join(root,'dist'),{recursive:true,withFileTypes:true})) {
  if(!file.isFile())continue;
  const data=await readFile(join(file.parentPath,file.name)); raw+=data.length; gzip+=gzipSync(data).length;
}
console.log(`Built ${catalog.tools.length} tools, ${pages.length} detail pages · ${(raw/1000).toFixed(1)} KB raw / ${(gzip/1000).toFixed(1)} KB gzip · zero dependencies`);
