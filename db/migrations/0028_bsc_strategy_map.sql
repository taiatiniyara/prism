-- Strategy Map (BSC Builder Tier-1, see docs/bsc-builder-spec.md §13).
-- Additive: per-Utility cause-effect edges between map nodes, plus map-display
-- fields on the template (PPA defaults) and overlay (per-Utility overrides).
-- Applied via `npm run db-push`; this file is the manual record.

-- Template defaults: short map caption + whether the node is a map node by
-- default (decouples "on map" from level — Financial promotes its key_focus_area).
alter table bsc_template_node
  add column if not exists map_label text,
  add column if not exists is_map_node boolean not null default false;

-- Overlay overrides. All nullable = "inherit" from the template (custom nodes
-- use the utility value directly). map_x / map_y are the drag-to-position
-- override; null = auto-layout (band by perspective, theme column by KFA).
alter table bsc_utility_node
  add column if not exists map_label text,
  add column if not exists is_map_node boolean,
  add column if not exists map_x integer,
  add column if not exists map_y integer;

-- Directed cause-effect edges (source drives target), per Utility.
create table if not exists bsc_objective_link (
  id uuid primary key default gen_random_uuid(),
  utility_id integer not null references organisations(id) on delete cascade,
  source_node_id uuid not null references bsc_utility_node(id) on delete cascade,
  target_node_id uuid not null references bsc_utility_node(id) on delete cascade,
  relation varchar(16) not null default 'drives',
  note text,
  ord integer not null default 0,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create index if not exists bsc_objective_link_utility_idx
  on bsc_objective_link (utility_id);
create index if not exists bsc_objective_link_source_idx
  on bsc_objective_link (source_node_id);
create index if not exists bsc_objective_link_target_idx
  on bsc_objective_link (target_node_id);
create unique index if not exists bsc_objective_link_pair_idx
  on bsc_objective_link (utility_id, source_node_id, target_node_id);
