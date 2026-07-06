import { spawn } from 'node:child_process';

const processes = [
  ['api', 'node', ['apps/api/src/server.mjs']],
  ['web', 'npm', ['run', 'dev', '-w', '@docsync/web']]
];

let shuttingDown = false;

const children = processes.map(([name, command, args]) => {
  const child = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env
  });

  child.stdout.on('data', (chunk) => {
    process.stdout.write(`[${name}] ${chunk}`);
  });

  child.stderr.on('data', (chunk) => {
    process.stderr.write(`[${name}] ${chunk}`);
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      console.log(`[${name}] stopped by ${signal}`);
      return;
    }
    console.log(`[${name}] exited with code ${code}`);
    if (!shuttingDown && code !== 0) {
      process.exitCode = code ?? 1;
      shutdown();
    }
  });

  return child;
});

function shutdown() {
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('Docksync dev servers starting...');
