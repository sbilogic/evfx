import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { access } from 'node:fs/promises';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const keyFile = join(root, '.local', 'private-vault.key');
if (await access(keyFile).then(() => true, () => false)) throw new Error('The private vault already has a key.');
const password = randomBytes(24).toString('base64url');
const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', join(root, 'scripts/private-key.ps1'), 'save'], {
  input:password, encoding:'utf8', windowsHide:true
});
if (result.status !== 0) throw new Error(result.stderr || 'Could not protect the vault password.');
console.log('Created a Windows-protected private vault password.');
