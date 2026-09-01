# Redundant-tables analysis

_Prepared 2026-07-28 (session #2 migration). Read-only analysis against the dev
DB (`supabase.prismdashboard.org`). **Nothing has been dropped by this analysis.**
Framed by the intended architecture: the design of record is `db/schema/*.ts` —
the app's own model of itself._

## The architecture lens

A table is **required** if it is declared in `db/schema/*.ts`, and **deletable**
only if it is *not* part of that declared model. Emptiness is irrelevant — most
empty tables are core tables awaiting the medallion bronze reload
(`data_entries`, `power_stations`) or new feature tables with no rows yet
(`notifications`, `two_factor`, `alert_rules`, …).

**Result of the diff (schema-declared vs DB public tables):**

```
73 tables declared in db/schema/   ==   73 tables present in public schema
IN DB but not in schema (orphans):  0
IN schema but not in DB (missing):  0
```
(Was 74=74 until `external_registrations` was retired 2026-07-28 — see below.)

**The live database is in exact 1:1 correspondence with the architecture.**
There are **no redundant tables in the live model** — nothing in `public` can be
dropped without first removing it from the design.

## The 73 required tables, by subsystem

| Subsystem (schema file) | Tables |
|---|---|
| Core domain (`utility`, `country`, `sector`, `reportPeriods`) | `organisations`, `service_areas`, `power_stations`, `units`, `countries`, `sub_regions`, `country_context`, `sectors`, `report_periods` |
| Managed lists / taxonomy (`managedLists`) | `managed_lists`, `managed_list_items`, `asset_class_relevance` |
| Data & measures — bronze (`dataEntry`, `measureDimension*`) | `measure_definitions`, `data_entries`, `input_relevance`, `tariff_relevance`, `transmission_relevance`, `input_dl_def_mappings`, `data_entry_logs`, `measure_dimension_scope`, `measure_dimension_applicability` |
| KPI / BSC (`kpi`, `bsc-builder`) | `kpi_definitions`, `kpi`, `kpi_calculation_attempts`, `bsc`, `bsc_template_node`, `bsc_utility_node`, `bsc_specific_objective`, `bsc_initiative`, `bsc_kpi_link`, `bsc_objective_link`, `bsc_template_link`, `bsc_theme`, `bsc_kpi_target_plan` |
| Custom-KPI requests (`custom-kpi-requests`) | `custom_kpi_request`, `custom_kpi_decision`, `custom_kpi_lifecycle_event`, `custom_kpi_email_delivery` |
| AI (`ai`) | `ai_chat_session`, `ai_chat_turn`, `ai_tool_call`, `ai_feedback`, `ai_review_queue`, `ai_usage_metrics`, `ai_benchmark`, `ai_cost_budget`, `ai_rate_limit_window` |
| Auth & access (`auth-schema`, `rls`) | `roles`, `user`, `session`, `account`, `verification`, `two_factor`, `user_status_event`, `user_registration_clarification_message`, `sidebar_access` |
| Migration tooling (`migration*`) | `migration_logs`, `migration_loads`, `migration_rejections`, `migration_scorecard` |
| Ops / infra (`alerting`, `audit-log`, `backup-log`, `email-schedules`, `error-log`, `governance`, `benchmarking-request`, `devValidationBuilder`, `ui-style`) | `alert_rules`, `alert_history`, `notifications`, `audit_logs`, `backup_logs`, `email_schedules`, `schedule_send_logs`, `error_logs`, `governance_data`, `utility_context_data`, `benchmarking_request`, `dev_validation_builder_config`, `ui_style_override` |

Silver/gold live in separate schemas as **views** derived from the above — also
required, not counted in the 73.

## What can actually be deleted

### 1. The one architectural retirement — `external_registrations` ✅ DONE

The single table that was declared yet **functionally dead**: 0 rows, no FKs in
or out, no dependent views, and a **dead write path** (nothing inserted —
superseded by `user.status = 'pending'`, approved via `app/settings/users/`).

**Retired 2026-07-28 by stream #10** (PR #79, `30f0f72`) — its domain: the
`externalRegistrations` pgTable + types removed from `db/schema/auth-schema.ts`
(tombstone comment left), the `app/settings/external-registrations/` screen
deleted, and the table dropped from the DB. Verified: DB table gone, schema/DB
diff now 73=73. The richer structured intake (`access_request`, spec §5.4)
remains a separate future build — it was **not** stubbed as part of this cleanup.

### 2. The `backup.*` schema — CLEARED ✅ DONE

Dated point-in-time safety nets from the rename/migration work; nothing in code
referenced the `backup` schema, so it was never part of the architecture.

**Emptied 2026-07-28 (Eugene-approved): all 39 tables dropped (~92,273 rows) in
one transaction.** The empty `backup` schema itself was kept so sessions can
still write future rollback snapshots into it.

This included `data_entries_backup_20260722` (**57,391 rows**) — flagged at the
time as *possibly the only copy of the real bronze data*, since `public.data_entries`
was (and still is) empty pending the medallion reload. Eugene made the explicit,
eyes-open call to drop it anyway (source data held elsewhere / not needed). All
the other snapshots (`*_pre_taxonomy`, `*_pre_purge`, `*_pre_renumber`,
`*_440_pre_delete`, `*_pre_coldrop`, `*_pre_grouprename`, the `*_20260727/28`
sets) protected changes since verified stable. DB-active streams (#2/#8/#10/#14)
were notified per the coordination protocol.

## Bottom line

- **Live/public schema: no redundant tables** — 73 declared = 73 present, exact
  match with the architecture (was 74=74 before the `external_registrations`
  retirement).
- **The `backup.*` schema is now cleared** (all 39 tables / ~92,273 rows dropped
  2026-07-28, Eugene-approved; empty schema kept for future snapshots).
- **`external_registrations`** — the one design wart — is now **retired** (#10,
  PR #79, 2026-07-28).
- Net: the live/public schema is a clean 73=73 with the architecture, and there
  are **no remaining reclaim candidates** — both the one design wart and the
  entire backup schema have been cleared.
