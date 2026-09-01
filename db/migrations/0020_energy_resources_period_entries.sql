alter table energy_resources
  add column if not exists period_entries jsonb not null default '[]'::jsonb;

update energy_resources
set period_entries = case
  when report_period_id is null then '[]'::jsonb
  else jsonb_build_array(
    jsonb_build_object(
      'report_period_id', report_period_id,
      'capacity_mw', capacity_mw,
      'is_active', is_active
    )
  )
end;

drop index if exists gen_idx;

alter table energy_resources drop column if exists report_period_id;
alter table energy_resources drop column if exists capacity_mw;
alter table energy_resources drop column if exists is_active;

create index if not exists gen_idx
  on energy_resources (name, utility_id);
