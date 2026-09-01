create table if not exists user_registration_clarification_message (
  id serial primary key,
  target_user_id text not null references "user"(id) on delete cascade,
  actor_user_id text not null references "user"(id) on delete cascade,
  direction text not null,
  subject text,
  message text not null,
  received_from_email text,
  created_at timestamp not null default now()
);

create index if not exists user_reg_clarification_target_user_idx
  on user_registration_clarification_message (target_user_id, created_at asc);

create index if not exists user_reg_clarification_actor_user_idx
  on user_registration_clarification_message (actor_user_id, created_at desc);
