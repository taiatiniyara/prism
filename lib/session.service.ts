import { unstable_noStore as noStore } from "next/cache";
import { cookies, headers } from "next/headers";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/connection";
import { roles, user } from "@/db/schema/auth-schema";
import { auth } from "./auth";
import { organisations } from "@/db/schema/utility";
import { sidebarAccess } from "@/db/schema/rls";
import { getBlockedAccessState } from "@/lib/auth-status-guard";
import {
  DEV_UTILITY_CONTEXT_COOKIE,
  parseOrganisationContextId,
} from "@/lib/utility-context";

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
  } catch {
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
    throw new Error("No role found for role ID: " + currentUser.role_id);
  }

  const sidebarList = await db
    .select()
    .from(sidebarAccess)
    .orderBy(asc(sidebarAccess.order));

  let effectiveOrganisationId = currentUser.organisation_id;
  let isUtilityContextScoped = false;

  if (role?.name === "DEV") {
    const cookieStore = await cookies();
    const requestedContextId = parseOrganisationContextId(
      cookieStore.get(DEV_UTILITY_CONTEXT_COOKIE)?.value,
    );

    if (requestedContextId != null) {
      const [scopedOrganisation] = await db
        .select({ id: organisations.id })
        .from(organisations)
        .where(eq(organisations.id, requestedContextId))
        .limit(1);

      if (scopedOrganisation) {
        effectiveOrganisationId = scopedOrganisation.id;
        isUtilityContextScoped = true;
      } else {
        effectiveOrganisationId = null;
      }
    } else {
      effectiveOrganisationId = null;
    }
  }

  const [org] = effectiveOrganisationId
    ? await db
        .select()
        .from(organisations)
        .where(eq(organisations.id, effectiveOrganisationId))
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
    effectiveOrgId: effectiveOrganisationId,
    isUtilityContextScoped,
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
