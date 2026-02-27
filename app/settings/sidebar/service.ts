"use server";

import { db } from "@/db/connection";
import { sidebarAccess } from "@/db/schema/rls";

export async function getSidebarAccessList() {
  const sideBarList = await db.select().from(sidebarAccess);
  console.log(sideBarList);
  return sideBarList;
}
