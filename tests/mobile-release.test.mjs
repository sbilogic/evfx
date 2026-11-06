import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMobileRelease,mobileInstall,mobileUpdateFeed} from '../scripts/mobile-release.mjs';
const release={version:'0.1.0',channel:'preview',filename:'EVFX-Sequencer-Android-0.1.0.apk',url:'https://github.com/sbilogic/evfx/releases/download/sequencer-android-v0.1.0/EVFX-Sequencer-Android-0.1.0.apk',releaseUrl:'https://github.com/sbilogic/evfx/releases/tag/sequencer-android-v0.1.0',sha256:'a'.repeat(64),bytes:100000};
test('Android APK previews remain explicit and separate from Windows updates',()=>{
  assert.equal(validateMobileRelease(release),release);
  const html=mobileInstall(release,s=>s);
  assert.match(html,/Android preview APK/);assert.match(html,/physical-device validation is pending/);assert.match(html,/EXR, ProRes/);
  assert.equal(mobileInstall(null,s=>s),'');
  for(const change of [{url:'http://example.com/app.apk'},{sha256:'bad'},{channel:'stable'},{filename:'app.exe'},{bytes:0}])assert.throws(()=>validateMobileRelease({...release,...change}));
});
const stable={...release,channel:'stable',versionCode:2,minSdk:29,packageName:'com.evfx.sequencer',validation:{sha256:release.sha256,emulatorVerified:true,transferVerified:true,updaterVerified:true,physicalDeviceVerified:false}};
test('Android update feed requires verification of the exact APK and carries Android identity',()=>{
  const feed=mobileUpdateFeed(stable);
  assert.equal(feed.product,'evfx-sequencer-android');assert.equal(feed.release.package_name,'com.evfx.sequencer');
  assert.equal(feed.release.version_code,2);assert.equal(feed.release.sha256,stable.sha256);assert.equal(feed.release.url,stable.url);
  assert.equal(mobileUpdateFeed(release).release,null);assert.equal(mobileUpdateFeed(null).release,null);
  for(const change of [{validation:{...stable.validation,sha256:'b'.repeat(64)}},{validation:{...stable.validation,updaterVerified:false}},{versionCode:0},{versionCode:2.5},{minSdk:20},{packageName:'com.other.app'}])assert.throws(()=>mobileUpdateFeed({...stable,...change}));
  assert.match(mobileInstall(stable,s=>s),/Checks for updates automatically/);
});
test('Android links cannot use other repositories, credentials, encoded traversal or unverified hosts',()=>{
  for(const url of ['https://github.com/other/evfx/releases/download/v1/app.apk','https://github.com/sbilogic/evfx/releases/download/%2e%2e/'+release.filename,'https://github.com:444/sbilogic/evfx/releases/download/v1/'+release.filename,release.url+'?download=1'])assert.throws(()=>validateMobileRelease({...release,url}));
  for(const releaseUrl of ['https://user@github.com/sbilogic/evfx/releases/tag/v1',release.releaseUrl+'#fake',release.releaseUrl+'?fake=1'])assert.throws(()=>validateMobileRelease({...release,releaseUrl}));
});
