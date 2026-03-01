"use server";

import { db } from "@/db/connection";
import { countries } from "@/db/schema/country";
import { organisations } from "@/db/schema/utility";
import { and, eq } from "drizzle-orm";

export async function AllOrganisations(filters?: {
  utilitiesOnly?: boolean;
  activeOnly?: boolean;
  all?: boolean;
}) {
  let query = db
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
