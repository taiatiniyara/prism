create table if not exists chat_session (
  id serial primary key,
  user_id text not null references "user"(id) on delete cascade,
  title varchar(120) not null default 'New chat',
  created_at timestamp not null default now(),
  updated_at timestamp not null default now(),
  last_message_at timestamp not null default now()
);

create index if not exists chat_session_user_last_message_idx
  on chat_session (user_id, last_message_at desc);

create table if not exists chat_message (
  id serial primary key,
  session_id integer not null references chat_session(id) on delete cascade,
  role text not null,
  content text not null,
  model text,
  capabilities_used text,
  recommended_view text,
  created_at timestamp not null default now()
);

create index if not exists chat_message_session_created_idx
  on chat_message (session_id, created_at asc);
