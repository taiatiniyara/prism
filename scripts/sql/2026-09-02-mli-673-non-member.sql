-- Add managed_list_items row: id=673, list_id=39 ("PPA Membership Type"), name="Non_member"
-- (Eugene-directed 2026-09-02).
--
-- List 39 existing items: 670 Utility, 671 Allied, 672 Affiliate — 673 is the next curated id.
-- id=673 confirmed free; explicit low id is consistent with 670-672 and below the id sequence
-- (~99859), so it won't collide with future auto-generated ids. is_active defaults true, color
-- defaults; parent_id/asset_class_id/description left null. Additive reference data.
--
-- git-first: this artifact committed + pushed before running against p2.

INSERT INTO managed_list_items (id, list_id, name)
VALUES (673, 39, 'Non_member')
ON CONFLICT (id) DO NOTHING;

-- Verify (expect 673 | 39 | Non_member | t):
--   SELECT id, list_id, name, is_active FROM managed_list_items WHERE id = 673;
