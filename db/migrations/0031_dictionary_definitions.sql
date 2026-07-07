-- Dictionary enrichment: AI-drafted definitions + synonyms with curation status.
-- definition_status: 'draft' (AI-written, usable but unverified) | 'curated' (BMO-approved).
ALTER TABLE input_definitions
  ADD COLUMN IF NOT EXISTS definition text,
  ADD COLUMN IF NOT EXISTS synonyms json,
  ADD COLUMN IF NOT EXISTS definition_status varchar(16);

ALTER TABLE kpi_definitions
  ADD COLUMN IF NOT EXISTS definition text,
  ADD COLUMN IF NOT EXISTS synonyms json,
  ADD COLUMN IF NOT EXISTS definition_status varchar(16);
