import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { vercelOutputConfig } from './vercel-config.js';

// Fail before building if the backend has not been selected. No dotenv/private file loading.
const config = vercelOutputConfig(process.env.BACKEND_ORIGIN);
const result = spawnSync(process.execPath, [
  'node_modules/@angular/cli/bin/ng.js', 'build', 'web', '--configuration=production',
  '--output-path=.vercel/output/static', '--output-mode=static',
], { stdio: 'inherit' });
if (result.error || result.status !== 0) throw new Error('Angular Vercel build failed');
// Angular's application builder places browser files in a browser subdirectory.
// Move only generated output, never source or existing dist used by the local demo.
const { readdir, rename, rmdir } = await import('node:fs/promises');
for (const name of await readdir('.vercel/output/static/browser')) {
  await rename(`.vercel/output/static/browser/${name}`, `.vercel/output/static/${name}`);
}
await rmdir('.vercel/output/static/browser');
await mkdir('.vercel/output', { recursive: true });
await writeFile('.vercel/output/config.json', JSON.stringify(config, null, 2) + '\n');
