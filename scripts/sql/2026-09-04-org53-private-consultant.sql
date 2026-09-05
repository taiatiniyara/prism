-- organisations.name for id=53: "Org to be clarified 2" -> "Private Consultant"
-- (Eugene-directed 2026-09-04). Non-utility placeholder org being named. Pure
-- reference-data change; git-first, apply to p2 after merge.

UPDATE organisations SET name = 'Private Consultant' WHERE id = 53;

-- Verify (expect 53 | Private Consultant):
--   SELECT id, name, acronym FROM organisations WHERE id = 53;
