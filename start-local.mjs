import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
const servers = [
  spawn(process.execPath, ['--env-file-if-exists=.env', 'src/server.ts'], {
    cwd: root + 'backend', stdio: 'inherit',
    env: { ...process.env, HOST: '127.0.0.1', PORT: '3001', PUBLIC_ORIGIN: 'http://localhost:5173', NODE_ENV: 'development' },
  }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', 'localhost'], {
    cwd: root + 'frontend', stdio: 'inherit',
  }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const server of servers) if (server.exitCode === null) server.kill();
}
for (const server of servers) {
  server.on('error', error => { console.error(error.message); stop(1); });
  server.on('exit', code => stop(code ?? 0));
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
