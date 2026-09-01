import { db } from "@/db/connection";
import { measureDefinitions } from "@/db/schema/dataEntry";
import { countryContext } from "@/db/schema/country";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { organisations } from "@/db/schema/utility";
import { managedListItems } from "@/db/schema/managedLists";
import { eq, isNotNull } from "drizzle-orm";

export type ResolvedContextRow = {
  report_period_id: number;
  country_id: number | null;
  utility_id: number | null;
  measure_def_id: number;
  measureName: string;
  // The country_context.source_date this carried-forward value came from. Lets
  // country-keyed routes (Islands, Land Area) pick the latest figure deterministically.
  source_date: Date;
  value: string | number | boolean | null;
  // 'not_available' when the BMO stated the figure is unavailable for that date
  // (value is then null); null otherwise. Answer-availability axis, mirrors data_entries.
  no_data_reason: "not_available" | null;
};

/**
 * Country-context read bridge (Option 2, 2026-08-23; source-date as-of 2026-09-01).
 *
 * National annual figures live in the country_context table (country × metric ×
 * source_date), written by the BMO. Power BI still consumes the utility ×
 * report-period fact shape, so this bridge EXPANDS country_context onto every
 * report period AT READ TIME — no per-utility duplication is stored. For each
 * (report period, metric) it carries forward the latest source_date at or
 * BEFORE that period's report_date (as-of rule: only figures known by the report
 * date are used; a figure with source_date equal to the report date applies too). `subgroupId` scopes which measure_definitions are the
 * country-context metrics (221 = "Country Context"); their names are the keys the
 * fact routes match on.
 */
export async function getResolvedContextRows(
  subgroupId: number,
): Promise<ResolvedContextRow[]> {
  const defs = await db
    .select({
      id: measureDefinitions.id,
      name: measureDefinitions.name,
      data_type_id: measureDefinitions.data_type_id,
    })
    .from(measureDefinitions)
    .where(eq(measureDefinitions.measures_subgroup_id, subgroupId));
  if (defs.length === 0) return [];
  const metricIds = new Set(defs.map((d) => d.id));

  const ctx = await db.select().from(countryContext);
  if (ctx.length === 0) return [];

  const rps = await db
    .select()
    .from(reportPeriods)
    .where(isNotNull(reportPeriods.status_id));

  const orgs = await db.select().from(organisations);
  const countryByUtil = new Map(orgs.map((o) => [o.id, o.country_id]));

  const items = await db.select().from(managedListItems);
  const typeNameById = new Map(items.map((i) => [i.id, i.name]));

  // Option-typed context measures (e.g. Fuel Pricing Regulation) store the chosen
  // managed_list_items id in country_context.value as text; resolve it to the option
  // label on read, mirroring how data_entries option values resolve. Non-option
  // measures pass their value through unchanged.
  const optionMeasureIds = new Set(
    defs
      .filter((d) => typeNameById.get(d.data_type_id) === "option")
      .map((d) => d.id),
  );
  const resolveValue = (measureDefId: number, value: string | null) => {
    if (value == null || !optionMeasureIds.has(measureDefId)) return value;
    const optId = Number(value);
    return Number.isInteger(optId) ? typeNameById.get(optId) ?? value : value;
  };

  // index country_context by (country_id, measure_def_id) -> source_date desc
  const byKey = new Map<
    string,
    { source_date: Date; value: string | null; no_data_reason: "not_available" | null }[]
  >();
  for (const r of ctx) {
    if (!metricIds.has(r.measure_def_id)) continue;
    const k = `${r.country_id}|${r.measure_def_id}`;
    const arr = byKey.get(k) ?? [];
    arr.push({
      source_date: r.source_date,
      value: r.value,
      no_data_reason: r.no_data_reason,
    });
    byKey.set(k, arr);
  }
  for (const arr of byKey.values())
    arr.sort((a, b) => b.source_date.getTime() - a.source_date.getTime());

  const out: ResolvedContextRow[] = [];
  for (const rp of rps) {
    const countryId = countryByUtil.get(rp.utility_id) ?? null;
    if (countryId == null) continue;
    for (const d of defs) {
      const arr = byKey.get(`${countryId}|${d.id}`);
      if (!arr) continue;
      // carry-forward: latest source_date at or before the report date
      const pick = arr.find((x) => x.source_date.getTime() <= rp.report_date.getTime());
      if (!pick) continue;
      out.push({
        report_period_id: rp.id,
        country_id: countryId,
        utility_id: rp.utility_id,
        measure_def_id: d.id,
        measureName: d.name,
        source_date: pick.source_date,
        value: pick.no_data_reason ? null : resolveValue(d.id, pick.value),
        no_data_reason: pick.no_data_reason,
      });
    }
  }
  return out;
}
