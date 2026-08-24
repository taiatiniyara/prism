import { db } from "@/db/connection";
import { measureDefinitions } from "@/db/schema/dataEntry";
import { countryContext } from "@/db/schema/country";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { organisations } from "@/db/schema/utility";
import { managedListItems } from "@/db/schema/managedLists";
import { fiscalYearForReportPeriod } from "@/lib/legacy/legacy-dl-resolver";
import { eq, isNotNull } from "drizzle-orm";

export type ResolvedContextRow = {
  report_period_id: number;
  country_id: number | null;
  utility_id: number | null;
  measure_def_id: number;
  measureName: string;
  // The country_context.period_year this carried-forward value came from. Lets
  // country-keyed routes (Islands, Land Area) pick the latest figure deterministically.
  period_year: number;
  value: string | number | boolean | null;
};

/**
 * Country-context read bridge (Option 2, 2026-08-23).
 *
 * National annual figures live in the country_context table (country × metric ×
 * period_year), written by the BMO. Power BI still consumes the utility ×
 * report-period fact shape, so this bridge EXPANDS country_context onto every
 * report period AT READ TIME — no per-utility duplication is stored. For each
 * (report period, metric) it carries forward the latest period_year <= that
 * period's fiscal year. `subgroupId` scopes which measure_definitions are the
 * country-context metrics (221 = "Country Context"); their names are the keys the
 * fact routes match on.
 */
export async function getResolvedContextRows(
  subgroupId: number,
): Promise<ResolvedContextRow[]> {
  const defs = await db
    .select({ id: measureDefinitions.id, name: measureDefinitions.name })
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
  const fyeByUtil = new Map(orgs.map((o) => [o.id, o.financial_year_end]));

  const items = await db.select().from(managedListItems);
  const typeNameById = new Map(items.map((i) => [i.id, i.name]));

  // index country_context by (country_id, measure_def_id) -> period_year desc
  const byKey = new Map<string, { period_year: number; value: string | null }[]>();
  for (const r of ctx) {
    if (!metricIds.has(r.measure_def_id)) continue;
    const k = `${r.country_id}|${r.measure_def_id}`;
    const arr = byKey.get(k) ?? [];
    arr.push({ period_year: r.period_year, value: r.value });
    byKey.set(k, arr);
  }
  for (const arr of byKey.values())
    arr.sort((a, b) => b.period_year - a.period_year);

  const out: ResolvedContextRow[] = [];
  for (const rp of rps) {
    const countryId = countryByUtil.get(rp.utility_id) ?? null;
    if (countryId == null) continue;
    const fy = fiscalYearForReportPeriod(
      rp.report_date,
      typeNameById.get(rp.report_type_id),
      fyeByUtil.get(rp.utility_id),
    );
    if (fy == null) continue;
    for (const d of defs) {
      const arr = byKey.get(`${countryId}|${d.id}`);
      if (!arr) continue;
      const pick = arr.find((x) => x.period_year <= fy); // carry-forward
      if (!pick) continue;
      out.push({
        report_period_id: rp.id,
        country_id: countryId,
        utility_id: rp.utility_id,
        measure_def_id: d.id,
        measureName: d.name,
        period_year: pick.period_year,
        value: pick.value,
      });
    }
  }
  return out;
}
