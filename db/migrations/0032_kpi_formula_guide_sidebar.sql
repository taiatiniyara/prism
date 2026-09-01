-- Add the KPI Formula Guide page to the sidebar (DEV/BMO only).
-- Idempotent: only inserts if the page is not already registered.
-- NOTE: data-only migration — `npm run db-push` will NOT apply it; run by hand
-- against the target DB (same as 0016_bsc_template_sidebar.sql).
insert into sidebar_access (id, name, page, roles, "order")
select gen_random_uuid(), 'KPI Formula Guide', '/settings/kpi-formula-guide', 'DEV,BMO', 28
where not exists (
  select 1 from sidebar_access where page = '/settings/kpi-formula-guide'
);
