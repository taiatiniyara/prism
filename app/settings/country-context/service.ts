"use server";

import { DataTableFormResponse } from "@/components/tables/data-table-create-form";
import { db } from "@/db/connection";
import { managedListItems } from "@/db/schema/managedLists";
import {
  countries,
  countryContext,
  CountryContextRow,
  NewCountryContextRow,
} from "@/db/schema/country";
import { eq, desc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/user.service";
import { revalidatePath } from "next/cache";

export async function GetCountryContext() {
  const query = db
    .select({
      id: countryContext.id,
      country_id: countryContext.country_id,
      country_name: countries.name,
      dl_def_id: countryContext.dl_def_id,
      dl_def_name: managedListItems.name,
      source_date: countryContext.source_date,
      source_doc: countryContext.source_doc,
      source_url: countryContext.source_url,
      value: countryContext.value,
      updated_by: countryContext.updated_by,
      updated_date: countryContext.updated_date,
    })
    .from(countryContext)
    .leftJoin(countries, eq(countryContext.country_id, countries.id))
    .leftJoin(managedListItems, eq(countryContext.dl_def_id, managedListItems.id))
    .orderBy(desc(countryContext.updated_date));

  const list = await query;
  return list;
}

export async function CreateCountryContextData(
  data: NewCountryContextRow,
): Promise<DataTableFormResponse<CountryContextRow>> {
  const user = await getCurrentUser();
  const [row] = await db
    .insert(countryContext)
    .values({
      ...data,
      updated_by: user.name,
      updated_date: new Date(),
    })
    .returning();

  revalidatePath("/settings/country-context");
  return {
    success: true,
    message: "Country context data created successfully",
    data: row,
  };
}

export async function DeleteCountryContext(
  id: number,
): Promise<DataTableFormResponse<CountryContextRow>> {
  await db.delete(countryContext).where(eq(countryContext.id, id));
  revalidatePath("/settings/country-context");
  return {
    success: true,
    message: "Country context data deleted successfully",
  };
}
