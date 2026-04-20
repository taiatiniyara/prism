alter table input_definitions
add column if not exists sort_order integer not null default 0;