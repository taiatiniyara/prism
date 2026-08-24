-- Measure-level effective-dating: measure_definitions.effective_from (a date).
-- A measure exists / can be shelled only from this date onward; the shell/relevance
-- generator gates by FISCAL YEAR: a period is in scope when fy(period) >= fy(effective_from).
-- This is the coarse measure-level gate that complements the finer per-(dimension,member)
-- effective-dating on measure_dimension_applicability.effective_from/to (ADR 0004).
--
-- Populated from the BMO effective-dating catalogue (measures_effective_from.xlsx), with
-- Eugene's rulings 2026-08-25: measures 291 (Hours Worked Actual), 292 (Hours Paid) and
-- 302 (Electricity Sold to Customers) corrected from the file's 2024/2026 to 2020-01-01
-- (they carry pre-2024/2026 shells — the file dates were wrong, not the data).
--
-- Net: 110 measures effective 2020-01-01 (baseline); 9 effective 2026-01-01 (solar
-- irradiance 360-363, storage 390-392, IPP purchases 431, Non-Revenue Energy 303 — all
-- with 0 historical shells; 303 added per Eugene 2026-08-25, file had it as baseline).
-- Verified 2026-08-25 on dev: no measure has a shell before its effective_from. Idempotent.

ALTER TABLE measure_definitions
  ADD COLUMN IF NOT EXISTS effective_from date;

-- baseline: everything is effective from the start of the migration window
UPDATE measure_definitions
  SET effective_from = DATE '2020-01-01';

-- the eight genuinely new PRISM-2 measures, effective FY2026
UPDATE measure_definitions
  SET effective_from = DATE '2026-01-01'
  WHERE id IN (360, 361, 362, 363,   -- Solar irradiance (H, G_measured, G_STC, theoretical)
               390, 391, 392,        -- Electricity for Charging / Energy Stored / Discharged
               431,                  -- Electricity Purchased from Other Providers
               303);                 -- Non-Revenue Energy Consumed
