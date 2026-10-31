import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installBuildHooks } from './build-hooks.mjs';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const remove=process.argv.includes('--uninstall');
const installed=await installBuildHooks(root,{remove});
console.log(`${remove?'Removed':'Installed'} one-shot build hooks: ${installed.length}. No background process or startup entry.`);
