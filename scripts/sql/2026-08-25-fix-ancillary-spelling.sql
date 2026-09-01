-- Spelling correction of user-facing vocab: managed_list_items 1030 was stored as
-- "Ancilliary Services" (misspelled — not a word). The utility_function member is shown
-- in pickers, labels and Power BI exports, so names-are-data → fix the source of truth.
-- Referenced everywhere by id (1030), never by the string, so this is a pure one-row
-- correction with no code/DAX impact. Per #8, applied 2026-08-25. Idempotent.

UPDATE managed_list_items
  SET name = 'Ancillary Services'
  WHERE id = 1030 AND name = 'Ancilliary Services';
