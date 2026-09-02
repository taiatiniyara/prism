-- Add bm_participates to organisations: TRUE for utilities that participate in
-- PPA benchmarking. Orthogonal to is_utility (an operating utility may still be
-- excluded from benchmarking). Drives which utilities' report periods the KPI
-- recompute processes and displays — non-participating utilities are skipped,
-- not surfaced as failed calculations.
--
-- Per Eugene's disposition (2026-09-02): default false; the participating
-- utilities are then flagged true from the PPA's participating-utility list
-- (uploaded separately). Idempotent.

ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS bm_participates boolean NOT NULL DEFAULT false;

-- Participating utilities are flagged true in a follow-up DML step from the
-- PPA's uploaded list; no rows are flipped here (safe default = false).
