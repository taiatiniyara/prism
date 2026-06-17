-- BSC KPI target plan: stores the generated period set per (utility, KPI) so
-- the Preview can show Targets Fully/Partially/Not Set. Additive; filled values
-- still write through to kpi_definitions.targets. Applied via direct SQL.
create table if not exists bsc_kpi_target_plan (
  id uuid primary key default gen_random_uuid(),
  utility_id integer not null references organisations(id) on delete cascade,
  kpi_def_id integer not null references kpi_definitions(id) on delete cascade,
  frequency text,
  start_date date,
  periods json not null default '[]',
  updated_by_id text references "user"(id),
  updated_at timestamp not null default now()
);

create unique index if not exists bsc_kpi_target_plan_utility_kpi_idx
  on bsc_kpi_target_plan (utility_id, kpi_def_id);
