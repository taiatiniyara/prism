"use server";

import { DataTableFormResponse } from "@/components/tables/data-table-create-form";
import { db } from "@/db/connection";
import { measureDefinitions } from "@/db/schema/dataEntry";
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
      measure_def_id: countryContext.measure_def_id,
      measure_def_name: measureDefinitions.name,
      period_year: countryContext.period_year,
      source_date: countryContext.source_date,
      source_doc: countryContext.source_doc,
      source_url: countryContext.source_url,
      value: countryContext.value,
      updated_by: countryContext.updated_by,
      updated_date: countryContext.updated_date,
    })
    .from(countryContext)
    .leftJoin(countries, eq(countryContext.country_id, countries.id))
    .leftJoin(
      measureDefinitions,
      eq(countryContext.measure_def_id, measureDefinitions.id),
    )
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
