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

export interface DrillRow {
  member?: string;
  value: number | null;
  coverage: { entered: number; shells: number };
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
  let dimField: DimensionField | null = null;
  let dimLabel: string | null = null;
  const breakdownTerm = Array.isArray(options.breakdown_by)
    ? options.breakdown_by[0]
    : options.breakdown_by;
  if (Array.isArray(options.breakdown_by) && options.breakdown_by.length > 1) {
    notes.push(
      `Only one breakdown dimension is supported yet; used "${breakdownTerm}".`,
    );
  }
  if (breakdownTerm) {
    const dim = resolveDimension(String(breakdownTerm));
    if (!dim) {
      return empty(notes, `Unknown dimension "${breakdownTerm}".`);
    }
    dimField = dim.field;
    dimLabel = dim.label;
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

  if (dimField) {
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

  // Grand total (additive only, when broken down).
  if (dimField && additive) {
    total = rows.reduce((s, r) => s + (r.value ?? 0), 0);
  } else if (!dimField) {
    total = additive ? rows[0]?.value ?? null : null;
  }

  const recommended_chart: DrillMeasureData["recommended_chart"] = dimField
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
