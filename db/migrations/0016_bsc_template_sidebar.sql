-- Add the BSC Master Template admin page to the sidebar (DEV/BMO only).
-- Idempotent: only inserts if the page is not already registered.
insert into sidebar_access (id, name, page, roles, "order")
select gen_random_uuid(), 'BSC Template', '/settings/bsc-template', 'DEV,BMO', 27
where not exists (
  select 1 from sidebar_access where page = '/settings/bsc-template'
);
