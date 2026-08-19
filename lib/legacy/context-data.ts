import { db } from "@/db/connection";
import { dataEntries, measureDefinitions } from "@/db/schema/dataEntry";
import { managedListItems } from "@/db/schema/managedLists";
import { eq, and, inArray } from "drizzle-orm";
import { resolveEntryValue } from "@/lib/legacy/entry-value";

export type ResolvedContextRow = {
  report_period_id: number;
  country_id: number | null;
  utility_id: number | null;
  measure_def_id: number;
  measureName: string;
  value: string | number | boolean | null;
};

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

  const measureIds = defs.map((d) => d.id);
  const items = await db.select().from(managedListItems);
  const itemsById = new Map(items.map((i) => [i.id, i.name]));
  const dataTypeNames = new Map<number, string | null>();
  for (const d of defs) {
    const dt = itemsById.get(d.data_type_id);
    dataTypeNames.set(d.id, dt ?? null);
  }

  const entries = await db
    .select()
    .from(dataEntries)
    .where(
      and(
        inArray(dataEntries.measure_def_id, measureIds),
        eq(dataEntries.is_deleted, false),
      ),
    );

  const measureNameById = new Map(defs.map((d) => [d.id, d.name]));

  return entries.map((e) => {
    const dataTypeName = dataTypeNames.get(e.measure_def_id) ?? null;
    const value = resolveEntryValue(e, dataTypeName, itemsById);

    return {
      report_period_id: e.report_period_id,
      country_id: e.country_id,
      utility_id: e.utility_id,
      measure_def_id: e.measure_def_id,
      measureName: measureNameById.get(e.measure_def_id) ?? "",
      value,
    };
  });
}
