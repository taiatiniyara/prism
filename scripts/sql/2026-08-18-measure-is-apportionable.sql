-- Add is_apportionable to measure_definitions: TRUE for measures whose value can be
-- apportioned/allocated (the ~5 financial measures the 2 differently-reporting
-- utilities need split). Catalogue policy — BMO/migration sets which measures TRUE.
-- Applied to dev 2026-08-18. Run per environment. Idempotent.
ALTER TABLE measure_definitions
  ADD COLUMN IF NOT EXISTS is_apportionable boolean NOT NULL DEFAULT false;
