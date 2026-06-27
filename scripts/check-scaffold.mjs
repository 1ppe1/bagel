import { access } from 'node:fs/promises';

const requiredPaths = [
  'apps/api/src/server.mjs',
  'apps/web/src/server.mjs',
  'packages/cli/bin/docsync.mjs',
  'packages/core/src/index.ts',
  'packages/core/dist/index.js',
  'packages/core/dist/index.d.ts',
  'packages/cli/dist/index.js',
  'packages/cli/dist/index.d.ts',
  'examples/spec.html',
  'package-lock.json',
  'tsconfig.base.json'
];

for (const path of requiredPaths) {
  await access(path);
}

console.log('Scaffold check passed.');
