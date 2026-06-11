-- DEV-editable, product-wide BSC styling overrides (a single "global" row).
-- Applied via `npm run db-push`; this file is the manual record.
create table if not exists bsc_theme (
  id uuid primary key default gen_random_uuid(),
  scope varchar(32) not null default 'global',
  styles json not null default '{}',
  updated_by_id text references "user"(id),
  updated_at timestamp not null default now()
);

create unique index if not exists bsc_theme_scope_idx on bsc_theme (scope);
