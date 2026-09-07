# Migration Runbook (p1 → p2 data-entries load)

**Purpose.** The repeatable, consistent process for loading a p1→p2 `data_entries` extract into p2 — pre-checks, dry-run, load, status/completion checks, reconciliation, and the standard issues Excel. Follow this every run. Record each run in [`migration-history.md`](migration-history.md).

**Scope.** This loads **`data_entries` only** (p2 is a pure mirror of p1 — no direct data entry). Reference/structural tables (organisations, report_periods, service_areas, measures, managed lists) are NOT reloaded here; new orgs use the `--new-orgs` step (see §2). Always a **full re-extract**, never an incremental delta (p2 mirrors p1; a delta can't express deletes and depends on p1 timestamp reliability).

**Tooling.** `scripts/migrate.ts` (ExcelJS parser `lib/migration/parse.ts` + loader `lib/migration/load.ts`), run from a **git worktree on `origin/main`** (the main tree is often on an older branch) with `node_modules` junctioned. It is DB-writing, so **git-first**: any parser/loader change is committed + merged before the real load.

---

## 0. Inputs (two Excel files, per run)

1. **Extract** (`N_mig_data_export_YYYYMMDD_*.xlsx`) — the p1→p2 rows, already resolved to p2 ids. Column headers map via `EXTRACT_COLUMNS` / value-type aliases in `parse.ts` (the one place to adjust when a new sample uses different spellings).
2. **Control totals / recon** (`N_mig_recon_export_YYYYMMDD_*.xlsx`) — per-period expected counts/sums the loader reconciles the load against (writes `migration_scorecard`).

---

## 1. Pre-migration checks (read-only — before touching anything)

Run these `SELECT`s against p2 and confirm:

- **DB reachable** and you have the p2 `DATABASE_URL`.
- **Model↔DB drift is clean** — `npm run drift-check` exits 0 (a drifted schema + a later push is what wiped data on 2026-09-04). Reconcile any drift first.
- **`data_entries` state** — expected starting count (0 after a wipe; otherwise note it — the default load flushes it).
- **Target report periods exist** — the load only lands on periods present in p2; rows for absent periods reject. Confirm the surviving period set (e.g. post-participation-purge).
- **Target measures exist** — every `measure_def_id` the extract references must be in `measure_definitions`, especially any NEW measures this run adds (verify by id + name), else those rows FK-reject.
- **The migration ledger tables exist** — `migration_loads`, `migration_rejections`, `migration_scorecard`.
- **Back up** the current entered-data tables if `data_entries` is non-empty (`backup.data_entries_*`), and take a Supabase snapshot before a large load.

## 2. Dry-run checks (parse/validate only — no writes)

```
node --env-file=<p2.env> --import tsx scripts/migrate.ts "<extract.xlsx>" "<control.xlsx>" --dry-run
```
Flags: `--dry-run` (no writes) · `--label=TEXT` · `--limit=N` (smoke test) · `--new-orgs=FILE` (STEP 0: onboard new orgs/service-areas/report-periods first) · `--no-flush` (append instead of the default flush-and-reload = truncate `data_entries` first).

Confirm:
- **0 parse errors** on BOTH files. If value-type/header mismatches appear (e.g. `value_type "number"` vs canonical `numeric`), fix the alias/`EXTRACT_COLUMNS` map in `parse.ts`, **commit git-first**, and re-dry-run until 0.
- **Row count** is sane vs the extract.
- **Per-period breakdown** looks right (shells/filled/no-data per period).
- No `--new-orgs` needed unless new organisations are being introduced.

Do NOT proceed to the real load until the dry-run is clean.

## 3. Real load

```
node --env-file=<p2.env> --import tsx scripts/migrate.ts "<extract.xlsx>" "<control.xlsx>" --label="<run label>"
```
Default is **flush-and-reload** (truncates `data_entries`, then loads, then reconciles, writing `migration_scorecard` + `migration_rejections`). Large loads (>~10k rows) take many minutes — run in the background.

## 4. Load status checks (while running)

- `SELECT count(*) FROM data_entries;` — should climb toward the parsed row count (loader commits in batches).
- `SELECT * FROM migration_loads ORDER BY id DESC LIMIT 1;` — the run record (`status`, `rows_in`, `rows_migrated`, `rows_failed`, timings).

## 5. Load completion checks

- **Exit code:** `0` = clean; **`1` = reconciliation variances were flagged (NOT a failure)** — inspect the scorecard; `2`/other = real error.
- `migration_loads.status = 'completed'`; note `rows_migrated` / `rows_failed`.
- **Final `data_entries` count** and **distinct periods with data** — the authoritative result (read from the DB, not stdout, which may be truncated).
- **New measures landed** — e.g. confirm the run's new measures have rows (a `0` means the extract omitted them — a gap to flag).

## 6. Migration reconciliation

Read `migration_scorecard` for the load (`WHERE load_id = <id>`):
- **Value sums** (`recon_line` like `value_sum`) should match — treat single-digit floating-point variances out of large totals as OK (rounding).
- **Count variances** — `is_balanced = false` lines are the recon deltas. A large `na` ("no-data") shortfall (source ≫ migrated on the `fill/na` line) is the **expected p1 "shells-for-everyone" vs p2 "no-shells" model difference**, not a loss — confirm it's expected rather than a new problem.
- Cross-check against the **prior-good backup** as a floor: every period/row that WAS there should reappear (flag any period present in the backup but absent from the reload).

## 7. Migration error Excel (standard format — keep consistent)

Generate **one workbook per run**, named **`N_mig_issues_YYYYMMDD.xlsx`** (same `N_` sequence as the export files), saved beside the run's exports.

- **`Summary` sheet** — columns: `Issue | Records | Loaded? | Description`. One row per issue sheet below, plus rows for **absences that have no failed records** (e.g. a measure the extract omitted, a period the extract dropped) — describe those in the Description.
- **One sheet per `failure_category`** — human-readable sheet name (≤31 chars), e.g. `Uniqueness (dedup)`, `Author not in p2`, `Uncastable numeric`, `Missing FK reference`. Add a sheet if a new category appears.
- **`Recon Variances` sheet** — the `is_balanced = false` scorecard lines.
- **Columns on every issue sheet** (this order, so it stays readable + traceable):
  `load_id (mig run)` · `source_ref (mig-id)` · `p1_report_period_id` · `report_period` · `utility` · `measure_def_id` · `measure_name` · `failure_category` · `failure_reason` · `failure_columns` · `intended_value_type` · `attempted_numeric` · `remediation` · `source_payload (raw row)`.
  - **`load_id` + `source_ref` are the trace keys** — `load_id` identifies the migration run, `source_ref` traces the exact row back to the customer's extract. Always include both.
- **Recon Variances columns:** `load_id · period_label · report_period_id · recon_line · value_type · source (expected) · migrated (actual) · failed · variance · note`.
- Freeze the header row + enable autofilter on every sheet.
- Source of truth is the DB (`migration_rejections` / `migration_scorecard` filtered by `load_id`), not stdout.

Interpretation guide for the categories seen so far:
- **`unique`** — a no-data row superseded by a real value at the same cell; value kept → **benign, no loss**.
- **`other` (author not in p2)** — p1 author id not a p2 user → row loaded, author nulled → **benign, metadata only**.
- **`type_cast`** — value can't store as its type (e.g. `">300"` on a numeric) → **NOT loaded** (real gap).
- **`fk`** — referenced id absent in p2 (e.g. a unit id beyond what exists) → **NOT loaded** (real gap).

## 8. Post-load steps (bring the reload up to working state)

1. **Re-apply one-time raw-data cleanups** the raw p1 dump re-introduces (dated `scripts/sql/` that remove stray shells / reconcile scope), verifying each against the reloaded data.
2. **Regenerate computed layers** (owned by the calculator/data-entry streams — coordinate, don't run blind): calculated measures + `hours_in_period` + the KPI recompute (rebuilds `gold.fact_kpi` / `silver`), keyed off the reloaded raw data + the current `report_periods.bm_opted_in` participation flags.
3. **Sequence realignment** — only if a table with an integer identity was reloaded (NOT needed for `data_entries`, whose id is a uuid; not needed when only `data_entries` is loaded).
4. **Do NOT re-apply superseded steps** — e.g. the old blanket approval model was replaced by per-period participation; statuses follow the current model.
5. **Record the run** in [`migration-history.md`](migration-history.md).

---

### Cross-cutting rules
- **git-first** — any parser/loader/SQL change committed + pushed (PR-merged) before it writes to p2.
- **Verify against `origin`**, not the local checkout; run from a worktree on `origin/main`.
- **Worktree cleanup** — remove the `node_modules` junction (PowerShell `cmd /c rmdir`, confirm gone) BEFORE `git worktree remove`, or the real `node_modules` is deleted through the link.
