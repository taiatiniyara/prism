drop index if exists uniq_input_dl_def_mappings_input_def_id;

create unique index if not exists uniq_input_dl_def_mappings_input_training
  on input_dl_def_mappings (measure_def_id, training_dl_def_id);
