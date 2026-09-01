# PRISM — Deploy Pipeline Hardening (proposal)

**Status:** proposal / not yet applied. Authored by the security stream (S10, 2026-07-26).
**Why this is a doc, not a code change:** the deploy pipeline runs on the VPS and its files are shared by every concurrent PRISM session. Changing `deploy-to-vps.yml` / `deploy.sh` mid-flight would alter the live deploy for everyone. These steps are for **Eugene to apply deliberately**, ideally on a clean tree.

> **This hardening also de-risks the in-flight `data_entries` redesign (WORKSTREAMS #2/#8).** The single most dangerous item below — `db-push --force` against production — gets *more* dangerous the more the schema churns. Switching to tracked migrations should ideally land **before** the big medallion migration.

---

## Current setup (as of 2026-07-26)

- `.github/workflows/deploy-to-vps.yml` — on push to `main`, SSH to the VPS and run: `cd /root/prism && git checkout . && git pull && npm run build && pm2 restart prism-v2 --update-env`.
- `scripts/deploy.sh` — `npm install` → `npm run db-push` (= `drizzle-kit push --force`) → `npm run build` → `git add . && git commit && git push origin main`.
- `ecosystem.config.js` — pm2 app; note name/port drift (`tamcfj` / 4210) vs the workflow (`prism-v2`) and ARCHITECTURE.md (`prism-v2` / 3555). **Reconcile these** — a restart targeting the wrong app name silently no-ops.

## Findings

| # | Finding | Risk | Standard |
|---|---------|------|----------|
| D-1 | Deploys into `/root/prism` and pm2 runs the app **as root** | If the Node process is compromised (RCE, dependency, SSRF-to-local), the attacker is already root — no privilege boundary. | CIS 4/5; ASVS 14.1 |
| D-2 | `db-push --force` applies schema to **production** with no migration history | Drizzle push can drop/retype columns to match schema with no review and no rollback. Extremely hazardous while `data_entries` is being redesigned. | ASVS 14.1; change mgmt |
| D-3 | `git checkout .` on the server **discards** any uncommitted state silently | Masks drift; no record of what was overwritten; can hide a compromise or a hotfix. | CIS 8 (audit) |
| D-4 | `deploy.sh` does `git add . && git commit && git push` | Couples deploy with VCS; bare `git commit` (no `-m`) is interactive and will hang a non-interactive shell; auto-committing server state is backwards (server should be a consumer of `main`, not a producer). | change mgmt |
| D-5 | One `SSH_PRIVATE_KEY` with **root** login | Broad blast radius; the CI secret is effectively root on the box. | CIS 4/5 |
| D-6 | **Prod serves a weaker CSP than `next.config.ts`** — the Nginx proxy emits its own `Content-Security-Policy` on `prismdashboard.org` that re-allows `'unsafe-eval'` and bare `https:` wildcards in `script-src`/`style-src`/`connect-src`, and it's the *only* CSP header, so it overrides the hardened Next policy (which IS in force on `dev.prismdashboard.org`). The S1 CSP hardening is effectively **not protecting prod**. | ASVS 14.4.5 / 14.5.3; OWASP A05 |

## Proposed changes

### 1. Run as an unprivileged user (fixes D-1, D-5)

On the VPS (once):

```bash
# create a dedicated, non-login-shell service user
sudo adduser --disabled-password --gecos "" prism
sudo mkdir -p /srv/prism && sudo chown prism:prism /srv/prism
sudo -u prism git clone <repo> /srv/prism/app

# deploy SSH key goes to prism, NOT root
sudo -u prism mkdir -p /home/prism/.ssh
# add the CI public key to /home/prism/.ssh/authorized_keys
# optionally restrict it: from="<gh-actions-egress>",no-agent-forwarding,no-pty ssh-ed25519 AAAA...

# run pm2 as prism and persist across reboots
sudo -u prism pm2 start ecosystem.config.js
sudo -u prism pm2 save
sudo env PATH=$PATH pm2 startup systemd -u prism --hp /home/prism
```

Point the GitHub secret `VPS_USER` at `prism` (not `root`) and update the app path to `/srv/prism/app`. Nginx, Postgres and SMTP are unchanged — only the app's runtime identity changes.

### 2. Migration-based DB deploys (fixes D-2)

`db/config.ts` already targets `out: "./db/migrations"`, so this is a workflow change, not new infra.

Add these scripts to `package.json` (copy-paste — left to you to avoid clobbering concurrent edits):

```jsonc
"db-generate": "drizzle-kit generate --config ./db/config.ts",
"db-migrate":  "drizzle-kit migrate  --config ./db/config.ts"
```

- **In development:** after a schema change, run `npm run db-generate`, review the generated SQL, and commit it under `db/migrations/`.
- **On deploy:** run `npm run db-migrate` (applies only *pending, reviewed* migrations, tracked in `__drizzle_migrations`) instead of `db-push --force`.
- **Keep `db-push --force` for local/dev throwaway DBs only** — never in the deploy path.

### 3. Hardened deploy workflow (fixes D-3, D-4)

Replacement for `deploy-to-vps.yml` (review before applying):

```yaml
name: "Deploy to VPS"
on:
  push:
    branches: ["main"]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1.2.0
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}   # now: prism, not root
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            set -euo pipefail
            export NVM_DIR="$HOME/.nvm"
            [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
            cd /srv/prism/app
            # fail loudly on local drift instead of silently discarding it
            git fetch --all
            if ! git diff --quiet || ! git diff --cached --quiet; then
              echo "::error::Uncommitted changes on server working tree — aborting."; exit 1
            fi
            git switch main
            git reset --hard origin/main
            npm ci
            # backup BEFORE any schema change
            pg_dump "$DATABASE_URL" > "/srv/prism/backups/pre-deploy-$(date +%Y%m%d%H%M%S).sql"
            npm run db-migrate      # tracked migrations, NOT push --force
            npm run build
            pm2 reload ecosystem.config.js --update-env   # reload = zero-downtime
            # smoke test — fail the deploy if the app doesn't come up healthy
            sleep 3
            curl -fsS http://127.0.0.1:<PORT>/api/health | grep -q '"status":"ok"' \
              || { echo "::error::health check failed"; exit 1; }
```

Notes:
- `set -euo pipefail` — abort on the first error (the current script continues past failures in the SSH step).
- `git reset --hard origin/main` after asserting a clean tree — deterministic, but *only after* confirming no un-committed server changes (D-3).
- Replace `<PORT>` with the real prod port once `ecosystem.config.js` / ARCHITECTURE.md are reconciled.
- The `curl /api/health` check now returns only `{status,uptime}` to this unauthenticated call (post-P3 gate) — `grep '"status":"ok"'` still works.

### 4. Retire `scripts/deploy.sh`'s VCS coupling (D-4)

Drop the `git add . && git commit && git push` tail entirely. Developers push to `main` from their workstation; the server only ever *consumes* `main`. If a one-shot manual deploy script is still wanted, it should mirror the workflow above (backup → migrate → build → reload → health check) and never write to git.

### 5. Single-source the Content-Security-Policy (fixes D-6)

**Verified 2026-08-25 (live response headers):** `dev.prismdashboard.org` returns the hardened Next CSP (`script-src 'self' 'unsafe-inline' https://app.powerbi.com` — no `unsafe-eval`), but `prismdashboard.org` (prod) returns a **single, weaker** proxy-set CSP:

```
script-src 'self' 'unsafe-inline' 'unsafe-eval' https: https://app.powerbi.com https://*.powerbi.com;
style-src  'self' 'unsafe-inline' https:;
connect-src 'self' https: wss: https://*.powerbi.com https://*.analysis.windows.net;
```

Because it is the only CSP header, the browser enforces **it** on prod — so `'unsafe-eval'` is allowed and `script-src`/`style-src`/`connect-src` accept **any** `https:` origin. That undoes the S1 hardening on production: XSS containment is materially weaker (a future XSS would be far more exploitable, and eval is re-enabled). Same divergence on `X-Frame-Options` (prod `SAMEORIGIN` vs Next `DENY`) and HSTS — all proxy-set on prod.

**Root cause:** two header sources — `next.config.ts` `headers()` **and** an Nginx `add_header` — and on prod the proxy's weaker policy wins.

**Fix — pick ONE source and make it the hardened policy:**

- **Preferred — let Next own the security headers.** In the Nginx server block, remove the `add_header Content-Security-Policy …` (and any `X-Frame-Options`/CSP-like `add_header`) so Next's hardened headers pass through untouched, and ensure Nginx isn't stripping them (no `proxy_hide_header` on these). Next already emits CSP + HSTS + `X-Frame-Options: DENY` + `nosniff` via `next.config.ts`.
- **Alternative — Nginx owns them** — then it MUST mirror the hardened policy **verbatim**: drop `'unsafe-eval'`, drop the bare `https:` wildcards from `script-src`/`style-src`/`connect-src`, set `X-Frame-Options: DENY`, and add `proxy_hide_header Content-Security-Policy;` so there is never a weak+strict duplicate. Keeping two hand-maintained copies invites drift — prefer the first option.

**Verify after applying:**
```bash
curl -sD - -o /dev/null https://prismdashboard.org/ | grep -i content-security-policy
# expect: NO 'unsafe-eval' and NO bare `https:` in script-src
```

**Owner:** infra/VPS (Nginx) — not an app-code change. #12 flags + specifies the target; whoever owns the proxy applies it.

## Suggested order

1. Reconcile `ecosystem.config.js` name/port with reality (cheap, unblocks the health check).
2. Add `db-generate`/`db-migrate` scripts + generate the current baseline migration.
3. Stand up the `prism` service user; move the app to `/srv/prism/app`; repoint pm2 + the CI secret.
4. Swap in the hardened workflow.
5. Delete `db-push` from every deploy path.
6. **Single-source the CSP** — remove the weaker proxy CSP so the hardened Next policy governs prod (D-6). Independent of the rest; can be done anytime and closes a live gap where the shipped hardening isn't actually protecting production.

Items 2 + 5 are the highest priority — they close D-2, the one that can destroy production data during the schema churn. Item 6 is the next after those: quick (one Nginx block), no app change, and it makes the S1 CSP hardening real on prod.
