"use server";

import { db } from "@/db/connection";
import { countries } from "@/db/schema/country";
import { Organisation, organisations } from "@/db/schema/utility";
import { generateRandomNumber } from "@/lib/utils";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function AllOrganisations(filters?: {
  utilitiesOnly?: boolean;
  activeOnly?: boolean;
  all?: boolean;
}) {
  const query = db
    .select()
    .from(organisations)
    .orderBy(organisations.name)
    .leftJoin(countries, eq(organisations.country_id, countries.id));

  if (filters?.utilitiesOnly) {
    query.where(
      and(
        eq(organisations.is_utility, true),
        eq(organisations.is_active, true),
      ),
    );
  }

  if (filters?.activeOnly || !filters?.all) {
    query.where(eq(organisations.is_active, true));
  }

  const list = await query;
  return list.map((item) => ({
    ...item.organisations,
    country: item.countries?.name,
  }));
}

export async function CreateOrganisation(data: Organisation) {
  const [org] = await db
    .insert(organisations)
    .values({
      ...data,
      id: generateRandomNumber(5),
      is_active: true,
      updated_date: null,
    })
    .returning();
  return {
    success: true,
    message: "Data created successfully",
    data: org,
  };
}

export async function GetOrganisationById(id: number) {
  const [org] = await db
    .select()
    .from(organisations)
    .where(eq(organisations.id, id));
  return org;
}

export async function UpdateOrganisation(data: Partial<Organisation>) {
  const [upd] = await db
    .update(organisations)
    .set(data)
    .where(eq(organisations.id, data.id!))
    .returning();

  revalidatePath("/settings/reporting");
  return {
    success: true,
    message: "Data updated successfully",
    data: upd,
  };
}
