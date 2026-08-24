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
        -- MANDATORY only: contextual measures (is_mandatory=false — e.g. 2IC Gender where
        -- the role may not exist, purchases where there's no IPP) can be legitimately
        -- absent, so their absence is never a gap. Per Eugene's classification 2026-08-25.
        AND md.is_mandatory
        -- utility grain (strata "Utility") specifically — service-area (strata 3) and
        -- unit (strata 1) measures are covered by their own classes below/above
        AND md.strata_id = (SELECT id FROM managed_list_items WHERE name = 'Utility'
                            AND list_id = (SELECT id FROM managed_lists WHERE name = 'Strata'))
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
      -- unit-grain measures (strata "Unit"), effective within the migrated window. Precise
      -- via strata_id (not a scope heuristic); the effective filter drops not-yet-effective
      -- ones (2026 solar irradiance / storage) whose absence is correct, not a gap.
      SELECT md.id AS measure_id
      FROM measure_definitions md
      WHERE md.strata_id = (SELECT id FROM managed_list_items WHERE name = 'Unit'
                            AND list_id = (SELECT id FROM managed_lists WHERE name = 'Strata'))
        AND md.is_active AND NOT md.is_context_fed
        AND (md.effective_from IS NULL OR EXTRACT(year FROM md.effective_from) <=
             (SELECT EXTRACT(year FROM max(rp.report_date))
              FROM report_periods rp JOIN data_entries d ON d.report_period_id = rp.id
              WHERE d.is_deleted = false))
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
      WHERE (
          NOT EXISTS (
            SELECT 1 FROM measure_dimension_applicability a
            WHERE a.measure_id = gm.measure_id AND a.dimension = 'source')
          OR EXISTS (
            SELECT 1 FROM measure_dimension_applicability a
            WHERE a.measure_id = gm.measure_id AND a.dimension = 'source'
              AND a.member_id = ut.technology_id)
        )
        -- consumable-INPUT measures (the "Fuel and Oil" subgroup: fuel oil, lube oil) are
        -- the IPP operator's cost, not the purchasing utility's — so they are NOT expected
        -- for a technology that is IPP-only for this utility. A utility benchmarks an IPP's
        -- OUTPUT (capacity/generation/downtime), never its inputs. Only expect a consumable
        -- when the utility owns a non-IPP unit of that technology.
        AND (
          gm.measure_id NOT IN (
            SELECT id FROM measure_definitions
            WHERE measures_subgroup_id =
              (SELECT id FROM managed_list_items WHERE name = 'Fuel and Oil' LIMIT 1))
          OR EXISTS (
            SELECT 1 FROM units u2
            WHERE u2.utility_id = ut.utility_id AND u2.technology_id = ut.technology_id
              AND u2.is_virtual = false
              AND u2.provider_id IS DISTINCT FROM
                  (SELECT id FROM managed_list_items WHERE name = 'IPP' LIMIT 1))
        )
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

/** Service-area-grain measures (strata ServiceArea) are collected once per active service
 * area. A measure present for a utility-period but missing a shell for a service area its
 * period-peers DO cover is a coverage gap. Uses the active-area set from the data (the
 * areas the utility actually reports that period), so it's robust to sentinel/registry
 * areas and per-measure area applicability. (Tariff measures are also service-area grain —
 * they'll flow through this class once the tariff migration lands.) */
export async function serviceAreaCoverage(): Promise<Finding> {
  const rows = await run(sql`
    WITH active AS (
      -- the service areas a utility actually reports for a period (any sa-measure shell)
      SELECT rp.utility_id, de.report_period_id, de.service_area_id
      FROM data_entries de
      JOIN report_periods rp ON rp.id = de.report_period_id
      WHERE de.service_area_id IS NOT NULL AND de.is_deleted = false
      GROUP BY 1, 2, 3
    ),
    present AS (
      -- (service-area measure, period) pairs where the measure is present that period
      SELECT de.measure_def_id, de.report_period_id
      FROM data_entries de
      WHERE de.service_area_id IS NOT NULL AND de.is_deleted = false
      GROUP BY 1, 2
    )
    SELECT p.measure_def_id AS measure, md.name,
           a.utility_id, a.report_period_id AS period_id,
           a.service_area_id, sa.name AS service_area
    FROM present p
    JOIN active a ON a.report_period_id = p.report_period_id
    JOIN measure_definitions md ON md.id = p.measure_def_id
    LEFT JOIN service_areas sa ON sa.id = a.service_area_id
    WHERE NOT EXISTS (
      SELECT 1 FROM data_entries de
      WHERE de.measure_def_id = p.measure_def_id
        AND de.report_period_id = a.report_period_id
        AND de.service_area_id = a.service_area_id
        AND de.is_deleted = false)
    ORDER BY measure, a.utility_id, a.service_area_id`);
  return {
    check: "service-area coverage",
    severity: "warn",
    ok: rows.length === 0,
    summary: "service-area measures missing a shell for an active service area their period-peers cover",
    count: rows.length,
    rows,
  };
}

/** Measure classification by grain × obligation — mandatory (required everywhere it's in
 * scope) vs contextual (relevant only where the context exists: a provider, active units,
 * a transmission network, a role that exists). Per Eugene's 2026-08-25 ruling. */
export async function measureClassification(): Promise<Row[]> {
  return run(sql`
    SELECT str.name AS grain,
      count(*) FILTER (WHERE md.is_mandatory)::int AS mandatory,
      count(*) FILTER (WHERE NOT md.is_mandatory)::int AS contextual
    FROM measure_definitions md
    JOIN managed_list_items str ON str.id = md.strata_id
    WHERE md.is_active AND NOT md.is_context_fed AND NOT md.is_system_generated
    GROUP BY 1, str.id ORDER BY str.id`);
}

export async function runGenerativeChecks(): Promise<Finding[]> {
  return Promise.all([
    missingUtilityLevelShells(),
    generationCoverageDiff(),
    serviceAreaCoverage(),
  ]);
}
