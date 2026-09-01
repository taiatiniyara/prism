# Issue 11 — Backup & Data Integrity Monitor

## What to build

A `/settings/backup` page showing backup health and data integrity checks. The page displays: last backup timestamp with relative time ("3 hours ago"), backup age warning if > 24 hours, last backup file size, and a table of key database table row counts with rough size estimates.

An API endpoint `GET /api/backup/status` reads backup tracking records and runs lightweight integrity queries. A new `backup_logs` DB table tracks each backup run (timestamp, file size, success/failure, error message). The backup script (`scripts/backup.sh`) is enhanced to write a row to this table.

Data integrity checks: orphan detection queries that find data entries referencing deleted service areas, stale session rows past expiry that haven't been cleaned, and KPI instances without a parent KPI definition. Results are shown as counts with "Investigate" links to the relevant settings pages.

Table size estimates use `pg_stat_user_tables` or `COUNT(*)` approximations. A bar chart shows the top 20 tables by estimated row count.

## Acceptance criteria

- [ ] New `backup_logs` table: `id, timestamp, file_size_bytes, success, error_message, created_at`
- [ ] `scripts/backup.sh` enhanced to `INSERT INTO backup_logs` after each run
- [ ] `GET /api/backup/status` returns `{ lastBackup: { at, sizeBytes, age }, tables: [{ name, rowCount, estimatedSizeBytes }], orphans: { dataEntryNoServiceArea, staleSessions, kpiNoDefinition } }`
- [ ] `/settings/backup` page shows backup status card (green if < 24h, yellow if > 24h, red if never)
- [ ] Table sizes shown as horizontal bar chart (top 20)
- [ ] Orphan counts shown as cards with counts and link to relevant page
- [ ] Backup age warning threshold configurable via env var `BACKUP_WARN_HOURS` (default 24)
- [ ] Page is gated to DEV role only
- [ ] Integration test: seed backup_logs, verify status endpoint returns correct age

## Blocked by

None — needs new `backup_logs` schema table and backup script enhancement, which are small prerequisites inside this slice
