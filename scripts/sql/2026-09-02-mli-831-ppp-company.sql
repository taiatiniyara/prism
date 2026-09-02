-- Add managed_list_items row: id=831, list_id=23 ("Entity Type"),
-- name="Private-Public Partnership Company" (Eugene-directed 2026-09-02).
--
-- List 23 existing items run 820-830 (all color #D5D5D5); 831 is the next curated id, confirmed free.
-- color set to #D5D5D5 to match the siblings (the table default is magenta). is_active defaults true;
-- parent_id/asset_class_id/description left null. Additive reference data.
--
-- git-first: this artifact committed + pushed before running against p2.

INSERT INTO managed_list_items (id, list_id, name, color)
VALUES (831, 23, 'Private-Public Partnership Company', '#D5D5D5')
ON CONFLICT (id) DO NOTHING;

-- Verify (expect 831 | 23 | Private-Public Partnership Company | t | #D5D5D5):
--   SELECT id, list_id, name, is_active, color FROM managed_list_items WHERE id = 831;
