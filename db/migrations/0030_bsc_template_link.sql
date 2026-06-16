-- Master cause-effect links between TEMPLATE nodes, authored by BMO in the BSC
-- Master Template editor. These cascade to every utility's strategy map as
-- mandatory, locked edges (resolved to the utility's matching nodes at read
-- time in getStrategyMap). Per-utility (BLO) links remain in bsc_objective_link.

create table if not exists bsc_template_link (
  id uuid primary key default gen_random_uuid(),
  source_node_id uuid not null references bsc_template_node(id) on delete cascade,
  target_node_id uuid not null references bsc_template_node(id) on delete cascade,
  relation varchar(16) not null default 'drives',
  ord integer not null default 0,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create index if not exists bsc_template_link_source_idx
  on bsc_template_link (source_node_id);
create index if not exists bsc_template_link_target_idx
  on bsc_template_link (target_node_id);
create unique index if not exists bsc_template_link_pair_idx
  on bsc_template_link (source_node_id, target_node_id);
