alter table custom_kpi_request
  add column if not exists proposed_units json not null default '[]',
  add column if not exists proposed_inputs json not null default '[]';
