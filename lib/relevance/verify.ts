/**
 * Relevance / shell verification — the committed, repeatable form of the 2026-08-25
 * migration shell audit. Read-only. Derives what the relevance catalogue SAYS should be
 * true and checks the actual data_entries shells against it, enforcing the invariants
 * agreed with #2/#3/#8 and Eugene.
 *
 * Two kinds of output:
 *   - INVARIANTS (findings) — rules that must always hold; any violation is a defect.
 *   - ACCOUNTING — the two-denominator split (utility obligation vs engine health) and
 *     the zero-shell reason breakdown, so every empty measure is explained, not guessed.
 *
 * The "who fills this" question is three booleans on measure_definitions:
 *   is_context_fed   → country_context table (the 16 subgroup-221 measures)
 *   is_system_generated → computed system value (e.g. Hours in Period)
 *   is_calculated    → the p2 calculator fills it
 *   (none of the above) → the UTILITY answers it — the only human-answerable subset.
 */
import { db } from "@/db/connection";
import { sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

export type Severity = "error" | "warn" | "info";
export type Finding = {
  check: string;
  severity: Severity;
  ok: boolean;
  summary: string;
  count: number;
  rows: Record<string, unknown>[];
};

type Row = Record<string, unknown>;
const run = async (q: SQL): Promise<Row[]> =>
  (await db.execute(q)).rows as Row[];

// data_entries column that carries each measure_dimension_scope dimension
const DIM_COLUMN: Record<string, string> = {
  provider: "provider_id",
  type: "category_id",
  source: "technology_id",
  resource_type: "asset_class_id",
  customer_type: "customer_type_id",
  payment_mode: "payment_mode_id",
  band: "consumption_band_id",
  division: "division_id",
  gender: "gender_id",
  utility_function: "utility_function_id",
};

// ── INVARIANTS ──────────────────────────────────────────────────────────────

/** A future effective_from AND is_active=false — the date fires but the measure stays
 * silently off. Never allowed (the effective/active clash). */
export async function checkEffectiveActiveClash(): Promise<Finding> {
  const rows = await run(sql`
    SELECT id, name, effective_from
    FROM measure_definitions
    WHERE effective_from > CURRENT_DATE AND is_active = false`);
  return {
    check: "effective_from×is_active clash",
    severity: "error",
    ok: rows.length === 0,
    summary: "a future effective_from together with is_active=false (scheduled but switched off)",
    count: rows.length,
    rows,
  };
}

/** is_context_fed must exactly equal "is a Country Context (subgroup 221) measure". */
export async function checkContextFedScope(): Promise<Finding> {
  const rows = await run(sql`
    SELECT id, name, is_context_fed, measures_subgroup_id
    FROM measure_definitions
    WHERE (is_context_fed = true) <> (measures_subgroup_id = 221)`);
  return {
    check: "is_context_fed ⇔ subgroup 221",
    severity: "error",
    ok: rows.length === 0,
    summary: "is_context_fed must be set on exactly the Country Context (221) measures",
    count: rows.length,
    rows,
  };
}

/** No non-deleted shells may exist for context-fed or inactive measures. (system_generated
 * is allowed to carry computed rows, so it is not gated here.) */
export async function checkExclusionGateShells(): Promise<Finding> {
  const rows = await run(sql`
    SELECT md.id, md.name, md.is_context_fed, md.is_active, count(*)::int AS shells
    FROM data_entries de
    JOIN measure_definitions md ON md.id = de.measure_def_id
    WHERE de.is_deleted = false AND (md.is_context_fed = true OR md.is_active = false)
    GROUP BY 1, 2, 3, 4`);
  return {
    check: "exclusion-gate shells",
    severity: "error",
    ok: rows.length === 0,
    summary: "shells exist for context-fed or inactive measures (must be none)",
    count: rows.length,
    rows,
  };
}

/** No shell may exist in a period earlier than its measure's effective_from.
 * (Calendar-year comparison — a fiscal-year-aware refinement is a TODO once the canonical
 * period dimension lands; calendar-year already surfaced the 291/292/302 conflicts.) */
export async function checkShellsBeforeEffective(): Promise<Finding> {
  const rows = await run(sql`
    SELECT de.measure_def_id AS id, md.name, md.effective_from,
           min(rp.report_date)::date AS earliest_shell, count(*)::int AS pre_shells
    FROM data_entries de
    JOIN measure_definitions md ON md.id = de.measure_def_id
    JOIN report_periods rp ON rp.id = de.report_period_id
    WHERE de.is_deleted = false AND md.effective_from IS NOT NULL
      AND EXTRACT(year FROM rp.report_date) < EXTRACT(year FROM md.effective_from)
    GROUP BY 1, 2, 3`);
  return {
    check: "shells before effective_from",
    severity: "error",
    ok: rows.length === 0,
    summary: "shells exist in a period before the measure's effective_from",
    count: rows.length,
    rows,
  };
}

/** Shells whose dimension member is outside the measure's applicability set, for the
 * dimensions that declare applicability. Surfaces out-of-catalogue members (e.g. a member
 * the extract expanded that the catalogue never declared). Warn: the All-member semantics
 * can produce benign hits, so this reports rather than hard-fails. */
export async function checkApplicabilityCompliance(): Promise<Finding> {
  const rows: Row[] = [];
  for (const [dim, col] of Object.entries(DIM_COLUMN)) {
    const c = sql.raw(`de.${col}`);
    const r = await run(sql`
      SELECT de.measure_def_id AS id, md.name, ${dim} AS dimension,
             ${c} AS member_id, mli.name AS member_name, count(*)::int AS shells
      FROM data_entries de
      JOIN measure_definitions md ON md.id = de.measure_def_id
      LEFT JOIN managed_list_items mli ON mli.id = ${c}
      WHERE de.is_deleted = false AND ${c} IS NOT NULL
        -- ignore the benign All-member aggregate rows (an un-sliced total is not an
        -- applicability breach); flag only genuine out-of-catalogue members
        AND (mli.name IS NULL OR mli.name NOT ILIKE 'All%')
        AND EXISTS (
          SELECT 1 FROM measure_dimension_applicability a
          WHERE a.measure_id = de.measure_def_id AND a.dimension = ${dim})
        AND NOT EXISTS (
          SELECT 1 FROM measure_dimension_applicability a
          WHERE a.measure_id = de.measure_def_id AND a.dimension = ${dim}
            AND a.member_id = ${c})
      GROUP BY 1, 2, 3, 4, 5`);
    rows.push(...r);
  }
  return {
    check: "applicability compliance",
    severity: "warn",
    ok: rows.length === 0,
    summary: "shells using a dimension member outside the measure's declared applicability",
    count: rows.length,
    rows,
  };
}

/** Every eligible zero-shell measure must have an explained reason — no UNEXPLAINED. */
export async function checkZeroShellAccounting(): Promise<Finding> {
  const rows = await run(sql`
    SELECT md.id, md.name,
      CASE
        WHEN md.is_active = false THEN 'inactive'
        WHEN EXTRACT(year FROM md.effective_from) >
             (SELECT EXTRACT(year FROM max(rp.report_date))
              FROM report_periods rp JOIN data_entries d ON d.report_period_id = rp.id
              WHERE d.is_deleted = false)
          THEN 'effective after migrated data window'
        WHEN md.is_calculated THEN 'calculated (should have empty shells)'
        WHEN sg.name ILIKE '%tariff%' THEN 'tariff (excluded from this migration)'
        ELSE 'UNEXPLAINED'
      END AS reason
    FROM measure_definitions md
    LEFT JOIN managed_list_items sg ON sg.id = md.measures_subgroup_id
    WHERE md.is_context_fed = false AND md.is_system_generated = false
      AND NOT EXISTS (
        SELECT 1 FROM data_entries de
        WHERE de.measure_def_id = md.id AND de.is_deleted = false)
    ORDER BY reason, md.id`);
  const unexplained = rows.filter((r) => r.reason === "UNEXPLAINED");
  return {
    check: "zero-shell measures accounted",
    severity: unexplained.length ? "error" : "info",
    ok: unexplained.length === 0,
    summary: `${rows.length} eligible measures have no shells; ${unexplained.length} UNEXPLAINED`,
    count: unexplained.length,
    rows,
  };
}

// ── ACCOUNTING ──────────────────────────────────────────────────────────────

/** The two denominators, never mixed (per #8): the utility-answerable bucket is the
 * PERFORMANCE denominator; calc / context / system buckets are ENGINE-HEALTH. */
export async function shellAccounting(): Promise<Row[]> {
  return run(sql`
    SELECT
      CASE
        WHEN md.is_context_fed THEN 'context-fed (engine)'
        WHEN md.is_system_generated THEN 'system-generated (engine)'
        WHEN md.is_calculated THEN 'calculated (engine)'
        ELSE 'utility-answerable (performance)'
      END AS bucket,
      count(*)::int AS shells,
      sum((de.value_numeric IS NOT NULL OR de.value_text IS NOT NULL
        OR de.value_boolean IS NOT NULL OR de.value_option_id IS NOT NULL)::int)::int AS filled,
      sum((de.no_data_reason IS NOT NULL)::int)::int AS no_data,
      sum((de.value_numeric IS NULL AND de.value_text IS NULL AND de.value_boolean IS NULL
        AND de.value_option_id IS NULL AND de.no_data_reason IS NULL)::int)::int AS empty
    FROM data_entries de
    JOIN measure_definitions md ON md.id = de.measure_def_id
    WHERE de.is_deleted = false
    GROUP BY 1 ORDER BY 1`);
}

/** Per utility × period: the utility-completeness metric — answered ÷ requested, where
 * "requested" is strictly the human-answerable subset (excludes calc / system / context). */
export async function utilityCompleteness(): Promise<Row[]> {
  return run(sql`
    SELECT rp.utility_id, o.name AS utility, rp.id AS period_id,
           rp.report_date::date AS report_date,
           count(*) FILTER (WHERE NOT md.is_calculated AND NOT md.is_system_generated
             AND NOT md.is_context_fed)::int AS requested,
           count(*) FILTER (WHERE NOT md.is_calculated AND NOT md.is_system_generated
             AND NOT md.is_context_fed AND (de.value_numeric IS NOT NULL
               OR de.value_text IS NOT NULL OR de.value_boolean IS NOT NULL
               OR de.value_option_id IS NOT NULL OR de.no_data_reason IS NOT NULL))::int AS answered
    FROM data_entries de
    JOIN measure_definitions md ON md.id = de.measure_def_id
    JOIN report_periods rp ON rp.id = de.report_period_id
    JOIN organisations o ON o.id = rp.utility_id
    WHERE de.is_deleted = false
    GROUP BY 1, 2, 3, 4 ORDER BY o.name, rp.report_date`);
}

// ── RUNNER ──────────────────────────────────────────────────────────────────

export async function runAllChecks(): Promise<{
  findings: Finding[];
  accounting: Row[];
  completeness: Row[];
  ok: boolean;
}> {
  const findings = await Promise.all([
    checkEffectiveActiveClash(),
    checkContextFedScope(),
    checkExclusionGateShells(),
    checkShellsBeforeEffective(),
    checkApplicabilityCompliance(),
    checkZeroShellAccounting(),
  ]);
  const accounting = await shellAccounting();
  const completeness = await utilityCompleteness();
  const ok = findings.every((f) => f.severity !== "error" || f.ok);
  return { findings, accounting, completeness, ok };
}
