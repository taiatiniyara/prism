-- Bound report_periods.status_id to the period-lifecycle subset {Pending(2), Entered(3),
-- Reviewed(4), Approved(5)}.
--
-- The 2026-08-18 wholesale repoint of report_periods.status_id to the shared DataEntryStatusId
-- enum (1-7) left values that are NOT valid period states admissible on periods:
--   Requested(1)   — retired (Pending is the single starting state)
--   Endorsed(6)    — retired (CEO Approved is final; legacy Endorsed migrated to 5)
--   Not_Available(7) — a SHELL answer-availability value, never a period workflow state
-- Combined with the fact-route publish gate (= Approved(5), equality), this CHECK prevents a
-- stray 1/6/7 from ever reaching a period — in particular a 7 that a `>= 5` gate would publish.
-- NULL passes (IN (...) is unknown for NULL), preserving the nullable column.
--
-- Per #8 ruling 2026-08-30 (report_periods.status_id consult). Verified 0 violating rows on dev
-- (all 147 periods = Approved(5)). Applied to dev 2026-08-30. Run per environment. Idempotent.
-- Constraint name matches the Drizzle schema (db/schema/reportPeriods.ts chk_rp_status_lifecycle).

ALTER TABLE report_periods DROP CONSTRAINT IF EXISTS chk_rp_status_lifecycle;
ALTER TABLE report_periods
  ADD CONSTRAINT chk_rp_status_lifecycle CHECK (status_id IN (2, 3, 4, 5));
