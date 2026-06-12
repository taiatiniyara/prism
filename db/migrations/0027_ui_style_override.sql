-- App-wide DEV styling overrides (a single "global" row of selector -> styles).
-- Applied via `npm run db-push`; this file is the manual record.
create table if not exists ui_style_override (
  id uuid primary key default gen_random_uuid(),
  scope varchar(32) not null default 'global',
  styles json not null default '{}',
  updated_by_id text references "user"(id),
  updated_at timestamp not null default now()
);

create unique index if not exists ui_style_override_scope_idx
  on ui_style_override (scope);
