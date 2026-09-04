-- Fix managed_list_items id=673 ("Non-member", PPA Membership Type) color:
-- table default #EE32DD (magenta) -> #D5D5D5 to match siblings 670/671/672 (Eugene-directed 2026-09-02).
-- Pure reference data. git-first: committed + pushed before running against p2.

UPDATE managed_list_items SET color = '#D5D5D5' WHERE id = 673;

-- Verify (expect 673 | Non-member | #D5D5D5):
--   SELECT id, name, color FROM managed_list_items WHERE id = 673;
