alter table custom_kpi_request
  add column if not exists unit_id integer references managed_list_items(id);
