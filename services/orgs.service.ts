"use server";

import { db } from "@/db/connection";
import { organisations } from "@/db/schema/utility";

export async function AllOrganisations() {
  const list = await db.select().from(organisations);

  return list;
}
