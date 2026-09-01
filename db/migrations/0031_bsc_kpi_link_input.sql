-- A BSC initiative can track an Input definition as well as a KPI definition.
-- Add a nullable FK to input_definitions on bsc_kpi_link (mutually exclusive
-- with kpi_def_id / pending_custom_kpi_request_id at the application layer).

alter table bsc_kpi_link
  add column if not exists input_definition_id integer references input_definitions(id);

create index if not exists bsc_kpi_link_input_def_idx
  on bsc_kpi_link (input_definition_id);
