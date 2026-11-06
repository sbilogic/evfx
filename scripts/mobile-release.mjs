/** Android preview is separate from the reviewed Windows release/update feed. */
export function validateMobileRelease(value,repository='sbilogic/evfx') {
  if(!value)return null;
  const url=new URL(value.url),release=new URL(value.releaseUrl);
  if(url.protocol!=='https:'||url.hostname!=='github.com'||url.username||url.password||url.search||url.hash||!url.pathname.startsWith(`/${repository}/releases/download/`))throw new Error('Invalid Android download URL');
  if(release.protocol!=='https:'||release.hostname!=='github.com'||!release.pathname.startsWith(`/${repository}/releases/tag/`))throw new Error('Invalid Android release URL');
  if(!/^\d+\.\d+\.\d+$/.test(value.version)||!/^EVFX-Sequencer-Android-\d+\.\d+\.\d+\.apk$/.test(value.filename)||!url.pathname.endsWith('/'+value.filename)||! /^[a-f0-9]{64}$/.test(value.sha256)||!(value.bytes>0&&value.bytes<512*1024*1024)||value.channel!=='preview')throw new Error('Invalid Android release manifest');
  return value;
}
export function mobileInstall(value,escape) {
  if(!value)return '';
  validateMobileRelease(value);
  return `<p><a href="${escape(value.url)}">Android preview APK ↓</a> · v${escape(value.version)} · Android 10+</p><p>Phone/tablet QC preview: device-supported movies, image sequences and frame notes. EXR, ProRes software decoding and OCIO/ACES are not included; use an SDR H.264 review proxy. Tested in an Android emulator; physical-device validation is pending.</p><p class="sha">APK SHA-256 <code>${escape(value.sha256)}</code></p>`;
}
