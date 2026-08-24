/**
 * Relevance — the GENERATIVE half. Where verify.ts checks that what EXISTS is valid, this
 * derives what SHOULD exist from the catalogue + registry and diffs it, so it catches
 * MISSING shells (the way the calc-measure gap was found by hand) and over-application.
 *
 * Two reliable, deterministic classes are computed (the ones that don't need the full
 * per-dimension context model, which stays the extract's/future generator's job):
 *
 *  1. UTILITY-LEVEL measures (every scope dim not_applicable) — expected exactly once per
 *     utility-period they're effective for. A missing one is a real gap (this is what
 *     would have flagged Total Costs / Profit automatically).
 *
 *  2. GENERATION-BY-TECHNOLOGY (source = by_context) — expected for each of the utility's
 *     real (non-virtual) unit technologies, intersected with the measure's source
 *     applicability. Missing = a unit technology with no shell; extra = a technology shell
 *     for a technology the utility has no unit for (how the hydro/wind lube-oil over-
 *     application looked). Coverage-level (per measure×utility×technology), so unit
 *     per-period activity nuance doesn't create false positives.
 */
import { db } from "@/db/connection";
import { sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { Finding } from "./verify";

type Row = Record<string, unknown>;
const run = async (q: SQL): Promise<Row[]> =>
  (await db.execute(q)).rows as Row[];

/** Utility-level measures (no expanding dimension) expected once per utility-period they're
 * effective for, but with no shell. A missing one is a real gap. */
export async function missingUtilityLevelShells(): Promise<Finding> {
  const rows = await run(sql`
    WITH util_level AS (
      SELECT md.id, md.name, md.effective_from, md.is_calculated
      FROM measure_definitions md
      WHERE md.is_active AND NOT md.is_context_fed AND NOT md.is_system_generated
        AND NOT EXISTS (
          SELECT 1 FROM measure_dimension_scope s
          WHERE s.measure_id = md.id AND s.expansion_mode <> 'not_applicable')
        -- only measures present SOMEWHERE: a per-cell gap is a real defect, whereas a
        -- measure absent everywhere (tariff-excluded, not-yet-effective) is a whole-
        -- measure case the zero-shell accounting already explains — not a per-cell gap.
        AND EXISTS (SELECT 1 FROM data_entries d
                    WHERE d.measure_def_id = md.id AND d.is_deleted = false)
    ),
    periods AS (
      SELECT rp.id, rp.utility_id, rp.report_date
      FROM report_periods rp
      WHERE EXISTS (SELECT 1 FROM data_entries d
                    WHERE d.report_period_id = rp.id AND d.is_deleted = false)
    )
    SELECT ul.id AS measure, ul.name, ul.is_calculated,
           p.utility_id, p.id AS period_id, p.report_date::date AS report_date
    FROM util_level ul
    CROSS JOIN periods p
    WHERE (ul.effective_from IS NULL
           OR EXTRACT(year FROM p.report_date) >= EXTRACT(year FROM ul.effective_from))
      AND NOT EXISTS (
        SELECT 1 FROM data_entries de
        WHERE de.measure_def_id = ul.id AND de.report_period_id = p.id AND de.is_deleted = false)
    ORDER BY ul.id, p.utility_id`);
  return {
    check: "missing utility-level shells",
    severity: "error",
    ok: rows.length === 0,
    summary: "utility-level measures expected (effective) for a utility-period but with no shell",
    count: rows.length,
    rows,
  };
}

/** Generation-by-technology coverage: expected (utility's real unit technologies ∩ the
 * measure's source applicability) vs actual technology shells, per measure×utility. */
export async function generationCoverageDiff(): Promise<Finding> {
  const rows = await run(sql`
    WITH gen_measures AS (
      SELECT DISTINCT s.measure_id
      FROM measure_dimension_scope s
      JOIN measure_definitions md ON md.id = s.measure_id
      WHERE s.dimension = 'source' AND s.expansion_mode = 'by_context'
        AND md.is_active AND NOT md.is_context_fed
        -- pure per-unit generation only: exclude function-split measures (Hours carry
        -- technology only under the Generation function, not per unit) and measures
        -- captured at the All aggregate (require a real per-technology shell to exist)
        AND NOT EXISTS (
          SELECT 1 FROM measure_dimension_scope s2
          WHERE s2.measure_id = s.measure_id
            AND s2.dimension = 'utility_function' AND s2.expansion_mode = 'by_context')
        AND EXISTS (
          SELECT 1 FROM data_entries de
          JOIN managed_list_items t ON t.id = de.technology_id
          WHERE de.measure_def_id = s.measure_id AND de.is_deleted = false
            AND t.name NOT ILIKE 'All%')
    ),
    util_tech AS (
      SELECT u.utility_id, u.technology_id
      FROM units u
      WHERE u.is_virtual = false AND u.technology_id IS NOT NULL
        -- only utilities that are actually in the migrated dataset (have shells); a unit
        -- in the registry for a utility with no migrated periods is not a shell gap
        AND EXISTS (
          SELECT 1 FROM report_periods rp
          JOIN data_entries d ON d.report_period_id = rp.id
          WHERE rp.utility_id = u.utility_id AND d.is_deleted = false)
      GROUP BY 1, 2
    ),
    expected AS (
      SELECT gm.measure_id, ut.utility_id, ut.technology_id
      FROM gen_measures gm
      CROSS JOIN util_tech ut
      WHERE NOT EXISTS (
              SELECT 1 FROM measure_dimension_applicability a
              WHERE a.measure_id = gm.measure_id AND a.dimension = 'source')
         OR EXISTS (
              SELECT 1 FROM measure_dimension_applicability a
              WHERE a.measure_id = gm.measure_id AND a.dimension = 'source'
                AND a.member_id = ut.technology_id)
    ),
    actual AS (
      SELECT de.measure_def_id AS measure_id, rp.utility_id, de.technology_id
      FROM data_entries de
      JOIN report_periods rp ON rp.id = de.report_period_id
      WHERE de.is_deleted = false
        AND de.measure_def_id IN (SELECT measure_id FROM gen_measures)
        AND de.technology_id IS NOT NULL
      GROUP BY 1, 2, 3
    )
    SELECT 'missing' AS kind, e.measure_id AS measure, md.name,
           e.utility_id, e.technology_id, tech.name AS technology
    FROM expected e
    JOIN measure_definitions md ON md.id = e.measure_id
    LEFT JOIN managed_list_items tech ON tech.id = e.technology_id
    WHERE NOT EXISTS (
      SELECT 1 FROM actual a
      WHERE a.measure_id = e.measure_id AND a.utility_id = e.utility_id
        AND a.technology_id = e.technology_id)
    UNION ALL
    SELECT 'extra', a.measure_id, md.name, a.utility_id, a.technology_id, tech.name
    FROM actual a
    JOIN measure_definitions md ON md.id = a.measure_id
    LEFT JOIN managed_list_items tech ON tech.id = a.technology_id
    WHERE (tech.name IS NULL OR tech.name NOT ILIKE 'All%')
      AND NOT EXISTS (
        SELECT 1 FROM expected e
        WHERE e.measure_id = a.measure_id AND e.utility_id = a.utility_id
          AND e.technology_id = a.technology_id)
    ORDER BY kind, measure, utility_id`);
  return {
    check: "generation technology coverage",
    severity: "warn",
    ok: rows.length === 0,
    summary: "generation measures whose technology shells differ from the utility's real unit fleet (missing/extra)",
    count: rows.length,
    rows,
  };
}

export async function runGenerativeChecks(): Promise<Finding[]> {
  return Promise.all([missingUtilityLevelShells(), generationCoverageDiff()]);
}
