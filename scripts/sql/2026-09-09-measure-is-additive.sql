-- measure_definitions.is_additive — roll-up summation gate for the calculator
-- ---------------------------------------------------------------------------
-- Additive (TRUE, default): the calculator may SUM the measure across grain
-- (service_area → utility) and dimension (slices → All) — counts, energy (MWh),
-- hours, length (km), headcount (FTE). Non-additive (FALSE): rates, %, ratios,
-- averages, tariff-structure values — Σ of details is meaningless; the resolver
-- must use a stored All-row (or a defined re-aggregation), never a sum.
--
-- Additive default is safe: all 17 measures currently rolled up are additive
-- (#3, 2026-09-08). The UPDATE below marks the UNAMBIGUOUS non-additive set only.
-- Three ambiguous averages (360, 400, 411) are held out pending Eugene's ruling
-- and stay TRUE (additive) until ruled — being flagged separately.
--
-- Git-first: this rides commit on session-4-schema-ddl → origin/main before apply.
-- Additive column → apply promptly after merge (code-ahead-of-DB safe). #4, 2026-09-09.

ALTER TABLE measure_definitions
  ADD COLUMN IF NOT EXISTS is_additive boolean NOT NULL DEFAULT true;

-- Unambiguous non-additive measures: rates, ratios, %, tariff-structure values.
UPDATE measure_definitions
   SET is_additive = false
 WHERE id IN (4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 140, 361, 362, 500, 501, 502, 503);
