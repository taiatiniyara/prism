# KPI Formula-Binding Data Fixes & Review-KPI Slice Labeling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 9 mis-pinned formula-binding dimensions and 1 orphaned measure
reference discovered while auditing all 135 KPI `formula_inputs`/`formula_binding`
records, then close the underlying UX gap (no dimension-slice label on the
review-kpi Inputs cards) that made 34 *correct* multi-slice bindings look like
duplicated/repeated inputs in the first place.

**Architecture:** `formula_binding` + `formula_binding_dimension` is the
source of truth for how a KPI's formula variables are bound (spec §5.3);
`kpi_definitions.formula_inputs` is a JSON cache kept "in lockstep" for the
compute engine, which today reads bindings-first-JSON-fallback
(`resolveTargets.ts` → `loadFormulaInputsFromBindings`). Fixing a KPI's
calculation requires correcting the binding-dimension row (source of truth)
*and* resyncing the JSON cache — patching only the JSON has zero effect on
computed values for any KPI already on bindings. Two independent subsystems:
(A) a one-time data migration + recompute for the 8 affected KPIs, (B) a
permanent UI fix so multi-slice bindings never look like duplicates again.

**Tech Stack:** PostgreSQL (raw SQL migrations, repo convention:
`scripts/sql/YYYY-MM-DD-<name>.sql`), Drizzle ORM, TypeScript one-off scripts
run via `node --env-file=.env --import tsx scripts/<name>.ts [--apply]`
(repo convention, see `scripts/backfill-formula-bindings.ts`), Next.js/React
19, Vitest.

**Spec:** No standalone spec doc — this plan is the direct output of a live
data audit conducted in-conversation (see prior session: duplicate-key bug
fix in `app/data-entry/review-kpi/service.ts` + `components/data-entry/review-kpi-row.tsx`,
then a full-table audit of `kpi_definitions.formula_inputs`/`formula_binding`).
All root causes below were verified against the live database, not inferred.

## Global Constraints

- Never hand-patch `kpi_definitions.formula_inputs` JSON for a KPI that has
  `formula_binding` rows without also correcting `formula_binding_dimension`
  — the JSON is a cache, not the source of truth, and the compute engine
  ignores it once bindings exist.
- Every one-off script under `scripts/` must support a dry-run (default) and
  an explicit `--apply` flag before writing, per `scripts/backfill-formula-bindings.ts`'s
  established convention.
- `@/*` path alias resolves to the project root (tsconfig + vitest config).
- New/changed code must pass `npx tsc --noEmit -p tsconfig.json` (ignoring
  pre-existing unrelated `.next/types` errors) and `npx eslint <file>`.
- Test glob: `test/**/*.test.{ts,tsx}`; unit tests in `test/unit/`,
  integration in `test/integration/`.

---

## File Structure

**Data-fix subsystem (A) — no application code changes:**
- Create: `scripts/sql/2026-09-25-fix-employees-formula-binding-dims.sql` —
  corrects the 9 mis-pinned `formula_binding_dimension.member_id` rows across
  KPIs 62, 63, 78, 79, 80, 82, 89.
- Create: `scripts/resync-kpi-formula-inputs-cache.ts` — reusable utility:
  regenerates `kpi_definitions.formula_inputs` from `formula_binding` for a
  given list of KPI ids, so the JSON cache matches the corrected bindings.
- Create: `scripts/sql/2026-09-25-fix-kpi-33-revenue-measure-ref.sql` —
  corrects KPI 33 "Revenue"'s orphaned `measure_def_id` (legacy-JSON-only,
  no `formula_binding` rows exist for it, so no binding-table change needed).
- Create: `scripts/verify-kpi-formula-input-integrity.ts` — reusable,
  read-only health-check: exact-duplicate-slice collisions + orphaned/inactive
  measure references across all `kpi_definitions.formula_inputs`.
- Create: `scripts/recompute-kpis.ts` — reusable: runs `recomputeKpiNow` for
  a given list of KPI ids across all benchmarking-opted-in report periods.

**UI subsystem (B) — review-kpi Inputs slice labeling:**
- Create: `app/data-entry/review-kpi/slice-label.ts` — pure function
  `computeSliceLabel`, unit-tested without a DB.
- Test: `test/unit/data-entry/review-kpi/slice-label.test.ts`
- Modify: `app/data-entry/review-kpi/types.ts` — add `sliceLabel` field.
- Modify: `app/data-entry/review-kpi/service.ts` — batch-resolve pinned
  dimension member names, compute `sliceLabel` per input.
- Test: `test/integration/data-entry/review-kpi/slice-label-display.integration.test.tsx`
- Modify: `components/data-entry/review-kpi-input-value.tsx` — render the
  label.
- Modify: `components/data-entry/review-kpi-row.tsx` — preserve `sliceLabel`
  across live-sync/save-response merges (same pattern already used for
  `variableName`).

---

## Task 1: Fix the 9 mis-pinned `formula_binding_dimension` rows (source of truth)

**Files:**
- Create: `scripts/sql/2026-09-25-fix-employees-formula-binding-dims.sql`

**Interfaces:**
- Consumes: nothing (raw SQL against existing `formula_binding_dimension` rows).
- Produces: corrected `member_id` values that `loadFormulaInputsFromBindings`
  (`app/data-entry/kpi-worker/formula-bindings.ts`) will read on next compute.

Every row below was individually located and its *current* `member_id`
verified equal to the `from` value before this plan was written — there is
no ambiguity about which row each statement targets.

| dimension row id | binding_id | KPI | variable_name | dimension_key | from → to |
|---|---|---|---|---|---|
| 484 | 332 | 62 "Total Employees Female" | `finance_employees_female` | division_id | 1012 → 1014 |
| 479 | 329 | 63 "Total Employees" | `employees_male` | gender_id | 1022 → 930 |
| 477 | 328 | 63 "Total Employees" | `employees_female` | gender_id | 1022 → 931 |
| 552 | 393 | 78 "PR Marketing and CustService Employees Total" | `pr_and_marketing_employees_male` | gender_id | 1022 → 930 |
| 545 | 390 | 79 "PR Marketing and CustService Employees Male %" | `pr_and_marketing_employees_male` | division_id | 1020 → 1018 |
| 547 | 391 | 79 "PR Marketing and CustService Employees Male %" | `pr_and_marketing_employees_total` | division_id | 1020 → 1018 |
| 542 | 388 | 80 "PR Marketing and CustService Employees Female %" | `pr_and_marketing_employees_female` | gender_id | 1022 → 931 |
| 35 | 56 | 82 "Administrative Employees Male %" | `administrative_employees_total` | division_id | 1011 → 1020 |
| 522 | 360 | 89 "Other Divisions Employees Female %" | `other_employees_total` | division_id | 1011 → 1021 |

Why each is wrong (verified against every sibling department's identical
KPI triple — Executive/Technical/Finance/HR/ICT/Procurement all follow this
pattern with zero exceptions):
- A `_male` variable must pin `gender_id = 930`; `_female` → `931`; a
  `_total` variable pins `gender_id = 1022` (All — it sums both genders).
- A `_total` binding must pin the *same* `division_id` as its `_male`/`_female`
  siblings within that department (it's "this department's total", not the
  whole utility's).
- Rows 545/547 (KPI 79) are pinned to `division_id 1018` in the codebase's
  own audit — sibling KPIs 78 and 80 both correctly use 1018 ("PR & Marketing")
  for this same department; only 79 drifted to 1020 ("Administrative").

- [ ] **Step 1: Write the migration SQL**

```sql
-- Fix 9 mis-pinned formula_binding_dimension.member_id rows discovered by a
-- full-table audit of every KPI's formula bindings (2026-09-25). Each row
-- was individually verified: gender/division pinned to the wrong member,
-- diverging from every sibling department's identical KPI structure.
-- See docs/superpowers/plans/2026-09-25-kpi-formula-binding-fixes.md Task 1.
--
-- Run `scripts/resync-kpi-formula-inputs-cache.ts` for kpiDefIds
-- [62,63,78,79,80,82,89] immediately after applying this, to keep the
-- kpi_definitions.formula_inputs JSON cache in lockstep (it is NOT the
-- source of truth and the compute engine ignores it once bindings exist,
-- but downstream display code still reads it).

BEGIN;

-- KPI 62 "Total Employees Female": finance_employees_female was pinned to
-- the Executive division instead of Finance.
UPDATE formula_binding_dimension SET member_id = 1014 WHERE id = 484;

-- KPI 63 "Total Employees": both employees_male and employees_female were
-- pinned to gender "All" instead of their own gender — meaning the formula
-- summed the same utility-wide total twice instead of male + female.
UPDATE formula_binding_dimension SET member_id = 930 WHERE id = 479;
UPDATE formula_binding_dimension SET member_id = 931 WHERE id = 477;

-- KPI 78 "PR Marketing and CustService Employees Total":
-- pr_and_marketing_employees_male was pinned to gender "All" instead of Male.
UPDATE formula_binding_dimension SET member_id = 930 WHERE id = 552;

-- KPI 79 "PR Marketing and CustService Employees Male %": both bindings were
-- pinned to the Administrative division instead of PR & Marketing.
UPDATE formula_binding_dimension SET member_id = 1018 WHERE id = 545;
UPDATE formula_binding_dimension SET member_id = 1018 WHERE id = 547;

-- KPI 80 "PR Marketing and CustService Employees Female %":
-- pr_and_marketing_employees_female was pinned to gender "All" instead of Female.
UPDATE formula_binding_dimension SET member_id = 931 WHERE id = 542;

-- KPI 82 "Administrative Employees Male %": administrative_employees_total
-- was pinned to division "All" (utility-wide) instead of Administrative,
-- so the Male % denominator was the whole utility's headcount, not the
-- department's.
UPDATE formula_binding_dimension SET member_id = 1020 WHERE id = 35;

-- KPI 89 "Other Divisions Employees Female %": other_employees_total was
-- pinned to division "All" instead of Other, same class of bug as KPI 82.
UPDATE formula_binding_dimension SET member_id = 1021 WHERE id = 522;

COMMIT;
```

- [ ] **Step 2: Dry-run — verify each row's CURRENT value matches the expected `from` before applying**

Run against the database (read-only, no transaction needed):

```bash
node --env-file=.env -e "
const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const expected = [
    [484,1012],[479,1022],[477,1022],[552,1022],[545,1020],[547,1020],[542,1022],[35,1011],[522,1011],
  ];
  const { rows } = await c.query('select id, member_id from formula_binding_dimension where id = ANY(\$1::int[])', [expected.map(e => e[0])]);
  const byId = new Map(rows.map(r => [r.id, r.member_id]));
  for (const [id, from] of expected) {
    const actual = byId.get(id);
    console.log(id, actual === from ? 'OK matches expected from=' + from : 'MISMATCH actual=' + actual + ' expected=' + from);
  }
  await c.end();
})();
"
```

Expected: every row prints `OK matches expected from=...`. If any prints
`MISMATCH`, STOP — do not apply the migration; the row was already changed
by something else since this plan was written and the fix must be re-derived.

- [ ] **Step 3: Apply the migration**

```bash
psql "$DATABASE_URL" -f scripts/sql/2026-09-25-fix-employees-formula-binding-dims.sql
```

- [ ] **Step 4: Verify the migration applied**

```bash
node --env-file=.env -e "
const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const expected = [
    [484,1014],[479,930],[477,931],[552,930],[545,1018],[547,1018],[542,931],[35,1020],[522,1021],
  ];
  const { rows } = await c.query('select id, member_id from formula_binding_dimension where id = ANY(\$1::int[])', [expected.map(e => e[0])]);
  const byId = new Map(rows.map(r => [r.id, r.member_id]));
  for (const [id, to] of expected) {
    const actual = byId.get(id);
    console.log(id, actual === to ? 'OK now=' + to : 'STILL WRONG actual=' + actual + ' expected=' + to);
  }
  await c.end();
})();
"
```

Expected: every row prints `OK now=...`.

- [ ] **Step 5: Commit**

```bash
git add scripts/sql/2026-09-25-fix-employees-formula-binding-dims.sql
git commit -m "fix(kpi): correct 9 mis-pinned formula_binding_dimension rows (KPIs 62/63/78/79/80/82/89)"
```

---

## Task 2: Resync the `kpi_definitions.formula_inputs` JSON cache from bindings

**Files:**
- Create: `scripts/resync-kpi-formula-inputs-cache.ts`

**Interfaces:**
- Consumes: `loadFormulaInputsFromBindings` from
  `@/app/data-entry/kpi-worker/formula-bindings` (existing, signature
  `(ownerKind: "kpi" | "measure", ownerIds: number[]) => Promise<Map<number, FormulaInput[]>>`).
- Produces: `kpi_definitions.formula_inputs` rows byte-matching what the
  compute engine already derives from bindings — closes the gap where
  `listReviewKpiRows` (which reads the JSON directly, not via bindings)
  could show stale input labels/values relative to what the worker actually
  computed with.

- [ ] **Step 1: Write the script**

```typescript
/**
 * Resync kpi_definitions.formula_inputs (the derived JSON cache) from
 * formula_binding / formula_binding_dimension (the source of truth) for a
 * given set of KPI ids. Use after any direct formula_binding_dimension
 * correction so the two representations stay "in lockstep" per
 * db/schema/formulaBinding.ts's documented invariant.
 *
 * KPIs with NO formula_binding rows are skipped (nothing to resync from —
 * they are still legacy-JSON-only; see loadFormulaInputsFromBindings' own
 * doc comment).
 *
 *   node --env-file=.env --import tsx scripts/resync-kpi-formula-inputs-cache.ts 62 63 78 79 80 82 89            # dry run
 *   node --env-file=.env --import tsx scripts/resync-kpi-formula-inputs-cache.ts 62 63 78 79 80 82 89 --apply    # write
 */
import { eq } from "drizzle-orm";

import { db } from "@/db/connection";
import { kpiDefinitions } from "@/db/schema/kpi";
import { loadFormulaInputsFromBindings } from "@/app/data-entry/kpi-worker/formula-bindings";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const kpiDefIds = args
  .filter((a) => a !== "--apply")
  .map((a) => Number(a))
  .filter((n) => Number.isInteger(n) && n > 0);

async function main() {
  if (kpiDefIds.length === 0) {
    console.error(
      "Usage: resync-kpi-formula-inputs-cache.ts <kpiDefId...> [--apply]",
    );
    process.exit(1);
  }

  const bindingsByOwner = await loadFormulaInputsFromBindings(
    "kpi",
    kpiDefIds,
  );

  const currentRows = await db
    .select({ id: kpiDefinitions.id, formula_inputs: kpiDefinitions.formula_inputs })
    .from(kpiDefinitions);
  const currentById = new Map(currentRows.map((r) => [r.id, r.formula_inputs]));

  for (const kpiDefId of kpiDefIds) {
    const derived = bindingsByOwner.get(kpiDefId);
    if (!derived) {
      console.log(
        `KPI ${kpiDefId}: SKIP — no formula_binding rows, still legacy-JSON-only.`,
      );
      continue;
    }

    const current = currentById.get(kpiDefId) ?? null;
    const unchanged = JSON.stringify(current) === JSON.stringify(derived);
    console.log(
      `KPI ${kpiDefId}: ${unchanged ? "already in sync" : "WILL UPDATE"}`,
    );
    console.log("  current:", JSON.stringify(current));
    console.log("  derived:", JSON.stringify(derived));

    if (APPLY && !unchanged) {
      await db
        .update(kpiDefinitions)
        .set({ formula_inputs: derived })
        .where(eq(kpiDefinitions.id, kpiDefId));
      console.log(`  -> written.`);
    }
  }

  if (!APPLY) {
    console.log("\nDry run only. Re-run with --apply to write.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
```

- [ ] **Step 2: Dry run — confirm it reports exactly the 7 affected KPIs as "WILL UPDATE" with the corrected values**

```bash
node --env-file=.env --import tsx scripts/resync-kpi-formula-inputs-cache.ts 62 63 78 79 80 82 89
```

Expected: all 7 KPIs print `WILL UPDATE`, and each `derived` line shows the
corrected `division_id`/`gender_id` from Task 1 (e.g. KPI 62's
`finance_employees_female` entry shows `"division_id":1014`).

- [ ] **Step 3: Apply**

```bash
node --env-file=.env --import tsx scripts/resync-kpi-formula-inputs-cache.ts 62 63 78 79 80 82 89 --apply
```

- [ ] **Step 4: Verify — re-run the dry run; every KPI should now say "already in sync"**

```bash
node --env-file=.env --import tsx scripts/resync-kpi-formula-inputs-cache.ts 62 63 78 79 80 82 89
```

Expected: all 7 KPIs print `already in sync`.

- [ ] **Step 5: Commit**

```bash
git add scripts/resync-kpi-formula-inputs-cache.ts
git commit -m "feat(kpi): add formula_inputs cache resync script; apply to KPIs 62/63/78/79/80/82/89"
```

---

## Task 3: Fix KPI 33 "Revenue"'s orphaned measure reference

**Files:**
- Create: `scripts/sql/2026-09-25-fix-kpi-33-revenue-measure-ref.sql`

**Interfaces:**
- Consumes: nothing (KPI 33 has zero `formula_binding` rows — confirmed by
  querying `formula_binding WHERE owner_kind='kpi' AND owner_id=33` — so this
  is a direct JSON-only fix, no binding table involved).
- Produces: a working `service_revenue` input, pointed at
  `measure_definitions.id = 200` ("Revenue", `variable_name: revenue_currency`,
  `is_active: true`, 80 existing `data_entries` rows). This is the correct
  target: 7 other Financial KPIs (34, 35, 37, 42, 43, 44, 109) already bind
  the same variable pattern (`service_revenue`/`electricity_revenue`) to
  measure 200; `measure_def_id: 1300` (KPI 33's current, broken reference)
  does not exist in `measure_definitions` at all.

- [ ] **Step 1: Write the migration SQL**

```sql
-- KPI 33 "Revenue"'s only formula input (service_revenue) points to
-- measure_def_id 1300, which does not exist in measure_definitions — the
-- KPI can never compute. Every sibling Financial KPI (34 Operating Cost
-- Recovery, 35 Operating Ratio, 37 Debtor Days, 44 Profit Margin, 109
-- Customer Sales) binds the equivalent variable to measure_def_id 200
-- ("Revenue", active, 80 data_entries rows). Repoint KPI 33 to match.
-- KPI 33 has zero formula_binding rows (still legacy-JSON-only) — this is a
-- direct JSON patch, no formula_binding_dimension change needed.
-- See docs/superpowers/plans/2026-09-25-kpi-formula-binding-fixes.md Task 3.

BEGIN;

UPDATE kpi_definitions
   SET formula_inputs = (
     SELECT jsonb_agg(
       CASE
         WHEN elem->>'variable_name' = 'service_revenue'
         THEN elem || jsonb_build_object('measure_def_id', 200)
         ELSE elem
       END
     )
     FROM jsonb_array_elements(formula_inputs::jsonb) elem
   )
 WHERE id = 33;

COMMIT;
```

- [ ] **Step 2: Dry-run — confirm KPI 33's current state matches what this migration expects**

```bash
node --env-file=.env -e "
const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const { rows } = await c.query('select formula_inputs from kpi_definitions where id = 33');
  console.log(JSON.stringify(rows[0].formula_inputs));
  const { rows: bindings } = await c.query(\"select count(*) from formula_binding where owner_kind='kpi' and owner_id=33\");
  console.log('formula_binding rows for KPI 33:', bindings[0].count, '(must be 0)');
  await c.end();
})();
"
```

Expected: `formula_inputs` shows exactly one element with
`"variable_name":"service_revenue","measure_def_id":1300`, and
`formula_binding rows for KPI 33: 0`. If the binding count is not 0, STOP —
KPI 33 has since been migrated to bindings and this plan's Task 3 must be
redone as a `formula_binding_dimension`-style fix instead (see Task 1).

- [ ] **Step 3: Apply the migration**

```bash
psql "$DATABASE_URL" -f scripts/sql/2026-09-25-fix-kpi-33-revenue-measure-ref.sql
```

- [ ] **Step 4: Verify**

```bash
node --env-file=.env -e "
const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const { rows } = await c.query('select formula_inputs from kpi_definitions where id = 33');
  console.log(JSON.stringify(rows[0].formula_inputs));
  await c.end();
})();
"
```

Expected: `[{"variable_name":"service_revenue","measure_def_id":200}]`.

- [ ] **Step 5: Commit**

```bash
git add scripts/sql/2026-09-25-fix-kpi-33-revenue-measure-ref.sql
git commit -m "fix(kpi): repoint KPI 33 Revenue's orphaned measure_def_id 1300 -> 200"
```

---

## Task 4: Regression-check the whole KPI list (reusable ongoing health check)

**Files:**
- Create: `scripts/verify-kpi-formula-input-integrity.ts`

**Interfaces:**
- Consumes: raw `pg` queries against `kpi_definitions`, `measure_definitions`
  (read-only; no app imports needed, mirrors the ad-hoc audit queries already
  run during this investigation).
- Produces: a pass/fail report; exits non-zero if any check fails, so it can
  be reused as a CI/pre-deploy gate later if desired.

- [ ] **Step 1: Write the script**

```typescript
/**
 * Read-only integrity check across every KPI's formula_inputs. Written
 * during the 2026-09-25 audit that found 9 mis-pinned dimensions (KPIs
 * 62/63/78/79/80/82/89) and 1 orphaned measure reference (KPI 33). Re-run
 * after any formula-binding fix, and periodically as a regression guard.
 *
 *   node --env-file=.env --import tsx scripts/verify-kpi-formula-input-integrity.ts
 */
import { Client } from "pg";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  let failed = false;

  // Check 1: two+ formula_inputs entries pinned to the EXACT same dimension
  // slice (measure + all 10 dims identical) — guaranteed miscalculation /
  // duplicate render, regardless of variable_name.
  const { rows: exactDupes } = await client.query(`
    with fi as (
      select kd.id as kpi_def_id, kd.name,
             fi_elem->>'variable_name' as variable_name,
             fi_elem->>'measure_def_id' as measure_def_id,
             fi_elem->>'provider_id' as provider_id,
             fi_elem->>'category_id' as category_id,
             fi_elem->>'technology_id' as technology_id,
             fi_elem->>'asset_class_id' as asset_class_id,
             fi_elem->>'customer_type_id' as customer_type_id,
             fi_elem->>'payment_mode_id' as payment_mode_id,
             fi_elem->>'consumption_band_id' as consumption_band_id,
             fi_elem->>'division_id' as division_id,
             fi_elem->>'gender_id' as gender_id,
             fi_elem->>'utility_function_id' as utility_function_id
      from kpi_definitions kd, jsonb_array_elements(kd.formula_inputs::jsonb) fi_elem
    )
    select kpi_def_id, name, array_agg(variable_name) as colliding_variables, count(*) as n
    from fi
    group by kpi_def_id, name, measure_def_id, provider_id, category_id, technology_id,
             asset_class_id, customer_type_id, payment_mode_id, consumption_band_id,
             division_id, gender_id, utility_function_id
    having count(*) > 1
    order by kpi_def_id
  `);
  if (exactDupes.length > 0) {
    failed = true;
    console.log("FAIL — exact-duplicate-slice collisions found:");
    for (const r of exactDupes) {
      console.log(` ${r.kpi_def_id} ${r.name} -> ${r.colliding_variables.join(" <-> ")}`);
    }
  } else {
    console.log("PASS — no exact-duplicate-slice collisions across all KPIs.");
  }

  // Check 2: formula_inputs referencing a measure_def_id that doesn't exist,
  // or that exists but is inactive.
  const { rows: orphans } = await client.query(`
    with fi as (
      select kd.id as kpi_def_id, kd.name,
             (fi_elem->>'measure_def_id')::int as measure_def_id,
             fi_elem->>'variable_name' as variable_name
      from kpi_definitions kd, jsonb_array_elements(kd.formula_inputs::jsonb) fi_elem
    )
    select fi.kpi_def_id, fi.name, fi.variable_name, fi.measure_def_id, md.is_active
    from fi
    left join measure_definitions md on md.id = fi.measure_def_id
    where md.id is null or md.is_active = false
  `);
  if (orphans.length > 0) {
    failed = true;
    console.log("FAIL — orphaned/inactive measure references found:");
    for (const r of orphans) {
      console.log(` ${r.kpi_def_id} ${r.name} -> ${r.variable_name} references measure_def_id ${r.measure_def_id} (is_active=${r.is_active ?? "MISSING"})`);
    }
  } else {
    console.log("PASS — every formula_inputs measure_def_id exists and is active.");
  }

  // Informational only (not a failure): active KPIs with no formula at all.
  const { rows: noFormula } = await client.query(`
    select id, name
    from kpi_definitions
    where is_active = true
      and (formula_inputs is null or jsonb_array_length(formula_inputs::jsonb) = 0)
    order by id
  `);
  console.log(
    `INFO — ${noFormula.length} active KPI(s) with no formula configured (not a regression check failure, needs a product decision):`,
  );
  for (const r of noFormula) console.log(`  ${r.id} ${r.name}`);

  await client.end();
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run it BEFORE Tasks 1-3's migrations are applied, capture the baseline (should show all pre-existing failures)**

```bash
node --env-file=.env --import tsx scripts/verify-kpi-formula-input-integrity.ts
```

Expected (pre-fix baseline): Check 1 FAILs listing KPIs 62/63/80; Check 2
FAILs listing KPI 33's `measure_def_id 1300`.

- [ ] **Step 3: Run it again AFTER Tasks 1-3 are applied**

```bash
node --env-file=.env --import tsx scripts/verify-kpi-formula-input-integrity.ts
```

Expected: both checks PASS, exit code 0. The informational "no formula
configured" list still shows the 10 KPIs (127-135, 108) — this is expected;
fixing those requires a product decision on what their formulas should be
and is explicitly out of scope for this plan (see "Out of scope" section at
the end).

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-kpi-formula-input-integrity.ts
git commit -m "feat(kpi): add reusable formula_inputs integrity check script"
```

---

## Task 5: Recompute the 8 fixed KPIs across all opted-in periods

**Files:**
- Create: `scripts/recompute-kpis.ts`

**Interfaces:**
- Consumes: `recomputeKpiNow` from `@/app/data-entry/kpi-worker/recompute`
  (existing, signature `(args: { kpiDefIds?: number[]; all?: boolean; reportPeriodIds?: number[] }) => Promise<RecomputeKpiNowResult>`).
  This is the plain worker module (no `"use server"`), directly importable
  from a tsx script — do NOT import `recomputeKpiNow` from
  `app/settings/kpi/unified-formula-service.ts` instead, that one is a server
  action wrapper meant for the Settings UI button, not script use.
- Produces: updated `kpi.actual_value` rows (the exact table
  `listReviewKpiRows` reads) for every report period the fixed KPIs apply to.

- [ ] **Step 1: Write the script**

```typescript
/**
 * Recompute a set of KPIs across every benchmarking-opted-in report period.
 * Use after any formula_binding_dimension / formula_inputs correction so
 * `kpi.actual_value` reflects the fix (it does not update itself).
 *
 *   node --env-file=.env --import tsx scripts/recompute-kpis.ts 33 62 63 78 79 80 82 89
 */
import { recomputeKpiNow } from "@/app/data-entry/kpi-worker/recompute";

const kpiDefIds = process.argv
  .slice(2)
  .map((a) => Number(a))
  .filter((n) => Number.isInteger(n) && n > 0);

async function main() {
  if (kpiDefIds.length === 0) {
    console.error("Usage: recompute-kpis.ts <kpiDefId...>");
    process.exit(1);
  }

  console.log(`Recomputing KPIs [${kpiDefIds.join(", ")}] across all opted-in periods...`);
  const result = await recomputeKpiNow({ kpiDefIds });

  console.log(`processed=${result.processed} failed=${result.failed} notApplicable=${result.notApplicable}`);
  if (result.failed > 0) {
    console.log("Failures:");
    for (const row of result.byPeriod) {
      if (row.status === "failed") {
        console.log(`  period ${row.reportPeriodId} kpi ${row.kpiDefId}: ${row.reason}`);
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
```

- [ ] **Step 2: Run it**

```bash
node --env-file=.env --import tsx scripts/recompute-kpis.ts 33 62 63 78 79 80 82 89
```

Expected: `processed` > 0 for periods where these KPIs have data;
`failed=0` (a `notApplicable` count is fine — it means a period genuinely
has no inputs for that KPI, not an error).

- [ ] **Step 3: Spot-check KPI 63's corrected result for one period**

```bash
node --env-file=.env -e "
const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const { rows } = await c.query(\"select report_period_id, actual_value, calculated_at from kpi where kpi_def_id = 63 order by calculated_at desc limit 5\");
  console.log(JSON.stringify(rows, null, 2));
  await c.end();
})();
"
```

Expected: `calculated_at` timestamps are recent (from this run), and
`actual_value` for at least one period is no longer double-counting (cross-
check against the sum of that period's male + female `data_entries` rows for
measure 260 if you want a hand-verified sanity check).

- [ ] **Step 4: Commit**

```bash
git add scripts/recompute-kpis.ts
git commit -m "feat(kpi): add recompute-kpis script; recompute KPIs 33/62/63/78/79/80/82/89"
```

---

## Task 6: `computeSliceLabel` — pure function for the Inputs-card dimension label

**Files:**
- Create: `app/data-entry/review-kpi/slice-label.ts`
- Test: `test/unit/data-entry/review-kpi/slice-label.test.ts`

**Interfaces:**
- Consumes: `DIMENSIONS` from `@/lib/dimensions/dimension-map` (existing,
  `readonly DimensionDef[]` with `{ field, allMember, label, ... }`); `FormulaInput`
  type from `@/db/schema/dataEntry`.
- Produces: `computeSliceLabel(formulaInput, memberNameById): string | null`
  — consumed by Task 7's `service.ts` change.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";

import type { FormulaInput } from "@/db/schema/dataEntry";
import { ALL_MEMBER } from "@/lib/data-entry/dimensions";
import { computeSliceLabel } from "@/app/data-entry/review-kpi/slice-label";

const allMemberInput = (): FormulaInput => ({
  measure_def_id: 1,
  variable_name: "x",
  provider_id: ALL_MEMBER.provider_id,
  category_id: ALL_MEMBER.category_id,
  technology_id: ALL_MEMBER.technology_id,
  asset_class_id: ALL_MEMBER.asset_class_id,
  customer_type_id: ALL_MEMBER.customer_type_id,
  payment_mode_id: ALL_MEMBER.payment_mode_id,
  consumption_band_id: ALL_MEMBER.consumption_band_id,
  division_id: ALL_MEMBER.division_id,
  gender_id: ALL_MEMBER.gender_id,
  utility_function_id: ALL_MEMBER.utility_function_id,
});

describe("computeSliceLabel", () => {
  it("returns null when every dimension is the All-member (no slice — just the measure)", () => {
    expect(computeSliceLabel(allMemberInput(), new Map())).toBeNull();
  });

  it("labels a single pinned dimension by its resolved managed_list_items name", () => {
    const input = { ...allMemberInput(), division_id: 1012 };
    const names = new Map([[1012, "Executive"]]);
    expect(computeSliceLabel(input, names)).toBe("Executive");
  });

  it("joins multiple pinned dimensions, in DIMENSIONS' canonical order", () => {
    // division_id precedes gender_id in the canonical DIMENSIONS order.
    const input = { ...allMemberInput(), gender_id: 931, division_id: 1012 };
    const names = new Map([
      [1012, "Executive"],
      [931, "Female"],
    ]);
    expect(computeSliceLabel(input, names)).toBe("Executive • Female");
  });

  it("skips a pinned member with no resolved name, rather than showing a raw id", () => {
    const input = { ...allMemberInput(), division_id: 999999 };
    expect(computeSliceLabel(input, new Map())).toBeNull();
  });

  it("this is the exact shape that produced the reported 'lot of repeated inputs': KPI 62-style per-division binding", () => {
    const input = { ...allMemberInput(), division_id: 1014, gender_id: 931 };
    const names = new Map([
      [1014, "Finance"],
      [931, "Female"],
    ]);
    expect(computeSliceLabel(input, names)).toBe("Finance • Female");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run test/unit/data-entry/review-kpi/slice-label.test.ts
```

Expected: FAIL — `Cannot find module '@/app/data-entry/review-kpi/slice-label'`.

- [ ] **Step 3: Write the implementation**

```typescript
import type { FormulaInput } from "@/db/schema/dataEntry";
import { DIMENSIONS } from "@/lib/dimensions/dimension-map";

type DimensionSliceInput = Pick<
  FormulaInput,
  | "provider_id"
  | "category_id"
  | "technology_id"
  | "asset_class_id"
  | "customer_type_id"
  | "payment_mode_id"
  | "consumption_band_id"
  | "division_id"
  | "gender_id"
  | "utility_function_id"
>;

/**
 * Human-readable label for the dimension slice a formula binding pins, e.g.
 * "Finance • Female" or "Transmission". Returns null when every dimension is
 * the canonical All-member (the binding reads the whole measure — no slice
 * to label).
 *
 * Fixes the "a lot of inputs look repeated" report: many KPIs legitimately
 * bind the SAME measure multiple times, once per dimension slice (e.g. one
 * entry per division for "Total Employees Female" — 9 correct, distinct
 * values). The review-kpi Inputs card only ever showed the measure's bare
 * name, so all N slices looked visually identical even though the
 * underlying data was correct. This label disambiguates them.
 */
export const computeSliceLabel = (
  formulaInput: DimensionSliceInput,
  memberNameById: Map<number, string>,
): string | null => {
  const parts: string[] = [];

  for (const dimension of DIMENSIONS) {
    const memberId = formulaInput[dimension.field];
    if (memberId == null || memberId === dimension.allMember) {
      continue;
    }

    const name = memberNameById.get(memberId);
    if (name) {
      parts.push(name);
    }
  }

  return parts.length > 0 ? parts.join(" • ") : null;
};
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run test/unit/data-entry/review-kpi/slice-label.test.ts
```

Expected: PASS, 5/5 tests.

- [ ] **Step 5: Typecheck and lint**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v ".next/types"
npx eslint app/data-entry/review-kpi/slice-label.ts test/unit/data-entry/review-kpi/slice-label.test.ts
```

Expected: no output from either command.

- [ ] **Step 6: Commit**

```bash
git add app/data-entry/review-kpi/slice-label.ts test/unit/data-entry/review-kpi/slice-label.test.ts
git commit -m "feat(review-kpi): add computeSliceLabel for dimension-slice display labels"
```

---

## Task 7: Wire `sliceLabel` into `ReviewKpiInputValue` and `listReviewKpiRows`

**Files:**
- Modify: `app/data-entry/review-kpi/types.ts`
- Modify: `app/data-entry/review-kpi/service.ts`
- Test: `test/integration/data-entry/review-kpi/slice-label-display.integration.test.tsx`
  (written in Task 8 alongside the component change, since it asserts on
  rendered output — this task's own verification is the type/service unit
  check in Step 3 below)

**Interfaces:**
- Consumes: `computeSliceLabel` from Task 6; `DIMENSIONS` from
  `@/lib/dimensions/dimension-map`; existing `managedListItems` Drizzle table.
- Produces: `ReviewKpiInputValue.sliceLabel: string | null | undefined` —
  consumed by Task 8's component render.

- [ ] **Step 1: Add the field to the type**

In `app/data-entry/review-kpi/types.ts`, extend `ReviewKpiInputValue`
(the file already has a `variableName?: string` field with a doc comment
from a prior fix — add `sliceLabel` right after it):

```typescript
  variableName?: string;
  /**
   * Human-readable dimension-slice label (e.g. "Finance • Female"), when
   * this binding pins at least one dimension away from its All-member.
   * `null` when the binding reads the whole measure (no slice to label).
   * `undefined` on responses not resolved against a specific binding, same
   * caveat as `variableName`.
   */
  sliceLabel?: string | null;
```

- [ ] **Step 2: Compute it in `listReviewKpiRows`**

In `app/data-entry/review-kpi/service.ts`, add the import (alongside the
existing `dimension-rollup` import):

```typescript
import { computeSliceLabel } from "@/app/data-entry/review-kpi/slice-label";
import { DIMENSIONS } from "@/lib/dimensions/dimension-map";
```

Immediately before the `return kpiDefinitionRows.map((kpiDefinition) => {`
line, batch-resolve every pinned dimension member's name across ALL KPIs in
one query:

```typescript
  const pinnedMemberIds = [
    ...new Set(
      kpiDefinitionRows.flatMap((row) =>
        (row.formulaInputs ?? []).flatMap((formulaInput) =>
          DIMENSIONS.flatMap((dimension) => {
            const memberId = (
              formulaInput as unknown as Record<string, number | undefined>
            )[dimension.field];
            return memberId != null && memberId !== dimension.allMember
              ? [memberId]
              : [];
          }),
        ),
      ),
    ),
  ];

  const sliceMemberNameById = pinnedMemberIds.length
    ? new Map(
        (
          await db
            .select({ id: managedListItems.id, name: managedListItems.name })
            .from(managedListItems)
            .where(inArray(managedListItems.id, pinnedMemberIds))
        ).map((row) => [row.id, row.name]),
      )
    : new Map<number, string>();
```

Then, inside the existing `flatMap((formulaInput) => { ... })` (the same
function Task 6/the prior duplicate-key fix already modified), add
`sliceLabel: computeSliceLabel(formulaInput, sliceMemberNameById),` to
**both** return branches — the missing-placeholder object and the
`sourceRows.map((row) => ({ ... }))` object — right after the existing
`variableName: formulaInput.variable_name,` line in each.

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v ".next/types"
```

Expected: no output.

- [ ] **Step 4: Run the existing review-kpi suite to confirm no regression**

```bash
npx vitest run test/integration/data-entry/review-kpi test/unit/data-entry/kpi-worker
```

Expected: all previously-passing tests still pass (this task only adds an
optional field and a new computed value; it does not change any existing
input's `dataEntryId`, `value`, or count).

- [ ] **Step 5: Commit**

```bash
git add app/data-entry/review-kpi/types.ts app/data-entry/review-kpi/service.ts
git commit -m "feat(review-kpi): compute sliceLabel per formula-input binding"
```

---

## Task 8: Render `sliceLabel` on the Inputs card; preserve it across merges

**Files:**
- Modify: `components/data-entry/review-kpi-input-value.tsx`
- Modify: `components/data-entry/review-kpi-row.tsx`
- Test: `test/integration/data-entry/review-kpi/slice-label-display.integration.test.tsx`

**Interfaces:**
- Consumes: `ReviewKpiInputValue.sliceLabel` (Task 7).
- Produces: visible UI — no other module depends on this task's output.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ReviewKpiRowCard } from "@/components/data-entry/review-kpi-row";
import type { ReviewKpiRow } from "@/app/data-entry/review-kpi/types";
import { reviewKpiFilterFixture } from "@/test/fixtures/review-kpi";

vi.mock("@/app/data-entry/review-kpi/use-review-kpi-sync", () => ({
  useReviewKpiSync: () => ({ isConnected: true, error: null }),
}));

// Regression for "it seems like a lot of inputs are being repeated": KPI 62
// "Total Employees Female" legitimately binds "Employees" nine times, once
// per division. Before this fix, every card showed the bare name "Employees"
// with nothing to distinguish them. This asserts each card now also shows
// its resolved dimension-slice label.
const buildRow = (): ReviewKpiRow => ({
  kpiDefId: 62,
  kpiName: "Total Employees Female",
  unitName: null,
  formulaText: "finance_employees_female + executive_employees_female + ...",
  categoryId: null,
  subcategoryId: null,
  reportPeriodId: reviewKpiFilterFixture.reportPeriodId ?? 202401,
  serviceAreaId: reviewKpiFilterFixture.serviceAreaId,
  inputs: [
    {
      dataEntryId: "d1c53fae-3c81-498b-bcaf-746a9f1cda9d",
      inputDefId: 260,
      inputName: "Employees",
      unitName: null,
      value: "12",
      controlType: "number",
      comments: [],
      updatedAt: "2026-03-24T00:00:00.000Z",
      updatedById: "u-1",
      variableName: "finance_employees_female",
      sliceLabel: "Finance • Female",
    },
    {
      dataEntryId: "5414d8e9-d9ae-4b97-bdec-2a2d4dd6fef3",
      inputDefId: 260,
      inputName: "Employees",
      unitName: null,
      value: "8",
      controlType: "number",
      comments: [],
      updatedAt: "2026-03-24T00:00:00.000Z",
      updatedById: "u-1",
      variableName: "executive_employees_female",
      sliceLabel: "Executive • Female",
    },
  ],
  result: {
    kpiId: "b7a1e9d4-4f19-4664-8422-c4e16073b4ad",
    value: "20",
    status: "calculated",
    calculatedAt: "2026-03-24T00:00:00.000Z",
    formulaVersion: "v1",
  },
});

describe("review kpi row — dimension-slice labels", () => {
  it("shows a distinguishing slice label under each repeated-name input", () => {
    render(
      <ReviewKpiRowCard
        row={buildRow()}
        context={reviewKpiFilterFixture}
      />,
    );

    expect(screen.getAllByText("Employees")).toHaveLength(2);
    expect(screen.getByText("Finance • Female")).toBeInTheDocument();
    expect(screen.getByText("Executive • Female")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run test/integration/data-entry/review-kpi/slice-label-display.integration.test.tsx
```

Expected: FAIL — `screen.getByText("Finance • Female")` not found (not
rendered yet).

- [ ] **Step 3: Render the label in the Inputs card**

In `components/data-entry/review-kpi-input-value.tsx`, find:

```tsx
      <div className="rounded-sm px-1.5 py-1 font-semibold leading-tight text-foreground/90">
        {input.inputName}
        {input.unitName ? (
          <span className="ml-1 font-normal text-muted-foreground">
            ({input.unitName})
          </span>
        ) : null}
      </div>
```

Replace with:

```tsx
      <div className="rounded-sm px-1.5 py-1 font-semibold leading-tight text-foreground/90">
        {input.inputName}
        {input.unitName ? (
          <span className="ml-1 font-normal text-muted-foreground">
            ({input.unitName})
          </span>
        ) : null}
        {input.sliceLabel ? (
          <div className="text-xs font-normal text-muted-foreground">
            {input.sliceLabel}
          </div>
        ) : null}
      </div>
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run test/integration/data-entry/review-kpi/slice-label-display.integration.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Preserve `sliceLabel` across merges, same pattern as `variableName`**

In `components/data-entry/review-kpi-row.tsx`, there are three places
(added in a prior fix) that preserve `variableName` when merging a
server/sync payload into local state, matched by `dataEntryId`. Extend all
three to also preserve `sliceLabel`:

```tsx
              candidate.dataEntryId === input.dataEntryId
                ? { ...input, variableName: candidate.variableName, sliceLabel: candidate.sliceLabel }
                : candidate,
```

```tsx
              candidate.dataEntryId === latest.dataEntryId
                ? { ...latest, variableName: candidate.variableName, sliceLabel: candidate.sliceLabel }
                : candidate,
```

```tsx
            candidate.dataEntryId === body.input!.dataEntryId
              ? { ...body.input!, variableName: candidate.variableName, sliceLabel: candidate.sliceLabel }
              : candidate,
```

- [ ] **Step 6: Full regression pass**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v ".next/types"
npx eslint components/data-entry/review-kpi-input-value.tsx components/data-entry/review-kpi-row.tsx test/integration/data-entry/review-kpi/slice-label-display.integration.test.tsx
npx vitest run test/integration/data-entry/review-kpi test/unit/data-entry/kpi-worker test/unit/data-entry/review-kpi
```

Expected: no tsc/eslint output; all tests pass (should be 87+ tests: the 82
from the prior session's fix + 5 new `slice-label.test.ts` unit tests + this
task's 1 integration test — the exact total isn't load-bearing, "no
failures" is).

- [ ] **Step 7: Commit**

```bash
git add components/data-entry/review-kpi-input-value.tsx components/data-entry/review-kpi-row.tsx test/integration/data-entry/review-kpi/slice-label-display.integration.test.tsx
git commit -m "feat(review-kpi): render dimension-slice label on Inputs cards"
```

---

## Out of scope (needs a product decision, not a code/data fix)

Found during the audit, deliberately **not** part of this plan:

- **10 active KPIs with no formula at all**: `Lifeline 60/120/180 kWh`,
  `100/200/500/1,000/5,000/10,000 kWh` (Financial tariff bands, ids
  127-135), and `Storage Efficiency` (Operational, id 108). `formula` and
  `formula_inputs` are both `null` — these are unconfigured shells, not
  broken bindings. Fixing them requires someone who knows what each tariff
  band's rate formula and Storage Efficiency's formula should actually be.
  `scripts/verify-kpi-formula-input-integrity.ts` (Task 4) reports these as
  `INFO`, not a failure, precisely so this list stays visible without
  blocking the rest of the fix.

## Self-Review

**Spec coverage:** every concrete finding from the audit has a task —
9 mis-pinned dimensions (Task 1+2), KPI 33's orphaned reference (Task 3),
a reusable regression check (Task 4), recompute so the fix is actually
visible (Task 5), and the root UX gap that made correct data look wrong
(Tasks 6-8). The one item with no task (the 10 unconfigured KPIs) is
explicitly called out as out-of-scope, not silently dropped.

**Placeholder scan:** every SQL statement targets a specific, pre-verified
row id; every script is complete, runnable code; no "TODO"/"handle this
later" text anywhere.

**Type consistency:** `computeSliceLabel`'s signature
(`(DimensionSliceInput, Map<number, string>) => string | null`) matches its
Task 6 test calls and its Task 7 call site exactly. `ReviewKpiInputValue.sliceLabel`
(Task 7) matches the field read in Task 8's component and test fixture.
`recomputeKpiNow`'s imported signature (Task 5) matches its actual
definition in `app/data-entry/kpi-worker/recompute.ts` (verified by reading
the file, not assumed).
