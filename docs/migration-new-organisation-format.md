# New-organisation onboarding — migration step 0

The p1→p2 fact extract references utilities, service areas and report periods by their **p2 ids**
(already resolved before the extract is authored). Those parent rows must exist in p2 **before** the
loader can attach a shell — `data_entries.report_period_id` / `utility_id` / `service_area_id` are
foreign keys. For utilities already in p2 there is nothing to do. For a **new** utility arriving with
a migration, this step creates the parents first.

It is the **first step of any migration**. When a run has no new utilities, omit it and the migration
goes straight to the data-entries load.

## How it runs

```bash
# with new organisations:
node --env-file=.env --import tsx scripts/migrate.ts <extract.xlsx> <control-totals.xlsx> \
  --new-orgs=new-organisations.xlsx --label="…"

# no new organisations — just leave the flag off:
node --env-file=.env --import tsx scripts/migrate.ts <extract.xlsx> <control-totals.xlsx> --label="…"
```

- The onboarding insert runs **before** the `data_entries` flush. If the file fails validation the run
  **aborts before anything is truncated** — the DB is left untouched.
- It is **idempotent**: any `id` that already exists is skipped. Safe to re-run; composes with
  flush-and-reload (which only truncates `data_entries`).
- `--dry-run` parses the file and reports structural errors + row counts, but does **not** connect to
  the DB, so its semantic checks (ids exist, FYE present) run only at load time.

## The workbook — three sheets, linked by explicit ids

Generate a ready-to-fill template (with an example row and per-column notes in a `legend` sheet):

```bash
node --import tsx scripts/gen-new-organisations-template.ts new-organisations.xlsx
```

Sheet names are matched case-insensitively (`organisations`, `service_areas`, `report_periods`); any
sheet may be omitted if that entity has no new rows. Column headers are matched by name (common
aliases accepted); order does not matter. A blank first data row / an italic example row is ignored.

### Sheet `organisations`

| column | required | notes |
|---|---|---|
| `id` | ✅ | explicit p2 `organisations.id` — the extract's `utility_id` references this |
| `name` | ✅ | |
| `country_id` | ✅ | `countries.id` |
| `is_utility` | | TRUE/FALSE (default TRUE) |
| `fye_month` | ✅ for a utility | financial-year-end month `1..12` — the onboarding FYE declaration |
| `fye_day` | ✅ for a utility | financial-year-end day `1..31` |
| `acronym`, `is_mth_report_relevant`, `is_active`, `updated_date` | | optional; sensible defaults |
| `utility_type_id` (default 440), `utility_size_id`, `operating_basis_id`, `entity_type_id`, `accounting_standard_id`, `electricity_regulation_id`, `powerquality_standard_id`, `ppa_membership_type_id`, `services_provided_id` | | optional `managed_list_items.id`s; validated if present |

A utility **must** declare `fye_month`/`fye_day` — that is the whole point of onboarding, and it drives
FY report_date alignment below. (A non-utility org may leave them blank.)

### Sheet `service_areas`

| column | required | notes |
|---|---|---|
| `id` | ✅ | explicit p2 `service_areas.id` — the extract's `service_area_id` references this |
| `utility_id` | ✅ | `organisations.id` — in this workbook or already in p2 |
| `name` | | default `SA <id>` |
| `strata_id` | | `managed_list_items.id` (default 1) |
| `provides_electricity` (default TRUE), `provides_water`, `provides_sanitation`, `operations_only`, `is_virtual`, `is_active` | | TRUE/FALSE |

### Sheet `report_periods`

| column | required | notes |
|---|---|---|
| `id` | ✅ | explicit p2 `report_periods.id` — the extract's `report_period_id` references this |
| `utility_id` | ✅ | `organisations.id` |
| `report_type_id` | ✅ | `managed_list_items.id` of the report type (e.g. the id for *Financial Year*) |
| `fy_end_year` | ✅ for FY periods | the FY-end **year**; `report_date` is derived (see below) |
| `report_date` | ✅ for non-FY periods | explicit period-end date; used only when `fy_end_year` is blank |
| `status` | | `Pending` \| `Entered` \| `Reviewed` \| `Approved` (default `Pending`) |
| `request_date` | | defaults to `report_date` |
| `lean_mode` (default FALSE), `who_id` | | optional |

**FY report_date is derived, never hand-typed.** For a Financial-Year period you give `fy_end_year`
and the step computes `report_date = (fy_end_year, org.fye_month, org.fye_day)`. So a new utility's
periods are born already aligned to its canonical FYE — the same invariant the 2026-08-31 FYE cleanup
established, and report_date drift cannot be reintroduced.

**`status` drives publication and Model-A.** A period at `Approved` (CEO-approved) is the publishable
state that feeds Power BI / benchmarking, and the Model-A reconciliation lifts its data-entry shells
to Approved. Use `Approved` for historical periods whose data was CEO-approved in p1; use `Pending`
for open, unapproved periods. Period status is constrained to `{Pending, Entered, Reviewed, Approved}`
(`chk_rp_status_lifecycle`).

When periods are created, each is linked into its utility's service areas
(`service_areas.report_periods`) so the period is active for those SAs in the entry UI.

## Caveats

- **Sequences.** Rows are inserted with explicit ids, which does not advance the `serial` sequences.
  If the app will later create orgs/SAs/periods through the UI, reset the sequences after a migration
  (`SELECT setval(pg_get_serial_sequence('organisations','id'), (SELECT max(id) FROM organisations))`,
  and likewise for `service_areas` / `report_periods`).
- **Energy assets** (`units` / `power_stations`) are **not** part of this step — onboard those
  separately if the new utility reports energy facts.
