# PRISM — Zero-Downtime Deploy (eliminate the per-deploy 500 window)

**For:** VPS engineer  ·  **Date:** 2026-09-24  ·  **Prepared by:** PRISM coordination

---

## Problem

Every deploy currently causes **~1–2 minutes of HTTP 500s** on `dev.prismdashboard.org`. On 2026-09-23, three back-to-back deploys stacked those windows into several minutes of intermittent "Internal Server Error" and triggered a false site-down alarm.

**Why:** the deploy builds **in the live directory** and then restarts the process. Current `deploy-to-vps.yml` SSH script:

```bash
cd /root/prism
git checkout .
git clean -fd
git pull
rm -rf node_modules          # ~clears deps
npm ci                       # ~1–2 min
npm run build                # rewrites .next IN PLACE — app is inconsistent while this runs
pm2 restart prism-v2 --update-env   # drops connections until the new process is ready
```

Two sources of downtime:
1. **`npm run build` rewrites `.next` in the directory the running app is serving from** → the live app sees a half-written build.
2. **`pm2 restart`** (fork mode) fully stops then starts the process → requests 500 until it's ready.

## Goal

Make deploys atomic and gapless: build the new version **off to the side** while the current one keeps serving, then **switch instantly** with **no dropped requests**.

---

## Recommended approach — release directories + symlink swap + `pm2 reload` (cluster mode)

This is the standard zero-downtime pattern (Capistrano-style) and is the most robust.

### One-time VPS setup (engineer)

1. **Adopt a releases layout** so `/root/prism` becomes a symlink to the active release:
   ```bash
   mkdir -p /root/prism-app/releases /root/prism-app/shared
   # move the current checkout in as the first release, keep .env + node_modules shared
   mv /root/prism /root/prism-app/releases/legacy
   mv /root/prism-app/releases/legacy/.env /root/prism-app/shared/.env
   ln -s /root/prism-app/shared/.env /root/prism-app/releases/legacy/.env
   ln -sfn /root/prism-app/releases/legacy /root/prism   # 'current' symlink; keep the old path working
   ```
   (Adjust paths to taste; the key ideas are a `releases/<id>/` dir per deploy, a `shared/` dir for `.env` and anything else that must persist across releases, and a `current` symlink the app + pm2 run from.)

2. **Run pm2 in cluster mode** so reloads are truly gapless (fork mode still has a small gap on reload). Next.js `next start` is cluster-safe:
   ```bash
   pm2 delete prism-v2
   pm2 start npm --name prism-v2 -i 2 --cwd /root/prism -- run start   # 2+ instances
   pm2 save
   ```
   `pm2 reload` on a cluster restarts workers one at a time, so there is always a live worker to serve requests → **zero dropped requests**.

### New deploy flow (replaces the SSH `script:` block in `deploy-to-vps.yml`)

```bash
set -e
export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

APP=/root/prism-app
REL="$APP/releases/$(date +%Y%m%d%H%M%S)-$GITHUB_SHA"   # unique release dir

# 1. Fetch the new code into a FRESH release dir (current release keeps serving)
git clone --depth 1 --branch main https://github.com/taiatiniyara/prism.git "$REL"   # or: cp -a current + git pull
ln -s "$APP/shared/.env" "$REL/.env"

# 2. Build the new release OFF-LINE (live app untouched)
cd "$REL"
npm ci || { npm cache clean --force; npm ci; }
npm run build

# 3. Atomic switch + gapless reload
ln -sfn "$REL" /root/prism            # repoint 'current' — atomic (ln -sfn replaces in one syscall)
pm2 reload prism-v2 --update-env      # cluster reload: workers cycle one-by-one, no downtime

# 4. Keep the last 5 releases for instant rollback; prune older
ls -1dt "$APP"/releases/*/ | tail -n +6 | xargs -r rm -rf
```

### Rollback (instant, no rebuild)

```bash
ln -sfn /root/prism-app/releases/<previous-release> /root/prism
pm2 reload prism-v2 --update-env
```

---

## Minimum-change alternative (if the full releases refactor is too much right now)

Smaller step that removes most of the window without the releases layout — build out-of-place, swap `.next`:

```bash
cd /root/prism
git pull
npm ci
rm -rf .next.new && npm run build --  --dist-dir .next.new   # build to a side dir (or build then mv)
mv .next .next.old && mv .next.new .next
pm2 reload prism-v2 --update-env       # still prefer reload+cluster over restart
```

This shrinks the "inconsistent `.next`" window to a fast `mv`, and cluster `reload` removes the restart gap. Less robust than release dirs (no instant rollback, shared dir), but a big improvement for little effort.

---

## Notes / prerequisites

- **True zero-downtime needs pm2 *cluster* mode + `pm2 reload`.** In single fork mode, `reload` still briefly gaps. `-i 2` (or more) is enough.
- **`.env` / secrets** must live in the `shared/` dir and be symlinked into each release (don't copy per release).
- **Disk:** keep only the last N releases (the prune step) so `releases/` doesn't grow unbounded.
- **The concurrency gate stays** (`concurrency: deploy-to-vps`) — still serialize deploys; this change removes the downtime *per* deploy, the gate prevents *concurrent* ones.
- **SQL-only PRs already skip deploy** (added 2026-09-24: `scripts/sql/**` in `paths-ignore`), so migration SQL no longer triggers any of this.
- **DB timing rules still apply** — additive DB changes before code-live, destructive after (expand/contract). Zero-downtime deploys actually make the "destructive only after new code is live" window cleaner to observe.

## Division of work

- **Engineer:** the one-time VPS layout (releases dir + shared + `current` symlink) and pm2 cluster config above — these are VPS-side and need root.
- **PRISM coordination (#1):** once the VPS layout is in place, I own `.github/workflows/deploy-to-vps.yml` and will update its SSH `script:` block to the new release-dir flow to match. Tell me when the VPS side is ready (and the final paths you chose) and I'll land the workflow change git-first.
