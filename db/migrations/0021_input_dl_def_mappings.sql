create table if not exists input_dl_def_mappings (
  id serial primary key,
  measure_def_id integer not null references measure_definitions (id),
  training_dl_def_id integer not null,
  training_dl_legacy_id varchar(64) not null,
  training_source_id integer,
  training_dl_name varchar(255) not null,
  training_variable_name varchar(255),
  score integer not null default 0,
  confidence varchar(16) not null,
  reasons jsonb,
  is_auto boolean not null default false,
  is_approved boolean not null default true,
  approved_at timestamp,
  approved_by_id text references "user"(id),
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create unique index if not exists uniq_input_dl_def_mappings_input_def_id
  on input_dl_def_mappings (measure_def_id);

create index if not exists idx_input_dl_def_mappings_training_dl_def_id
  on input_dl_def_mappings (training_dl_def_id);
