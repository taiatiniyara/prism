create table if not exists custom_kpi_request (
  id uuid primary key,
  submitter_user_id text not null references "user"(id),
  title text not null,
  description text,
  formula_expression text not null,
  business_context text not null,
  selected_input_definition_ids json not null default '[]',
  definition_fingerprint text not null,
  status text not null default 'PENDING_REVIEW',
  visibility_scope text not null default 'SUBMITTER_ONLY',
  replacement_kpi_def_id integer references kpi_definitions(id),
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create index if not exists custom_kpi_request_submitter_idx
  on custom_kpi_request (submitter_user_id);
create index if not exists custom_kpi_request_status_idx
  on custom_kpi_request (status);
create index if not exists custom_kpi_request_fingerprint_idx
  on custom_kpi_request (submitter_user_id, definition_fingerprint, status);

create table if not exists custom_kpi_decision (
  id uuid primary key,
  request_id uuid not null references custom_kpi_request(id) on delete cascade,
  reviewer_user_id text not null references "user"(id),
  decision_type text not null,
  rationale text not null,
  override_of_decision_id uuid,
  created_at timestamp not null default now()
);

create index if not exists custom_kpi_decision_request_idx
  on custom_kpi_decision (request_id);
create index if not exists custom_kpi_decision_reviewer_idx
  on custom_kpi_decision (reviewer_user_id);

create table if not exists custom_kpi_lifecycle_event (
  id uuid primary key,
  request_id uuid not null references custom_kpi_request(id) on delete cascade,
  event_type text not null,
  actor_user_id text references "user"(id),
  metadata_json json,
  created_at timestamp not null default now()
);

create index if not exists custom_kpi_lifecycle_request_idx
  on custom_kpi_lifecycle_event (request_id);

create table if not exists custom_kpi_email_delivery (
  id uuid primary key,
  request_id uuid not null references custom_kpi_request(id) on delete cascade,
  decision_id uuid not null references custom_kpi_decision(id) on delete cascade,
  recipient_email text not null,
  delivery_status text not null default 'PENDING',
  attempt_count integer not null default 0,
  last_error text,
  next_attempt_at timestamp,
  sent_at timestamp,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create index if not exists custom_kpi_email_delivery_request_idx
  on custom_kpi_email_delivery (request_id);
create index if not exists custom_kpi_email_delivery_status_idx
  on custom_kpi_email_delivery (delivery_status);
