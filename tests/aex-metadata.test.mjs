import test from 'node:test';
import assert from 'node:assert/strict';
import { aexMetadata } from '../scripts/local-plugins.mjs';
import { lockFromRelease } from '../scripts/github.mjs';
function resource(encoded){const data=Buffer.alloc(20);data.write('MIB8REVe');data.writeUInt32LE(4,12);data.writeUInt32LE(encoded,16);return Buffer.concat([Buffer.from('MZ'),data]);}
test('PixelPicker 1082881 is version 2.1.0 release build 1',()=>{
  assert.deepEqual(aexMetadata(resource(1082881)),{version:'2.1.0',build:1,aeVersion:1082881});
  assert.equal(aexMetadata(resource((1<<15)|(3<<9)|1)).version,'0.1.0');
  assert.equal(aexMetadata(resource(1082881).subarray(0,15)),null);
});
test('PiPL prerelease stages and high major-version bits are decoded',()=>{
  assert.equal(aexMetadata(resource((2<<19)|(1<<15)|7)).version,'2.1.0-dev7');
  assert.equal(aexMetadata(resource((3<<26)|(1<<19)|(6<<15)|(1<<11)|(3<<9)|1)).version,'25.6.1');
});
test('release refresh keeps the AE build identity and the AEX hash separate from ZIP hash',()=>{
  const sha='a'.repeat(64),binary={name:'EVFX_PixelPicker.aex',sha256:'b'.repeat(64)};
  const meta={version:'2.1.0',build:1,aeVersion:1082881,binary,files:[{name:'download.zip',bytes:20,sha256:sha,primary:true}]};
  const lock=lockFromRelease({published_at:'2026-11-01',html_url:'https://github.com/example/evfx/releases/tag/picker',tag_name:'picker',prerelease:true,assets:[{name:'download.zip',state:'uploaded',size:20,digest:`sha256:${sha}`,browser_download_url:'https://github.com/example/evfx/releases/download/picker/download.zip'}]},meta);
  assert.equal(lock.build,1);assert.equal(lock.aeVersion,1082881);assert.deepEqual(lock.binary,binary);assert.equal(lock.downloads[0].sha256,sha);
});
