alter table input_dl_def_mappings
  alter column training_dl_def_id type bigint
  using training_dl_def_id::bigint;
