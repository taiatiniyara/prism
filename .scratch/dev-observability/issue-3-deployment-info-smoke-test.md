# Issue 3 — Deployment Info & Smoke Test

## What to build

A `/settings/deployment` page showing operational metadata: last deploy timestamp, current commit SHA, Node.js version, process uptime, and last backup timestamp with file size.

An API endpoint `GET /api/deployment/info` returns this data. The deploy timestamp and commit SHA are read from a build-time artifact written during `npm run build` (a small JSON file in the build output). Backup info is read from a lightweight tracking mechanism — either a file written by the backup script or a simple `backup_logs` DB table recording each run.

Enhance `scripts/deploy.sh` to: (a) write a deploy marker file after a successful build, (b) call `GET /api/health` after PM2 restart and retry up to 30 seconds, (c) fail the deploy with a clear message if health never returns 200.

## Acceptance criteria

- [ ] `GET /api/deployment/info` returns `{ deployedAt, commitSha, nodeVersion, uptimeSeconds, lastBackup: { at, sizeBytes } }`
- [ ] Commit SHA is embedded at build time (e.g., `generateBuildId` or a build script)
- [ ] `/settings/deployment` page displays all fields with relative timestamps ("deployed 2 hours ago")
- [ ] `scripts/deploy.sh` calls `/api/health` after restart, retries every 2s up to 15 attempts, exits non-zero on failure
- [ ] Backup script writes a tracking record (file or DB row) with timestamp and file size
- [ ] Page is gated to DEV role only
- [ ] Integration test verifies the info endpoint returns the expected shape

## Blocked by

Issue 1 (Health Check Endpoint) — needed for deploy smoke test
