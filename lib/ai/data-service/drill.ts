import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/connection";
import { measureDefinitions } from "@/db/schema/dataEntry";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { organisations } from "@/db/schema/utility";
import type { CurrentUser } from "@/lib/user.service";
import { hasGlobalUtilityAccess } from "@/lib/user.service";
import { resolveDimension, type DimensionField } from "@/lib/dimensions/dimension-map";
import { createToolMetadata, periodAccessPredicate } from "./common";
import { intArrayParam } from "./common";
import type { AiToolResult } from "../types";

// P1 MVP of the dimensional-drill tool (docs/ai-dimensional-drill-tool-spec.md):
// one numeric measure, one fiscal year, one optional breakdown dimension,
// own-utility scope, reading the FACT grain (data_entries) directly via the
// central dimension map. Gold-first source resolution, over_time and cross-
// utility auto-widen are P2. Access is delegated to periodAccessPredicate;
// dimensions resolve through resolveDimension (no hand-rolled dim→column map).

/**
 * Drill's additive summation over fact values — the SAME semantics as the SQL
 * `SUM(value_numeric)` the tool runs: non-numeric/blank values are ignored, and
 * an all-empty set sums to null (a gap), never 0. Exported so the lockstep
 * contract test (vs the calculator engine's rollup) drives drill's real
 * summation code rather than a re-mirror.
 */
export function sumDrillNumericValues(
  values: Array<string | number | null>,
): number | null {
  let sum = 0;
  let any = false;
  for (const v of values) {
    const n =
      typeof v === "number"
        ? v
        : v == null || String(v).trim() === ""
          ? NaN
          : Number(v);
    if (!Number.isNaN(n)) {
      sum += n;
      any = true;
    }
  }
  return any ? sum : null;
}

export interface DrillRow {
  member?: string;
  value: number | null;
  coverage: { entered: number; shells: number };
  // Per-generating-unit grain only (breakdown_by: "unit"): the unit's technology
  // (fuel), asset class, and — for a generation measure — its rated capacity in
  // the same FY, so capacity factor can be computed honestly.
  technology?: string | null;
  asset_class?: string | null;
  rated_capacity?: number | null;
}

export interface DrillMeasureData {
  measure: string | null;
  unit: string | null;
  is_additive: boolean;
  fiscal_year: number | null;
  breakdown_by: string | null;
  utility: string | null;
  source: "fact";
  rows: DrillRow[];
  total: number | null;
  notes: string[];
  recommended_chart: "bar-chart" | "leaderboard" | "table" | "none";
}

const empty = (
  notes: string[],
  error?: string,
): AiToolResult<DrillMeasureData> => ({
  data: {
    measure: null,
    unit: null,
    is_additive: true,
    fiscal_year: null,
    breakdown_by: null,
    utility: null,
    source: "fact",
    rows: [],
    total: null,
    notes,
    recommended_chart: "none",
  },
  metadata: createToolMetadata({ source: "data_entries" }),
  error,
});

export interface DrillMeasureOptions {
  measure: string;
  breakdown_by?: string[] | string | null;
  fiscal_year?: string | number | null;
  utility?: string | null;
}

/** Terms that request the per-generating-unit fact grain (not a canonical dim). */
const UNIT_GRAIN_TERMS = new Set([
  "unit", "units", "generator", "generators", "genset", "gensets",
  "generating unit", "generating units", "generating set", "generating sets",
  "plant unit", "plant units", "per unit", "per generator", "by unit", "by generator",
]);

/**
 * Rated capacity per unit for the FY, keyed by unit name. Capacity is a STOCK,
 * not additive across sub-periods, so this takes the latest period's value per
 * unit (DISTINCT ON report_date DESC) rather than summing. Best-effort: returns
 * an empty map if the Rated Capacity measure can't be resolved. Lets the caller
 * attach capacity → the model can compute capacity factor without guessing.
 */
async function ratedCapacityByUnit(
  periodIds: number[],
  utilityId: number | null,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const [cap] = await db
    .select({ id: measureDefinitions.id })
    .from(measureDefinitions)
    .where(and(eq(measureDefinitions.is_active, true), ilike(measureDefinitions.name, "rated capacity")))
    .limit(1);
  if (!cap) return out;
  const res = await db.execute(sql`
    SELECT DISTINCT ON (de.unit_id) u.name AS name, de.value_numeric::float8 AS cap
    FROM data_entries de
    JOIN units u ON u.id = de.unit_id
    JOIN report_periods rp ON rp.id = de.report_period_id
    WHERE de.measure_def_id = ${cap.id}
      AND de.report_period_id = ANY(${intArrayParam(periodIds)})
      AND de.value_numeric IS NOT NULL
      AND de.is_deleted = false AND de.is_relevant = true
      AND u.is_virtual = false
      ${utilityId != null ? sql`AND u.utility_id = ${utilityId}` : sql``}
    ORDER BY de.unit_id, rp.report_date DESC
  `);
  for (const r of res.rows as Array<{ name: string; cap: number | null }>) {
    if (r.cap != null) out.set(r.name, r.cap);
  }
  return out;
}

export const getMeasureDrill = async (
  user: CurrentUser,
  options: DrillMeasureOptions,
): Promise<AiToolResult<DrillMeasureData>> => {
  const notes: string[] = [];
  const term = (options.measure ?? "").trim();
  if (!term) return empty(notes, "No measure specified.");

  // 1. Resolve the measure (exact name first, then contains). Numeric only for P1.
  const defs = await db
    .select({
      id: measureDefinitions.id,
      name: measureDefinitions.name,
      is_additive: measureDefinitions.is_additive,
      unit: sql<string | null>`(
        SELECT mli.name FROM managed_list_items mli WHERE mli.id = ${measureDefinitions.unit_id} LIMIT 1
      )`,
    })
    .from(measureDefinitions)
    .where(
      and(
        eq(measureDefinitions.is_active, true),
        or(
          ilike(measureDefinitions.name, term),
          ilike(measureDefinitions.name, `%${term}%`),
          ilike(measureDefinitions.variable_name, `%${term}%`),
        ),
      ),
    )
    .limit(10);

  if (defs.length === 0) {
    return empty(notes, `No measure matches "${term}".`);
  }
  // Prefer an exact (case-insensitive) name match, else the shortest name.
  const exact = defs.find((d) => d.name.toLowerCase() === term.toLowerCase());
  const measure = exact ?? [...defs].sort((a, b) => a.name.length - b.name.length)[0];
  if (defs.length > 1 && !exact) {
    notes.push(
      `"${term}" matched ${defs.length} measures; used "${measure.name}". Others: ${defs
        .filter((d) => d.id !== measure.id)
        .map((d) => d.name)
        .slice(0, 4)
        .join(", ")}.`,
    );
  }
  const measureIds = [measure.id];

  // 2. Resolve the breakdown dimension (optional, single for P1).
  //    "unit"/"generator" is NOT one of the 10 canonical dimensions — it is the
  //    fact grain itself (a generating unit), reached by joining `units` on
  //    data_entries.unit_id. Intercept it before the dimension resolver.
  let dimField: DimensionField | null = null;
  let dimLabel: string | null = null;
  let unitGrain = false;
  const breakdownTerm = Array.isArray(options.breakdown_by)
    ? options.breakdown_by[0]
    : options.breakdown_by;
  if (Array.isArray(options.breakdown_by) && options.breakdown_by.length > 1) {
    notes.push(
      `Only one breakdown dimension is supported yet; used "${breakdownTerm}".`,
    );
  }
  if (breakdownTerm) {
    if (UNIT_GRAIN_TERMS.has(String(breakdownTerm).trim().toLowerCase())) {
      unitGrain = true;
      dimLabel = "Unit";
    } else {
      const dim = resolveDimension(String(breakdownTerm));
      if (!dim) {
        return empty(notes, `Unknown dimension "${breakdownTerm}".`);
      }
      dimField = dim.field;
      dimLabel = dim.label;
    }
  }

  // 3. Resolve utility scope (P1 = own utility, or a named one within access).
  let utilityId: number | null = null;
  let utilityLabel: string | null = null;
  if (options.utility?.trim()) {
    const u = options.utility.trim();
    const [org] = await db
      .select({ id: organisations.id, name: organisations.name, acronym: organisations.acronym })
      .from(organisations)
      .where(
        or(
          ilike(organisations.acronym, u),
          ilike(organisations.name, `%${u}%`),
        ),
      )
      .limit(1);
    if (!org) return empty(notes, `Utility "${u}" not found.`);
    // Own-utility scope (#10 Family A): drill_measure exposes RAW fact-grain
    // measures (data_entries value_numeric, sub-dimensional), which are NOT part
    // of the approved cross-utility benchmarking surface. A non-global caller may
    // therefore only name their OWN utility. Without this guard the period filter
    // below relies on periodAccessPredicate, whose FY-report-type allowance lets a
    // benchmark-access utility role read another utility's fact grain — a leak.
    if (!hasGlobalUtilityAccess(user) && org.id !== user.org_id) {
      return empty(notes, `Drill-down is scoped to your own utility; "${u}" isn't available to you.`);
    }
    utilityId = org.id;
    utilityLabel = org.acronym ?? org.name;
  } else if (user.org_id != null) {
    utilityId = user.org_id;
  } else if (!hasGlobalUtilityAccess(user)) {
    return empty(notes, "No utility in scope for your account.");
  } else {
    notes.push("No utility specified — showing all utilities you can access (FY periods).");
  }

  // 4. Resolve the period set: accessible periods (periodAccessPredicate) for the
  //    fiscal year, scoped to the utility. FY defaults to the latest available.
  const fyRaw = options.fiscal_year;
  let fy: number | null = null;
  if (fyRaw != null) {
    const m = String(fyRaw).match(/\d{4}/);
    if (m) fy = parseInt(m[0], 10);
  }
  const periodPreds: SQL[] = [];
  const access = periodAccessPredicate(user);
  if (access) periodPreds.push(access);
  if (utilityId != null) periodPreds.push(eq(reportPeriods.utility_id, utilityId));
  if (fy != null) {
    periodPreds.push(sql`EXTRACT(YEAR FROM ${reportPeriods.report_date}) = ${fy}`);
  }
  const periods = await db
    .select({ id: reportPeriods.id, year: sql<number>`EXTRACT(YEAR FROM ${reportPeriods.report_date})::int` })
    .from(reportPeriods)
    .where(periodPreds.length ? and(...periodPreds) : sql`TRUE`)
    .orderBy(desc(reportPeriods.report_date));

  if (periods.length === 0) {
    return empty(notes, fy ? `No accessible periods for FY${fy}.` : "No accessible periods.");
  }
  // If no FY requested, focus on the latest year present.
  if (fy == null) {
    fy = periods[0].year;
    notes.push(`No fiscal year given — used the latest available, FY${fy}.`);
  }
  const periodIds = periods.filter((p) => p.year === fy).map((p) => p.id);
  if (periodIds.length === 0) {
    return empty(notes, `No accessible periods for FY${fy}.`);
  }

  // 5. Aggregate at fact grain. SUM value_numeric; blanks are gaps (counted in
  //    coverage), never zero-filled. Only sum when the measure is additive.
  const additive = measure.is_additive;
  if (!additive) {
    notes.push(
      `"${measure.name}" is non-additive (a rate/ratio/average) — values are shown as entered; a summed total across grain or members is not meaningful and is omitted.`,
    );
  }

  const rows: DrillRow[] = [];
  let total: number | null = null;

  if (unitGrain) {
    // Per-generating-unit fact grain. On these rows data_entries.utility_id is
    // NULL — the utility comes via units.utility_id — so scope + exclude virtual
    // roll-ups here. (periodIds are already utility-scoped when a utility is set;
    // the u.utility_id filter is belt-and-suspenders + covers the global case.)
    const result = await db.execute(sql`
      SELECT u.name AS member,
             (SELECT mli.name FROM managed_list_items mli WHERE mli.id = u.technology_id) AS technology,
             (SELECT mli.name FROM managed_list_items mli WHERE mli.id = u.asset_class_id) AS asset_class,
             SUM(de.value_numeric)::float8 AS total,
             count(de.value_numeric)::int AS entered,
             count(*)::int AS shells
      FROM data_entries de
      JOIN units u ON u.id = de.unit_id
      WHERE de.measure_def_id = ANY(${intArrayParam(measureIds)})
        AND de.report_period_id = ANY(${intArrayParam(periodIds)})
        AND de.is_deleted = false
        AND de.is_relevant = true
        AND u.is_virtual = false
        ${utilityId != null ? sql`AND u.utility_id = ${utilityId}` : sql``}
      GROUP BY u.name, u.technology_id, u.asset_class_id
      ORDER BY total DESC NULLS LAST
    `);
    const uRows = result.rows as Array<{
      member: string; technology: string | null; asset_class: string | null;
      total: number | null; entered: number; shells: number;
    }>;
    if (uRows.length === 0) {
      notes.push(
        `"${measure.name}" is not recorded per generating unit. Per-unit ("by unit") data exists for: Electricity Generated, Equipment Planned/Unplanned Downtime Hours, Rated Capacity, Fuel Oil, Lubrication Oil.`,
      );
    }
    // Attach rated capacity for a generation measure so capacity factor is honest.
    const capByUnit = /generat/i.test(measure.name)
      ? await ratedCapacityByUnit(periodIds, utilityId)
      : null;
    for (const r of uRows) {
      rows.push({
        member: r.member,
        value: r.total, // note[] flags when the measure is non-additive
        coverage: { entered: r.entered, shells: r.shells },
        technology: r.technology,
        asset_class: r.asset_class,
        rated_capacity: capByUnit?.get(r.member) ?? null,
      });
    }
  } else if (dimField) {
    // dimField is a typed DimensionField literal from the central map (not user
    // text), so raw-interpolating the column name is safe.
    const col = sql.raw(`de.${dimField}`);
    const result = await db.execute(sql`
      SELECT mli.name AS member,
             SUM(de.value_numeric)::float8 AS total,
             count(de.value_numeric)::int AS entered,
             count(*)::int AS shells
      FROM data_entries de
      JOIN managed_list_items mli ON mli.id = ${col}
      WHERE de.measure_def_id = ANY(${intArrayParam(measureIds)})
        AND de.report_period_id = ANY(${intArrayParam(periodIds)})
        AND de.is_deleted = false
        AND de.is_relevant = true
      GROUP BY mli.name
      ORDER BY total DESC NULLS LAST
    `);
    for (const r of result.rows as Array<{ member: string; total: number | null; entered: number; shells: number }>) {
      rows.push({
        member: r.member,
        value: r.total, // note[] flags when the measure is non-additive
        coverage: { entered: r.entered, shells: r.shells },
      });
    }
  } else {
    const result = await db.execute(sql`
      SELECT SUM(de.value_numeric)::float8 AS total,
             count(de.value_numeric)::int AS entered,
             count(*)::int AS shells
      FROM data_entries de
      WHERE de.measure_def_id = ANY(${intArrayParam(measureIds)})
        AND de.report_period_id = ANY(${intArrayParam(periodIds)})
        AND de.is_deleted = false
        AND de.is_relevant = true
    `);
    const r = (result.rows[0] ?? { total: null, entered: 0, shells: 0 }) as {
      total: number | null;
      entered: number;
      shells: number;
    };
    rows.push({ value: r.total, coverage: { entered: r.entered, shells: r.shells } });
  }

  // Grand total (additive only, when broken down by a dimension OR by unit).
  const brokenDown = dimField != null || unitGrain;
  if (brokenDown && additive) {
    total = sumDrillNumericValues(rows.map((r) => r.value));
  } else if (!brokenDown) {
    total = additive ? rows[0]?.value ?? null : null;
  }

  const recommended_chart: DrillMeasureData["recommended_chart"] = brokenDown
    ? rows.length > 8
      ? "leaderboard"
      : "bar-chart"
    : "none";

  return {
    data: {
      measure: measure.name,
      unit: measure.unit,
      is_additive: additive,
      fiscal_year: fy,
      breakdown_by: dimLabel,
      utility: utilityLabel,
      source: "fact",
      rows,
      total,
      notes,
      recommended_chart,
    },
    metadata: createToolMetadata({
      freshness: new Date(),
      completeness_pct: (() => {
        const entered = rows.reduce((s, r) => s + r.coverage.entered, 0);
        const shells = rows.reduce((s, r) => s + r.coverage.shells, 0);
        return shells > 0 ? Math.round((entered / shells) * 100) : 0;
      })(),
      source: "data_entries",
    }),
  };
};
