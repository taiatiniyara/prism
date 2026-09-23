// pm2-ready-aware launcher for `next start`.
//
// pm2 runs this file as the app process. `next start` is spawned as a child
// (it is not cluster-aware, so each pm2 worker runs its own Next server; on
// this box they share port 3555 via SO_REUSEPORT). Once the port accepts
// connections we send pm2 the `ready` signal so `pm2 reload` holds the old
// worker until the new one can take traffic -> zero dropped requests per deploy.
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');

const PORT = Number(process.env.PORT || 3555);
const HOST = '127.0.0.1';
const NEXT_BIN = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');

const next = spawn(process.execPath, [NEXT_BIN, 'start', '-p', String(PORT)], {
  stdio: 'inherit',
  cwd: process.cwd(),
});

let readySent = false;

next.on('exit', (code) => {
  process.exit(code == null ? 1 : code);
});

function probe() {
  const sock = new net.Socket();
  const done = (ok) => {
    sock.destroy();
    if (ok && !readySent) {
      readySent = true;
      if (typeof process.send === 'function') {
        process.send('ready');
      }
    }
  };
  sock.setTimeout(800);
  sock.once('connect', () => done(true));
  sock.once('error', () => done(false));
  sock.once('timeout', () => done(false));
  sock.connect(PORT, HOST);
}

const poll = setInterval(probe, 500);
setInterval(() => clearInterval(poll), 60_000);

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    next.kill(sig);
    process.once('exit', () => {});
  });
}