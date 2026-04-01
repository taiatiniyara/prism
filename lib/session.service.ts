import { unstable_noStore as noStore } from "next/cache";
import { headers } from "next/headers";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/connection";
import { roles, user } from "@/db/schema/auth-schema";
import { auth } from "./auth";
import { organisations } from "@/db/schema/utility";
import { sidebarAccess } from "@/db/schema/rls";
import { getBlockedAccessState } from "@/lib/auth-status-guard";

export async function getSession() {
  // Opt-out of static caching so we always read fresh cookies per request
  noStore();

  const requestHeaders = await headers();
  const headerEntries = Array.from(requestHeaders.entries());

  let data = null;
  try {
    data = await auth.api.getSession({
      headers: new Headers(headerEntries),
    });
  } catch (err) {
    return null;
  }

  const session = data?.session || null;
  if (!session) {
    return null;
  }

  const [currentUser] = await db
    .select()
    .from(user)
    .where(eq(user.id, session.userId));

  if (!currentUser) {
    console.log("No current user found for session userId:", session.userId);
    return null;
  }

  const [role] = currentUser.role_id
    ? await db
        .select()
        .from(roles)
        .where(eq(roles.id, currentUser.role_id))
        .limit(1)
    : [null];

  if (currentUser.role_id && !role) {
    console.log("No role found for role ID:", currentUser.role_id);
    throw new Error("No role found for role ID: " + currentUser.role_id);
  }

  const sidebarList = await db
    .select()
    .from(sidebarAccess)
    .orderBy(asc(sidebarAccess.order));

  const [org] = currentUser.organisation_id
    ? await db
        .select()
        .from(organisations)
        .where(eq(organisations.id, currentUser.organisation_id))
        .limit(1)
    : [null];

  const blockedState = getBlockedAccessState(
    currentUser.status,
    currentUser.reject_reason,
  );

  return {
    session,
    user: currentUser,
    role: role ?? null,
    orgAcronym: org?.acronym,
    sidebarList: sidebarList
      .filter((item) => item.roles.split(",").includes(role!.name))
      .map((item) => {
        return {
          name: item.name,
          page: item.page,
        };
      }),
    fullName: currentUser.name,
    blockedState,
  };
}

export async function getUser() {
  const sessionData = await getSession();
  return sessionData?.user || null;
}
