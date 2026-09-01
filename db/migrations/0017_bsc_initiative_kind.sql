-- Distinguish ongoing Initiatives from time-bound Projects on the BSC.
-- Project fields (start_date, target_completion_date, status) are null for
-- initiatives. Applied via `npm run db-push`; this file is the manual record.
alter table bsc_initiative
  add column if not exists kind varchar(16) not null default 'initiative',
  add column if not exists start_date date,
  add column if not exists target_completion_date date,
  add column if not exists status varchar(16);
