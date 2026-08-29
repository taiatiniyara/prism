-- Financial data-entry sign/range conventions (#3, 2026-08-30, Eugene-directed).
-- Applied to dev; apply verbatim at prod cutover.
--
-- 1) Positive-magnitude convention: cost/revenue measures already carry
--    valid_range_min = 0 (no change needed). Two net/signed measures must
--    ALLOW negatives (loss / accumulated deficit); their polarity is already
--    343 "Both Positive and Negative", so clearing the lower bound is enough:
UPDATE measure_definitions
SET valid_range_min = NULL, updated_at = now()
WHERE id IN (226 /* Total Equity */, 231 /* Profit */);

-- 2) Limitless positive max for currency AMOUNTS. A fixed numeric cap cannot
--    work across currencies (VUV ~120/USD vs FJD ~2/USD), so oversized values
--    are caught at review, not blocked at entry. Keep real caps on the GST
--    rate (id 500, 0-1) and GDP-per-capita context (id 9).
UPDATE measure_definitions
SET valid_range_max = NULL, updated_at = now()
WHERE is_active = true
  AND is_currency = true
  AND id NOT IN (500 /* Tariff VAT/GST Rate */, 9 /* GDP Per Capita */);

-- Companion code change: dataEntryValidation.service.ts no longer force-caps
-- currency measures at 999999999999 — it now respects the stored max
-- (NULL = limitless), which also fixes the GST-rate cap being overridden.
