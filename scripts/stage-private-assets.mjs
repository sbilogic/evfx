import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { copyFile, mkdir, readFile, rename, stat, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const data = JSON.parse(await readFile(join(root, 'private-assets.json'), 'utf8'));
if (data.version !== 1 || !Array.isArray(data.assets)) throw new Error('Invalid encrypted asset manifest');
const output = join(root, 'dist', 'vault');
const cache = join(root, '.local', 'vault-assets');
await mkdir(output, {recursive:true});
await mkdir(cache, {recursive:true});
let total = 0;
for (const asset of data.assets) {
  if (!/^[a-f0-9]{32}\.bin$/.test(asset.name) || !/^[a-f0-9]{64}$/.test(asset.sha256) ||
      !Number.isSafeInteger(asset.bytes) || asset.bytes <= 0) throw new Error('Invalid encrypted asset');
  const url = new URL(asset.url);
  if (url.origin !== 'https://github.com' || url.username || url.password ||
      url.pathname !== `/sbilogic/evfx/releases/download/private-vault/${asset.name}` ||
      url.search || url.hash) throw new Error('Unexpected encrypted asset URL');
  total += asset.bytes;
  if (total > 900_000_000) throw new Error('Encrypted downloads exceed the Pages size budget');
  const file = join(cache, asset.name);
  const verify = async path => {
    const info = await stat(path).catch(() => null);
    if (!info || info.size !== asset.bytes) return false;
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    return hash.digest('hex') === asset.sha256;
  };
  if (!(await verify(file))) {
    const temporary = file + '.partial';
    try {
      const response = await fetch(url, {signal:AbortSignal.timeout(600000)});
      if (!response.ok || !response.body) throw new Error(`Encrypted asset download failed (${response.status})`);
      await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));
      if (!(await verify(temporary))) throw new Error('Encrypted asset checksum mismatch');
      await rename(temporary, file);
    } finally {
      await unlink(temporary).catch(() => {});
    }
  }
  await copyFile(file, join(output, asset.name));
}
console.log(`Staged ${data.assets.length} encrypted downloads.`);
