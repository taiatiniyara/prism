alter table kpi_definitions
  add column if not exists updated_at timestamp not null default now();
