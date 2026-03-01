"use server";

import { DataTableFormResponse } from "@/components/tables/data-table-create-form";
import { db } from "@/db/connection";
import {
  countries,
  Country,
  NewCountry,
  subRegions,
} from "@/db/schema/country";
import { eq } from "drizzle-orm";

export async function AllCountries() {
  const query = db
    .select()
    .from(countries)
    .orderBy(countries.name)
    .leftJoin(subRegions, eq(countries.sub_region_id, subRegions.id));
  const list = await query;
  return list.map((item) => ({
    ...item.countries,
    sub_region: item.sub_regions?.name,
  }));
}

export async function AllSubRegions() {
  const query = db.select().from(subRegions).orderBy(subRegions.name);
  const list = await query;
  return list;
}

export async function CreateCountry(
  data: NewCountry,
): Promise<DataTableFormResponse<Country>> {
  const [c] = await db.insert(countries).values(data).returning();
  return {
    success: true,
    message: "Country created successfully",
    data: c,
  };
}
