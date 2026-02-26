"use server";

import { db } from "@/db/connection";
import { organisations } from "@/db/schema/utility";
import { and, eq } from "drizzle-orm";

export async function AllOrganisations(filters?: { utilitiesOnly?: boolean }) {
  let query = db.select().from(organisations);

  if (filters?.utilitiesOnly) {
    query.where(
      and(
        eq(organisations.is_utility, true),
        eq(organisations.is_active, true),
      ),
    );
  }

  return query;
}
