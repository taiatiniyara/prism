alter table managed_list_items
  add column if not exists energy_resource_type_id integer references managed_list_items(id);
