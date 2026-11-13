import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptVault, decryptVault, readPrivateDownload } from '../src/private.js';

test('encrypted private data is readable only with the password and cannot be tampered with', async () => {
  const text = 'Private product and installer contents';
  const bytes = new TextEncoder().encode(text);
  const encrypted = await encryptVault(bytes, 'a long private passphrase');
  assert(!Buffer.from(encrypted).includes(Buffer.from(text)));
  assert.equal(new TextDecoder().decode(await decryptVault(encrypted, 'a long private passphrase')), text);
  await assert.rejects(decryptVault(encrypted, 'wrong password'));
  const changed = encrypted.slice();
  changed[changed.length - 1] ^= 1;
  await assert.rejects(decryptVault(changed, 'a long private passphrase'));
  await assert.rejects(decryptVault(encrypted.slice(0, 12), 'a long private passphrase'));
});

test('private downloads report progress while preserving streamed bytes', async () => {
  const response = new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1,2,3]));
      controller.enqueue(new Uint8Array([4,5,6]));
      controller.close();
    }
  }), {headers:{'Content-Length':'6'}});
  const progress = [];
  const bytes = await readPrivateDownload(response, value => progress.push(value));
  assert.deepEqual([...bytes], [1,2,3,4,5,6]);
  assert.deepEqual(progress, [50,100]);
  await assert.rejects(readPrivateDownload(new Response('', {status:404}), () => {}));
});
