import { getReadiness } from './readiness.mjs';
import { compareVersions } from './local-plugins.mjs';

// This URL is a long-lived contract for installed clients. Only reviewed,
// immutable Windows installers enter the stable channel.
export function sequencerUpdateFeed(catalog, releases) {
  const tool = catalog.tools.find(t => t.id === 'sequencer');
  const latest = releases.sequencer;
  const candidates = [latest, latest?.complete].filter(Boolean)
    .filter(r => /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(r.version || '') &&
      !r.prerelease && r.review?.state === 'complete' && r.review.runtimeVerified === true && tool && getReadiness(tool, r).state === 'reviewed')
    .sort((a,b) => compareVersions(b.version,a.version));
  let release = null;
  for (const candidate of candidates) {
    const filename = `EVFX-Sequencer-${candidate.version}-Windows-x64-Setup.exe`;
    const asset = candidate.downloads.find(a => a.primary && a.name === filename);
    if (!asset || candidate.review.sha256 !== asset.sha256 || !/^[a-f0-9]{64}$/.test(asset.sha256) || !Number.isSafeInteger(asset.bytes) ||
        asset.bytes < 1 || asset.bytes > 1073741824) continue;
    let download,notes;
    try { download=new URL(asset.url);notes=new URL(candidate.releaseUrl); } catch { continue; }
    const valid = u => u.origin === 'https://github.com' && !u.username && !u.password && !u.search && !u.hash;
    if (!valid(download) || !valid(notes) || !download.pathname.startsWith('/sbilogic/evfx/releases/download/') ||
        !download.pathname.endsWith('/'+filename) || !notes.pathname.startsWith('/sbilogic/evfx/releases/tag/')) continue;
    release = { version:candidate.version, published_at:candidate.publishedAt,
      release_url:notes.href, filename, url:download.href, bytes:asset.bytes, sha256:asset.sha256 };
    break;
  }
  return { schema_version:1, product:'evfx-sequencer', channel:'stable', release };
}

export function corridorKeyUpdateFeed(releases) {
  const latest = releases['corridor-key'];
  const candidates = [latest, latest?.complete].filter(candidate =>
    candidate && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(candidate.version || '')
  ).sort((a,b) => compareVersions(b.version,a.version));
  let release = null;
  for (const candidate of candidates) {
    const filename = `EVFX-Corridor-Key-2.0-${candidate.version}-Windows-x64-Setup.exe`;
    const asset = candidate.downloads?.find(item => item.primary && item.name === filename);
    const tagPrefix = `corridor-key-v${candidate.version}-`;
    if (!candidate.tag?.startsWith(tagPrefix) || !/^[a-f0-9]{10}$/.test(candidate.tag.slice(tagPrefix.length)) ||
        !asset || !/^[a-f0-9]{64}$/.test(asset.sha256 || '') || !Number.isSafeInteger(asset.bytes) ||
        asset.bytes < 1 || asset.bytes > 536870912) continue;
    const root = 'https://github.com/sbilogic/evfx/releases';
    const download = `${root}/download/${candidate.tag}/${filename}`;
    const notes = `${root}/tag/${candidate.tag}`;
    if (asset.url !== download || candidate.releaseUrl !== notes) continue;
    release = {version:candidate.version, published_at:candidate.publishedAt, release_url:notes,
      filename, url:download, bytes:asset.bytes, sha256:asset.sha256,
      prerelease:candidate.prerelease !== false || candidate.review?.runtimeVerified !== true};
    break;
  }
  return {schema_version:1, product:'evfx-corridor-key', channel:'preview', release};
}
