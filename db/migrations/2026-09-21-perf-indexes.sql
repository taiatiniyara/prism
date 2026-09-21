-- Missing indexes found during a performance-bottleneck sweep (see the
-- accompanying schema changes in db/schema/dataEntry.ts, db/schema/managedLists.ts
-- and db/schema/reportPeriods.ts). `drizzle-kit generate` could not be run
-- cleanly in this environment (pre-existing rename-ambiguity prompt against
-- the current migrations snapshot, reproduces on main independent of this
-- change), so this migration is hand-written to match those schema edits —
-- following the precedent of the other dated hand-SQL files in this folder.
--
-- Purely additive (CREATE INDEX only) — safe to apply without a maintenance
-- window. CONCURRENTLY avoids taking a write lock on these tables while the
-- index builds, but cannot run inside a transaction block: apply each
-- statement individually (e.g. `psql -f` with autocommit, not inside BEGIN).
--
-- `data_entries` is the largest table in the schema and previously had no
-- index usable by the (report_period_id, measure_def_id) + is_deleted=false
-- filter that ~25+ fact/dim routes and the review-kpi listers all use.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_data_entries_period_measure
  ON data_entries (report_period_id, measure_def_id)
  WHERE is_deleted = false;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_data_entries_measure_def
  ON data_entries (measure_def_id);

-- `managed_list_items` had zero indexes despite being joined on `list_id`
-- and filtered on `is_active` by nearly every dim/fact route.
CREATE INDEX CONCURRENTLY IF NOT EXISTS managed_list_items_list_idx
  ON managed_list_items (list_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS managed_list_items_active_idx
  ON managed_list_items (is_active);

-- `report_periods.status_id` backs `publishedPeriodCondition`, reused by
-- ~25 fact/dim routes; `utility_id` is the other near-universal filter/join key.
CREATE INDEX CONCURRENTLY IF NOT EXISTS report_periods_status_idx
  ON report_periods (status_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS report_periods_utility_status_idx
  ON report_periods (utility_id, status_id);
