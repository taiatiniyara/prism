import { and, eq } from "drizzle-orm";

import { db } from "@/db/connection";
import { managedListItems, managedLists } from "@/db/schema/managedLists";

async function getAllMemberId(listName: string): Promise<number> {
  const [item] = await db
    .select({ id: managedListItems.id })
    .from(managedListItems)
    .innerJoin(managedLists, eq(managedListItems.list_id, managedLists.id))
    .where(
      and(eq(managedLists.name, listName), eq(managedListItems.name, "All")),
    )
    .limit(1);
  if (!item) throw new Error(`"All" member not found for list: ${listName}`);
  return item.id;
}

export interface DimensionDefaults {
  energySource: number;
  energyType: number;
  energyProvider: number;
  unitType: number;
  customerType: number;
  paymentMode: number;
  consumptionBand: number;
  division: number;
  gender: number;
  utilityFunction: number;
}

let cached: DimensionDefaults | null = null;

export async function getDimensionDefaults(): Promise<DimensionDefaults> {
  if (cached) return cached;

  const [
    energySource,
    energyType,
    energyProvider,
    unitType,
    customerType,
    paymentMode,
    consumptionBand,
    division,
    gender,
    utilityFunction,
  ] = await Promise.all([
    getAllMemberId("Technology"),
    getAllMemberId("Category"),
    getAllMemberId("Provider"),
    getAllMemberId("Asset Class"),
    getAllMemberId("Customer Type"),
    getAllMemberId("Payment Mode"),
    getAllMemberId("Consumption Band"),
    getAllMemberId("Division"),
    getAllMemberId("Gender"),
    getAllMemberId("Utility Function"),
  ]);

  cached = {
    energySource,
    energyType,
    energyProvider,
    unitType,
    customerType,
    paymentMode,
    consumptionBand,
    division,
    gender,
    utilityFunction,
  };

  return cached;
}
