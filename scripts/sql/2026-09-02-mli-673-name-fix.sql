-- Fix managed_list_items id=673 name: "Non_member" -> "Non-member" (Eugene-directed 2026-09-02).
-- Display-label correction on the PPA Membership Type list (list_id=39). Pure reference data.
-- git-first: committed + pushed before running against p2.

UPDATE managed_list_items SET name = 'Non-member' WHERE id = 673;

-- Verify (expect 673 | Non-member):
--   SELECT id, list_id, name FROM managed_list_items WHERE id = 673;
