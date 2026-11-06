/** Android artifacts and updates stay separate from the Windows release feed. */
export function validateMobileRelease(value,repository='sbilogic/evfx') {
  if(!value)return null;
  const url=new URL(value.url),release=new URL(value.releaseUrl);
  const repositoryPath=repository.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const assetPath=new RegExp(`^/${repositoryPath}/releases/download/[A-Za-z0-9._-]+/[A-Za-z0-9._-]+\\.apk$`);
  const tagPath=new RegExp(`^/${repositoryPath}/releases/tag/[A-Za-z0-9._-]+$`);
  if(url.protocol!=='https:'||url.hostname!=='github.com'||url.port||url.username||url.password||url.search||url.hash||!assetPath.test(url.pathname))throw new Error('Invalid Android download URL');
  if(release.protocol!=='https:'||release.hostname!=='github.com'||release.port||release.username||release.password||release.search||release.hash||!tagPath.test(release.pathname))throw new Error('Invalid Android release URL');
  if(!/^\d+\.\d+\.\d+$/.test(value.version)||value.filename!==`EVFX-Sequencer-Android-${value.version}.apk`||!url.pathname.endsWith('/'+value.filename)||! /^[a-f0-9]{64}$/.test(value.sha256)||!Number.isSafeInteger(value.bytes)||!(value.bytes>0&&value.bytes<512*1024*1024)||!['preview','stable'].includes(value.channel))throw new Error('Invalid Android release manifest');
  if(value.channel==='stable'){
    if(!Number.isSafeInteger(value.versionCode)||value.versionCode<1||value.versionCode>2147483647||!Number.isInteger(value.minSdk)||value.minSdk<29||value.minSdk>100||value.packageName!=='com.evfx.sequencer')throw new Error('Invalid Android package identity');
    const proof=value.validation;
    if(!proof||proof.sha256!==value.sha256||proof.emulatorVerified!==true||proof.transferVerified!==true||proof.updaterVerified!==true)throw new Error('Android updates require runtime, transfer and replacement-install verification of this exact APK');
  }
  return value;
}
export function mobileUpdateFeed(value){
  validateMobileRelease(value);
  const release=value?.channel==='stable'?{version:value.version,version_code:value.versionCode,min_sdk:value.minSdk,package_name:value.packageName,filename:value.filename,url:value.url,bytes:value.bytes,sha256:value.sha256,release_url:value.releaseUrl}:null;
  return {schema_version:1,product:'evfx-sequencer-android',channel:'stable',release};
}
export function mobileInstall(value,escape) {
  if(!value)return '';
  validateMobileRelease(value);
  const preview=value.channel==='preview';
  return `<p><a href="${escape(value.url)}">Android${preview?' preview':''} APK ↓</a> · v${escape(value.version)} · Android 10+</p><p>Phone/tablet QC: local files, PC transfers, image sequences and frame notes.${preview?'':' Checks for updates automatically; verified downloads on Wi-Fi, then Android asks to install.'} EXR, ProRes software decoding and OCIO/ACES are not included; use an SDR H.264 review proxy. Tested in an Android emulator; physical-device validation is pending.</p><p class="sha">APK SHA-256 <code>${escape(value.sha256)}</code></p>`;
}
