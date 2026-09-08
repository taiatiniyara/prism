import { db } from "@/db/connection";
import { dataEntries, measureDefinitions } from "@/db/schema/dataEntry";
import {
  reportPeriods,
  publishedPeriodCondition,
} from "@/db/schema/reportPeriods";
import { managedLists, managedListItems } from "@/db/schema/managedLists";
import { eq, and, inArray } from "drizzle-orm";
import { authorizeApiKey } from "../service";
import { resolveEntryValue } from "@/lib/legacy/entry-value";
import { countries, organisations } from "@/db/schema";

const SUBGROUP_LIST_NAME = "Measures Subgroup";
const SUBGROUP_NAME = "Cost Breakdown";

export interface UtilityCostRow {
  ReportPeriodId: number;
  ReportPeriod: Date;
  ReportType: string | null;
  UtilityId: number;
  Currency: string | null;
  [measure: string]: unknown;
}

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false)
    return Response.json({ message: authorize.message }, { status: 401 });

  const subgroupListId = (
    await db
      .select({ id: managedLists.id })
      .from(managedLists)
      .where(eq(managedLists.name, SUBGROUP_LIST_NAME))
      .limit(1)
  )[0]?.id;

  const subgroupId = subgroupListId
    ? (
        await db
          .select({ id: managedListItems.id })
          .from(managedListItems)
          .where(
            and(
              eq(managedListItems.list_id, subgroupListId),
              eq(managedListItems.name, SUBGROUP_NAME),
            ),
          )
          .limit(1)
      )[0]?.id
    : undefined;

  if (subgroupId == null) return Response.json([]);

  const defs = await db
    .select()
    .from(measureDefinitions)
    .where(
      and(
        eq(measureDefinitions.is_active, true),
        eq(measureDefinitions.measures_subgroup_id, subgroupId),
      ),
    );
  const measureIds = defs.map((d) => d.id);
  const utilities = await db
    .select()
    .from(organisations)
    .leftJoin(countries, eq(organisations.country_id, countries.id));
  if (measureIds.length === 0) return Response.json([]);

  const entries = await db
    .select()
    .from(dataEntries)
    .where(
      and(
        inArray(dataEntries.measure_def_id, measureIds),
        eq(dataEntries.is_deleted, false),
      ),
    );
  const rps = await db
    .select()
    .from(reportPeriods)
    .where(publishedPeriodCondition);
  const allItems = await db
    .select()
    .from(managedListItems)
    .where(eq(managedListItems.is_active, true));
  const itemsById = new Map(allItems.map((i) => [i.id, i.name]));
  const dataTypeNameById = new Map(
    defs.map((d) => [d.id, itemsById.get(d.data_type_id) ?? null]),
  );

  const periodRows = new Map<number, UtilityCostRow>();
  for (const entry of entries) {
    const rp = rps.find((r) => r.id === entry.report_period_id);
    if (!rp) continue;
    const utility = utilities.find((u) => u.organisations.id === rp.utility_id);
    if (!utility) continue;
    const country = utility.countries ?? null;
    if (country === null) continue;
    const currency = itemsById.get(country!.currency_id) ?? null;
    const reportType = itemsById.get(rp.report_type_id) ?? null;
    // "Report Type" list today carries only "Financial Year" (490) and
    // "Monthly" (491) — legacy "Annual"/"Quarterly" are no longer assigned.
    if (reportType === "Monthly") continue;
    const def = defs.find((d) => d.id === entry.measure_def_id);
    if (!def) continue;
    const utilityFunction = itemsById.get(entry.utility_function_id) ?? null;
    const label =
      utilityFunction && utilityFunction !== "All"
        ? `${utilityFunction} ${def.name}`
        : def.name;
    const value = resolveEntryValue(
      entry,
      dataTypeNameById.get(def.id) ?? null,
      itemsById,
    );

    let row = periodRows.get(rp.id);
    if (!row) {
      row = {
        ReportPeriodId: rp.id,
        ReportPeriod: rp.report_date,
        ReportType: reportType,
        UtilityId: rp.utility_id,
        Currency: currency,
      };
      periodRows.set(rp.id, row);
    }
    row[label] = value;
  }

  return Response.json(Array.from(periodRows.values()));
}
