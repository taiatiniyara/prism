"use server";

import { db } from "@/db/connection";
import { roles } from "@/db/schema/auth-schema";

export async function AllRoles() {
  const list = await db.select().from(roles);
  return list;
}
