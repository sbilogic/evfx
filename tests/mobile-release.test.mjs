import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMobileRelease,mobileInstall} from '../scripts/mobile-release.mjs';
const release={version:'0.1.0',channel:'preview',filename:'EVFX-Sequencer-Android-0.1.0.apk',url:'https://github.com/sbilogic/evfx/releases/download/sequencer-android-v0.1.0/EVFX-Sequencer-Android-0.1.0.apk',releaseUrl:'https://github.com/sbilogic/evfx/releases/tag/sequencer-android-v0.1.0',sha256:'a'.repeat(64),bytes:100000};
test('Android APK previews remain explicit and separate from Windows updates',()=>{
  assert.equal(validateMobileRelease(release),release);
  const html=mobileInstall(release,s=>s);
  assert.match(html,/Android preview APK/);assert.match(html,/physical-device validation is pending/);assert.match(html,/EXR, ProRes/);
  assert.equal(mobileInstall(null,s=>s),'');
  for(const change of [{url:'http://example.com/app.apk'},{sha256:'bad'},{channel:'stable'},{filename:'app.exe'},{bytes:0}])assert.throws(()=>validateMobileRelease({...release,...change}));
});
