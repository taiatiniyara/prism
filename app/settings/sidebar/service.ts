"use server";

import { db } from "@/db/connection";
import { NewSidebarAccess, sidebarAccess } from "@/db/schema/rls";
export async function getSidebarAccessList() {
  const sideBarList = await db.select().from(sidebarAccess);
  return sideBarList;
}

export async function addSidebarAccess(data: NewSidebarAccess) {
  const sideBarList = await db.insert(sidebarAccess).values(data);
  return sideBarList;
}
