-- BSC Builder (see docs/bsc-builder-spec.md, docs/adr/0001-bsc-builder.md)
-- Master Template + per-Utility overlay, replacing the legacy bsc JSON model.
-- Applied via `npm run db-push`; this file is the manual record.

-- Master Template (shared, admin-editable by DEV/BMO) --------------------------
create table if not exists bsc_template_node (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references bsc_template_node(id) on delete cascade,
  level text not null,
  label text not null,
  is_mandatory boolean not null default false,
  ord integer not null default 0,
  is_active boolean not null default true,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create index if not exists bsc_template_node_parent_idx
  on bsc_template_node (parent_id);
create index if not exists bsc_template_node_level_idx
  on bsc_template_node (level);

-- Per-Utility overlay: upper zone (selections + custom nodes) -------------------
create table if not exists bsc_utility_node (
  id uuid primary key default gen_random_uuid(),
  utility_id integer not null references organisations(id) on delete cascade,
  template_node_id uuid references bsc_template_node(id),
  parent_node_id uuid references bsc_utility_node(id) on delete cascade,
  level text not null,
  label text,
  ord integer not null default 0,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create index if not exists bsc_utility_node_utility_idx
  on bsc_utility_node (utility_id);
create index if not exists bsc_utility_node_parent_idx
  on bsc_utility_node (parent_node_id);
create index if not exists bsc_utility_node_template_idx
  on bsc_utility_node (template_node_id);
create index if not exists bsc_utility_node_utility_level_idx
  on bsc_utility_node (utility_id, level);

-- Per-Utility overlay: lower zone (objective -> initiative -> KPI) --------------
create table if not exists bsc_specific_objective (
  id uuid primary key default gen_random_uuid(),
  utility_id integer not null references organisations(id) on delete cascade,
  lever_node_id uuid not null references bsc_utility_node(id) on delete cascade,
  description text not null,
  ord integer not null default 0,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create index if not exists bsc_specific_objective_utility_idx
  on bsc_specific_objective (utility_id);
create index if not exists bsc_specific_objective_lever_idx
  on bsc_specific_objective (lever_node_id);

create table if not exists bsc_initiative (
  id uuid primary key default gen_random_uuid(),
  utility_id integer not null references organisations(id) on delete cascade,
  specific_objective_id uuid not null references bsc_specific_objective(id) on delete cascade,
  title text not null,
  description text,
  ord integer not null default 0,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create index if not exists bsc_initiative_utility_idx
  on bsc_initiative (utility_id);
create index if not exists bsc_initiative_objective_idx
  on bsc_initiative (specific_objective_id);

create table if not exists bsc_kpi_link (
  id uuid primary key default gen_random_uuid(),
  utility_id integer not null references organisations(id) on delete cascade,
  initiative_id uuid not null references bsc_initiative(id) on delete cascade,
  kpi_def_id integer references kpi_definitions(id),
  pending_custom_kpi_request_id uuid references custom_kpi_request(id),
  ord integer not null default 0,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create index if not exists bsc_kpi_link_utility_idx
  on bsc_kpi_link (utility_id);
create index if not exists bsc_kpi_link_initiative_idx
  on bsc_kpi_link (initiative_id);
create index if not exists bsc_kpi_link_kpi_def_idx
  on bsc_kpi_link (kpi_def_id);

-- KPI trajectory: per-(utility, KPI) target-trend summary, shared across BSC ----
create table if not exists kpi_target_trajectory (
  id uuid primary key default gen_random_uuid(),
  utility_id integer not null references organisations(id) on delete cascade,
  kpi_def_id integer not null references kpi_definitions(id) on delete cascade,
  trajectory varchar(16) not null,
  updated_by_id text references "user"(id),
  updated_at timestamp not null default now()
);

create unique index if not exists kpi_target_trajectory_utility_kpi_idx
  on kpi_target_trajectory (utility_id, kpi_def_id);
