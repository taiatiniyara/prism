-- Per-period benchmarking participation: backfill report_periods.bm_opted_in + purge
-- non-benchmarking periods (docs/per-period-participation-spec.md §5). Eugene-directed 2026-09-04.
--
-- DECISIONS (Eugene):
--   * Eligibility = organisations.is_utility; participation is purely per-period (bm_opted_in).
--   * BACKFILL signal = authoritative per-utility opt-in START YEAR, Financial-Year (490) only:
--       NUC (id 16) from 2020, NPC (id 17) from 2025, every other participant from 2022.
--       (NOT data-presence — that misclassifies NPC both ways: FY2025 opted-but-empty, FY2024 stray data.)
--   * PURGE (delete periods + all their data), Eugene-greenlit:
--       Set A = 12 periods under non-participating utilities (EDT/EEWF/ENERCAL/GPA/KAJUR).
--       Set C = 49 Monthly (report_type 491) periods — NUC phantom shells; Monthly data not migrated yet.
--   * KEEP NPC FY2024 (period 224) AND its records (Eugene: don't delete) — stays bm_opted_in=false.
--
-- Guarded + fully backed up + atomic (BEGIN/COMMIT — any FK error rolls the whole thing back).
-- DML only (no schema DROP); safe to apply promptly after merge (deleting phantom period ROWS does
-- not break code that reads report_periods). git-first: committed + pushed before running against p2.

BEGIN;

CREATE SCHEMA IF NOT EXISTS backup;

-- ── Authoritative purge list: non-participant periods (A) + all Monthly/491 periods (C) = 61 ──
CREATE TABLE backup.report_periods_purge_20260904 AS
  SELECT rp.*
  FROM report_periods rp
  JOIN organisations o ON o.id = rp.utility_id
  WHERE (o.is_utility = true AND o.bm_participates = false)   -- Set A
     OR rp.report_type_id = 491;                              -- Set C (Monthly)

-- ── Back up every row that will be deleted (period rows + full inbound-FK tree) ──
CREATE TABLE backup.data_entries_purge_20260904 AS
  SELECT * FROM data_entries
  WHERE report_period_id IN (SELECT id FROM backup.report_periods_purge_20260904);
CREATE TABLE backup.data_entry_logs_purge_20260904 AS
  SELECT * FROM data_entry_logs
  WHERE data_entry_id IN (SELECT id FROM backup.data_entries_purge_20260904);
CREATE TABLE backup.kpi_calc_attempts_purge_20260904 AS
  SELECT * FROM kpi_calculation_attempts
  WHERE report_period_id IN (SELECT id FROM backup.report_periods_purge_20260904)
     OR source_data_entry_id IN (SELECT id FROM backup.data_entries_purge_20260904);
CREATE TABLE backup.kpi_purge_20260904 AS
  SELECT * FROM kpi
  WHERE report_period_id IN (SELECT id FROM backup.report_periods_purge_20260904);
CREATE TABLE backup.tariff_relevance_purge_20260904 AS
  SELECT * FROM tariff_relevance
  WHERE report_period_id IN (SELECT id FROM backup.report_periods_purge_20260904);

-- ── BACKFILL: opt-in the 78 participating Financial-Year periods from each utility's start year ──
UPDATE report_periods rp
SET bm_opted_in = true
FROM organisations o
WHERE o.id = rp.utility_id
  AND o.is_utility = true
  AND o.bm_participates = true
  AND rp.report_type_id = 490
  AND EXTRACT(year FROM rp.report_date) >=
        CASE WHEN o.id = 16 THEN 2020   -- NUC
             WHEN o.id = 17 THEN 2025   -- NPC
             ELSE 2022 END;

-- ── PURGE: delete children deepest-first, then the 61 period rows ──
DELETE FROM data_entry_logs
  WHERE data_entry_id IN (SELECT id FROM backup.data_entries_purge_20260904);
DELETE FROM kpi_calculation_attempts
  WHERE report_period_id IN (SELECT id FROM backup.report_periods_purge_20260904)
     OR source_data_entry_id IN (SELECT id FROM backup.data_entries_purge_20260904);
DELETE FROM data_entries
  WHERE report_period_id IN (SELECT id FROM backup.report_periods_purge_20260904);
DELETE FROM kpi
  WHERE report_period_id IN (SELECT id FROM backup.report_periods_purge_20260904);
DELETE FROM tariff_relevance
  WHERE report_period_id IN (SELECT id FROM backup.report_periods_purge_20260904);
DELETE FROM transmission_relevance
  WHERE report_period_id IN (SELECT id FROM backup.report_periods_purge_20260904);
DELETE FROM report_periods
  WHERE id IN (SELECT id FROM backup.report_periods_purge_20260904);

COMMIT;

-- Verify (expect: report_periods total 79, bm_opted_in true 78, NPC 224 kept+false with its data):
--   SELECT count(*) total, count(*) FILTER (WHERE bm_opted_in) opted FROM report_periods;                -- 79 / 78
--   SELECT id, bm_opted_in FROM report_periods WHERE id = 224;                                            -- 224 | false
--   SELECT count(*) FROM report_periods WHERE report_type_id = 491;                                       -- 0
--   SELECT count(*) FROM report_periods rp JOIN organisations o ON o.id=rp.utility_id
--     WHERE o.is_utility AND o.bm_participates = false;                                                   -- 0 (Set A gone)
