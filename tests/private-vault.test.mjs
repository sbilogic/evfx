import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptVault, decryptVault } from '../src/private.js';

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
