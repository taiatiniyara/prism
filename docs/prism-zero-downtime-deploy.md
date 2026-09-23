# PRISM — Zero-Downtime Deploy (blue/green, zero dropped requests)

**For:** VPS engineer  ·  **Date:** 2026-09-24 (rev)  ·  **Prepared by:** PRISM coordination

---

## Problem

Every deploy used to cause **~1–2 minutes of HTTP 500s** on `dev.prismdashboard.org`. On 2026-09-23, three back-to-back deploys stacked those windows into several minutes of intermittent "Internal Server Error" and triggered a false site-down alarm.

**Original causes:**
1. The deploy built **in the live directory** → the running app saw a half-written `.next`.
2. `pm2 restart` fully stopped then started the process → 500s until ready.
3. (Discovered 2026-09-24) A **stale `.next`** vs the installed `next@16.3.4` produced `MODULE_NOT_FOUND: next/dist/build/adapter/setup-node-env.external` in `middleware.js` — fixed by building fresh in a new release dir.

## Solution (implemented 2026-09-24)

**Blue/green on two ports + nginx flip.** Two pm2 apps run one release apart; nginx fronts both and switches with a graceful reload (old workers drain in-flight requests, new workers take over) → **0 dropped requests, measured 800/800 and 300/300 during live flips.**

Why not the classic pm2 cluster-reload trick: Next.js's `next start` is spawned as a *subprocess* and does **not** share its listen socket across pm2 cluster workers (no SO_REUSEPORT, child process cannot join the cluster). Two workers on one port → one crash-loops with `EADDRINUSE` (measured). So `pm2 reload` cannot be gapless for this stack — the nginx flip is the switch mechanism instead.

### Pieces

- **Two apps** (pm2, fork mode), both running `scripts/pm2-start.cjs`:
  - `prism-blue` → port **3555** · `prism-green` → port **3556**
  - The wrapper reads **`PRISM_RELEASE_DIR`** (which release dir to serve) and **`PRISM_PORT`** from env — so the standby app can be pointed at a freshly built release *without touching the active app*.
- **nginx** `conf.d/prism-dev.conf`: `server { set $prism_upstream 127.0.0.1:3555; ... proxy_pass http://$prism_upstream; }` where the upstream value comes from an **include**:
  - `/etc/nginx/prism-upstream.conf` → `set $prism_upstream 127.0.0.1:<port>;` (changed per deploy, then `nginx -t && nginx -s reload`)
- **State file** `/root/prism-app/shared/blue-green` → `<active-app> <active-port>` (e.g. `green 3556`) so each deploy knows its standby.
- **Wrapper sits OUTSIDE releases** at `/root/prism-app/shared/pm2-start.cjs` (stable path — releases are pruned). The workflow re-copies it from the fresh clone each deploy, keeping the repo authoritative.
- **Releases** `/root/prism-app/releases/<id>/` — one dir per deploy; `.env`/`.env.local` are symlinks into `shared/`. Nearly all pushes now rebuild the app, not the world.

### One-time VPS setup (engineer — DONE)

```bash
# releases layout (data from future deploys is symlinked, only code/build lives in releases)
mkdir -p /root/prism-app/releases /root/prism-app/shared

# shared env (persist across releases)
ln -sfn ...                         # .env / .env.local live in shared/, symlinked per release

# nginx variable-upstream include (flip point)
printf 'set $prism_upstream 127.0.0.1:3555;\n' > /etc/nginx/prism-upstream.conf
# prism-dev.conf: add `include /etc/nginx/prism-upstream.conf;` after server_name,
# change `proxy_pass http://localhost:3555;` to `proxy_pass http://$prism_upstream;`
nginx -t && nginx -s reload

# blue up first, green second, flip, retire old app (blue/green migration)
PRISM_RELEASE_DIR=/root/prism-app/shared  ./...  # see scripts/pm2-start.cjs + pm2 start commands in repo history
ln -sfn /root/prism-app/releases/<release> /root/prism   # optional convenience symlink only
echo "green 3556" > /root/prism-app/shared/blue-green   # whatever ends up active
```

### Deploy flow (`.github/workflows/deploy-to-vps.yml`)

```bash
read -r ACT_APP ACT_PORT < $APP/shared/blue-green          # -> standby = the other app/port
REL=$APP/releases/$(date +%Y%m%d%H%M%S)-$$-${GITHUB_SHA:0:7}

git clone --depth 1 --branch main https://github.com/taiatiniyara/prism.git "$REL"
ln -sfn $APP/shared/.env $REL/.env   # (+ .env.local if present)
cp $REL/scripts/pm2-start.cjs $APP/shared/pm2-start.cjs    # keep shared wrapper current

cd $REL && npm ci && npm run build                          # OFF-LINE; active app untouched

pm2 delete $STANDBY; PRISM_RELEASE_DIR=$REL PRISM_PORT=$STANDBY_PORT \
  pm2 start $APP/shared/pm2-start.cjs --name $STANDBY       # standby -> new release

curl -sf http://localhost:$STANDBY_PORT/ ...                # health-check BEFORE flipping

printf 'set $prism_upstream 127.0.0.1:%s;\n' $STANDBY_PORT > /etc/nginx/prism-upstream.conf
nginx -t && nginx -s reload                                  # graceful flip, zero drops
echo "$STANDBY $STANDBY_PORT" > $APP/shared/blue-green       # record new active

ls -1dt $APP/releases/*/ | grep -vE '/legacy/$' | tail -n +6 | xargs -r rm -rf
```

### Rollback (instant, no rebuild)

The standby app still runs the **previous** release, so rollback is a one-line upstream flip:

```bash
# flip nginx back to the other port (e.g. 3555)
printf 'set $prism_upstream 127.0.0.1:3555;\n' > /etc/nginx/prism-upstream.conf
nginx -s reload
echo "blue 3555" > /root/prism-app/shared/blue-green
```

---

## Minimum-change alternative (historical — superseded)

The first iteration used release dirs + **symlink swap + `pm2 reload`**. It eliminated the build-in-place window but still had a ~2–5 s gap (cluster reload is not gapless for `next start`, see above) and a bad day with `pm2 scale`. Fully replaced by the blue/green nginx flip.

---

## Notes / prerequisites

- **True zero-dropped-requests requires the nginx flip** for this stack. pm2 cluster reload is NOT gapless because `next start` is a child subprocess that can't share the socket (`EADDRINUSE` measured with `-i 2`).
- **Both apps sleep ~64 MB idle** and the box has 16 GB — headroom is large.
- **`.env` / secrets** live in `shared/`, symlinked into each release. Do not copy per release.
- **Disk:** keep only the last 5 releases (prune step) so `releases/` doesn't grow unbounded.
- **The concurrency gate stays** (`concurrency: deploy-to-vps`, `cancel-in-progress: false`) — still serialize deploys; this removes the downtime *per* deploy, the gate prevents *concurrent* ones.
- **SQL-only / docs-only pushes skip deploy** (`paths-ignore`). Mixed pushes still deploy.
- **DB timing rules still apply** — additive changes before code-live, destructive after (expand/contract); the zero-dropped-requests deploy makes that window cleaner.

## Division of work

- **Engineer (VPS):** the one-time blue/green setup above, `nginx` include, pm2 apps, state file — all DONE on 2026-09-24. Any future change to port numbers/wrapper needs a matching edit of `/etc/nginx/prism-upstream.conf`, `prism-dev.conf` include, and the state file.
- **CI owns the repo-side:** `.github/workflows/deploy-to-vps.yml` + `scripts/pm2-start.cjs` are the single source of truth for the deploy logic.