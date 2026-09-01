-- Prevent duplicate overlay selections of the same template node per utility.
--
-- Root cause (2026-06-15): the BSC Builder saves a perspective by
-- delete-then-reinsert inside a transaction. When two autosaves of the same
-- perspective fire close together, the second can insert a fresh subtree
-- before the first commits, leaving TWO copies of the whole perspective
-- subtree (observed on KUA's Financial perspective — 8 duplicated nodes).
--
-- A utility selects any given template node at most once, so (utility_id,
-- template_node_id) is naturally unique. This partial index enforces it and
-- makes the racing insert fail loudly instead of duplicating. Custom nodes
-- (template_node_id IS NULL) are excluded — a utility may have many of those.
--
-- Existing duplicates were cleaned before applying this index.

create unique index if not exists bsc_utility_node_utility_template_uidx
  on bsc_utility_node (utility_id, template_node_id)
  where template_node_id is not null;
