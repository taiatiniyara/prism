import { db } from "@/db/connection";
import { roles, user, type UserStatus } from "@/db/schema/auth-schema";
import { organisations } from "@/db/schema/utility";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import {
  DEV_UTILITY_CONTEXT_COOKIE,
  parseOrganisationContextId,
} from "@/lib/utility-context";

export interface CurrentUser {
  name: string;
  role: string;
  email: string;
  id: string;
  role_id: number | null;
  org_id: number | null;
  is_utility_context_scoped: boolean;
  status: UserStatus;
  reject_reason: string | null;
}

export const hasGlobalUtilityAccess = (user: {
  role: string | null | undefined;
  is_utility_context_scoped?: boolean;
}): boolean => {
  if (user.role === "BMO") {
    return true;
  }

  if (user.role === "DEV") {
    return !user.is_utility_context_scoped;
  }

  return false;
};

export const resolveUtilityScopeId = (user: {
  org_id: number | null;
  role: string | null | undefined;
  is_utility_context_scoped?: boolean;
}): number | null => {
  return hasGlobalUtilityAccess(user) ? null : user.org_id;
};

export const getCurrentUser = async (): Promise<CurrentUser> => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const [u] = await db
    .select()
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1);

  if (!u) {
    throw new Error("Unauthorized");
  }

  const [role] = await db
    .select()
    .from(roles)
    .where(eq(roles.id, u.role_id!))
    .limit(1);

  let scopedOrgId = u.organisation_id;
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
        scopedOrgId = scopedOrganisation.id;
        isUtilityContextScoped = true;
      } else {
        scopedOrgId = null;
      }
    } else {
      scopedOrgId = null;
    }
  }

  return {
    name: u.name,
    role: role?.name,
    email: u.email,
    id: u.id,
    role_id: u.role_id,
    org_id: scopedOrgId,
    is_utility_context_scoped: isUtilityContextScoped,
    status: u.status,
    reject_reason: u.reject_reason,
  };
};
