import { db } from "@/db/connection";
import { measureDefinitions } from "@/db/schema/dataEntry";
import { managedListItems } from "@/db/schema/managedLists";
import { resolveValueColumn } from "@/lib/data-entry/value-router";
import { inArray } from "drizzle-orm";

export type EntryValueFields = {
  value: string | null;
  value_numeric: string | null;
  value_boolean: boolean | null;
  value_option_id: number | null;
  value_text: string | null;
};

export function resolveEntryValue(
  entry: EntryValueFields | undefined,
  dataTypeName: string | null,
  itemsById: Map<number, string>,
): string | number | boolean | null {
  if (!entry) return null;
  const column = resolveValueColumn(dataTypeName);
  switch (column) {
    case "value_numeric": {
      if (entry.value_numeric == null) return null;
      const n = Number(entry.value_numeric);
      return Number.isFinite(n) ? n : entry.value_numeric;
    }
    case "value_boolean":
      return entry.value_boolean;
    case "value_option_id":
      return entry.value_option_id != null
        ? itemsById.get(entry.value_option_id) ?? null
        : null;
    case "value_string":
      return entry.value_text;
    default:
      return entry.value;
  }
}

export async function getValueResolutionContext(measureIds: number[]) {
  const defs = await db
    .select({
      id: measureDefinitions.id,
      data_type_id: measureDefinitions.data_type_id,
    })
    .from(measureDefinitions)
    .where(inArray(measureDefinitions.id, measureIds));
  const items = await db
    .select({ id: managedListItems.id, name: managedListItems.name })
    .from(managedListItems);
  const itemsById = new Map(items.map((i) => [i.id, i.name]));
  const dataTypeNameById = new Map<number, string | null>();
  for (const d of defs) {
    dataTypeNameById.set(d.id, itemsById.get(d.data_type_id) ?? null);
  }
  return { dataTypeNameById, itemsById };
}
