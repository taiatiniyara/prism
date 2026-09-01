alter table measure_definitions 
  add column if not exists alternative_names json;
