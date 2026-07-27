import { db } from "@/db/connection";
import {
  roles,
  session as sessionTable,
  user,
  type UserStatus,
} from "@/db/schema/auth-schema";
import { auth } from "@/lib/auth";
import { resolveDevOrganisationContext } from "@/lib/utility-context";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";


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
  // Optional so synthetic/system CurrentUser literals (e.g. cron actors) need
  // not set it; getCurrentUser() always populates it from the DB. Consumers
  // treat a missing value as "not enrolled" (the safe default).
  two_factor_enabled?: boolean;
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

export const getCurrentUser = async (options?: {
  /**
   * Skip the admin MFA gate. Used ONLY by the /two-factor enrolment + challenge
   * pages, which must resolve the current user in order to let an admin complete
   * MFA. Every other caller (API routes, server components) leaves this off so
   * the gate applies.
   */
  skipMfaCheck?: boolean;
}): Promise<CurrentUser> => {
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

  // App-layer MFA gate for admins (BMO/DEV). proxy.ts enforces this for UI
  // navigations, but `/api/*` is outside the proxy matcher — so we enforce the
  // same requirement here, at the shared authentication choke point every
  // session-based API route and server component funnels through. An admin
  // whose session has not passed the TOTP challenge is treated as unauthorized,
  // which closes the direct-API-call bypass. The /two-factor pages pass
  // skipMfaCheck so an admin can actually reach the challenge.
  if (!options?.skipMfaCheck) {
    const roleName = role?.name;
    if (roleName === "DEV" || roleName === "BMO") {
      if (!u.twoFactorEnabled) {
        throw new Error("Unauthorized");
      }
      const [sess] = await db
        .select({ verifiedAt: sessionTable.twoFactorVerifiedAt })
        .from(sessionTable)
        .where(eq(sessionTable.id, session.session.id))
        .limit(1);
      if (!sess?.verifiedAt) {
        throw new Error("Unauthorized");
      }
    }
  }

  const { effectiveOrganisationId: scopedOrgId, isUtilityContextScoped } =
    await resolveDevOrganisationContext(u.organisation_id, role?.name);

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
    two_factor_enabled: u.twoFactorEnabled,
  };
};
