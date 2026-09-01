alter table kpi_definitions
  add column if not exists owner_user_id text references "user"(id);

create index if not exists kpi_definitions_owner_user_id_idx
  on kpi_definitions(owner_user_id);
