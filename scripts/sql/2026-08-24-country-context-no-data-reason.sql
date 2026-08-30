-- Add the answer-availability axis to country_context, mirroring data_entries.no_data_reason.
-- NULL = a value was given (or the row is still to be filled); 'not_available' = the BMO
-- states this national figure is not available for the year. A row carries a value OR a
-- not-available reason, never both. country_context is empty, so this is a clean change.
-- Applied to dev 2026-08-24. Run per environment. Idempotent.

ALTER TABLE country_context
  ADD COLUMN IF NOT EXISTS no_data_reason varchar(32);

-- controlled vocabulary (per spec: null | not_available)
ALTER TABLE country_context DROP CONSTRAINT IF EXISTS chk_cc_no_data_reason;
ALTER TABLE country_context
  ADD CONSTRAINT chk_cc_no_data_reason
  CHECK (no_data_reason IS NULL OR no_data_reason = 'not_available');

-- a value XOR a not-available reason — never both
ALTER TABLE country_context DROP CONSTRAINT IF EXISTS chk_cc_value_xor_nodata;
ALTER TABLE country_context
  ADD CONSTRAINT chk_cc_value_xor_nodata
  CHECK ((value IS NOT NULL)::int + (no_data_reason IS NOT NULL)::int <= 1);
