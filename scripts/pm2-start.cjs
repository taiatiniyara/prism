// pm2-ready-aware launcher for `next start`, used by the blue/green deploy.
//
// Each pm2 app (prism-blue on 3555, prism-green on 3556) runs this wrapper. The
// release dir and port come from env vars so a standby app can be pointed at a
// freshly-built release without touching the active app:
//   PRISM_RELEASE_DIR  the release dir containing `.next` (default: process.cwd())
//   PRISM_PORT         port to serve on (default: 3555)
//
// Traffic is switched between the two apps by nginx (`/etc/nginx/prism-upstream.conf`
// include + `nginx -s reload`), which is what makes deploys zero-dropped-requests.
// This wrapper intentionally runs `next start` as a child subprocess; Next.js is
// NOT cluster/SO_REUSEPORT-safe, so pm2 cluster mode cannot be used for gapless
// reloads — the nginx flip is the switch mechanism instead.
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');

const HOST = '127.0.0.1';
const NEXT_DIR = process.env.PRISM_RELEASE_DIR || process.cwd();
const PORT = Number(process.env.PRISM_PORT || 3555);
const NEXT_BIN = path.join(NEXT_DIR, 'node_modules', 'next', 'dist', 'bin', 'next');

const next = spawn(process.execPath, [NEXT_BIN, 'start', '-p', String(PORT)], {
  stdio: 'inherit',
  cwd: NEXT_DIR,
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