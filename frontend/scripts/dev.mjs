import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const frontendDirectory = path.resolve(scriptsDirectory, '..');
const projectDirectory = path.resolve(frontendDirectory, '..');
const backendDirectory = path.join(projectDirectory, 'backend');
const backendPort = 8000;
const viteArguments = process.argv.slice(2);

const isPortOpen = () => new Promise((resolve) => {
  const socket = net.createConnection({ host: '127.0.0.1', port: backendPort });
  socket.once('connect', () => {
    socket.end();
    resolve(true);
  });
  socket.once('error', () => resolve(false));
});

const waitForBackend = async () => {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    if (await isPortOpen()) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return false;
};

let backendProcess;
let viteProcess;

const stopChildren = () => {
  if (viteProcess && !viteProcess.killed) viteProcess.kill();
  if (backendProcess && !backendProcess.killed) backendProcess.kill();
};

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopChildren();
    process.exit();
  });
}

if (await isPortOpen()) {
  console.log('Laravel API already available at http://127.0.0.1:8000.');
} else {
  console.log('Starting Laravel API at http://127.0.0.1:8000...');
  backendProcess = spawn('php', ['artisan', 'serve', '--host=127.0.0.1', `--port=${backendPort}`], {
    cwd: backendDirectory,
    stdio: 'inherit',
    shell: true,
  });

  backendProcess.once('error', (error) => {
    console.error(`Unable to start Laravel: ${error.message}`);
    process.exit(1);
  });

  backendProcess.once('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`Laravel process exited early with code ${code}.`);
    }
  });

  if (!await waitForBackend()) {
    console.error('Laravel did not start on http://127.0.0.1:8000.');
    stopChildren();
    process.exit(1);
  }
}

console.log('Starting Vite...');
viteProcess = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', ...viteArguments], {
  cwd: frontendDirectory,
  stdio: 'inherit',
});

viteProcess.once('exit', (code) => {
  if (code && code !== 0) process.exitCode = code;
  if (backendProcess && !backendProcess.killed) backendProcess.kill();
});