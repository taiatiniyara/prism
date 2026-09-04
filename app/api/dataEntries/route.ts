import { db } from "@/db/connection";
import { assertMigrationKey } from "../migration/prism-training/_lib";
import { dataEntries, measureDefinitions } from "@/db/schema/dataEntry";
import { units } from "@/db/schema/utility";
import { managedListItems } from "@/db/schema/managedLists";

// Power BI column labels (measure name -> semantic-model column name).
const GENERATOR_COLUMN_LABELS: Record<string, string> = {
  "Electricity Generated": "GEN Electricity Generated",
  "Rated Capacity": "GEN Installed Capacity",
  "Equipment Planned Downtime Hours": "GEN Downtime Planned Hours",
  "Equipment Unplanned Downtime Hours": "GEN Downtime Unplanned Hours",
  "Lubrication Oil": "Oil for Lubrication",
};

// "Fuel Oil" is split by technology in the semantic model.
const FUEL_OIL_LABEL_BY_TECHNOLOGY: Record<string, string> = {
  Diesel: "Fuel Oil for Diesel Generators",
  "Heavy Fuel": "Fuel Oil for Heavy Fuel Generators",
};

export async function GET(req: Request) {
  assertMigrationKey(req);
  const list = await db.select().from(dataEntries);

  const measures = await db
    .select({ id: measureDefinitions.id, name: measureDefinitions.name })
    .from(measureDefinitions);
  const measureName = new Map(measures.map((m) => [m.id, m.name]));

  const items = await db
    .select({ id: managedListItems.id, name: managedListItems.name })
    .from(managedListItems);
  const itemName = new Map(items.map((i) => [i.id, i.name]));

  const allUnits = await db.select().from(units);
  const techByUnit = new Map(
    allUnits
      .filter((u) => u.technology_id != null)
      .map((u) => [u.id, itemName.get(u.technology_id!) ?? null]),
  );

  const labelFor = (row: (typeof list)[number]): string | null => {
    const name = measureName.get(row.measure_def_id);
    if (!name) return null;
    if (name === "Fuel Oil") {
      const tech = row.unit_id != null ? techByUnit.get(row.unit_id) : undefined;
      return FUEL_OIL_LABEL_BY_TECHNOLOGY[tech ?? ""] ?? name;
    }
    return GENERATOR_COLUMN_LABELS[name] ?? name;
  };

  return Response.json(list.map((r) => ({ ...r, label: labelFor(r) })));
}