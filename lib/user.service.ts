import {
  type UserStatus,
} from "@/db/schema/auth-schema";
import { auth } from "@/lib/auth";
import { resolveDevOrganisationContext } from "@/lib/utility-context";
import { getCachedUserAndRole } from "@/lib/user-role-cache";
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

/**
 * PRISM AI / benchmarking access. The UI dev-context cookie
 * (`prism_dev_utility_context_org_id`) scopes a DEV/BMO admin's *web UI* to a
 * single utility for testing. That transient UI scope must not bleed into the
 * AI/benchmarking surface: `compareKpisAcrossUtilities`, `getKpiTargets` and
 * friends promise cross-utility data and the prompt claims all-utility access.
 * So in the AI surface benchmark-enabled roles are always treated as
 * cross-utility (Financial-Year scope is enforced downstream: any user may
 * reach every utility's approved Financial Year periods, and their own
 * utility's monthly reporting, but never another utility's Monthly datasets).
 *
 * Benchmark access is granted to platform roles (BMO/DEV) and every utility
 * role (BLO, CEO, EXE, MGR, DAOF, DAOH, DAOO) so that utilities can benchmark
 * their KPIs against any other utility. External stakeholders (EXT) stay
 * excluded — their data access is limited by design.
 */
export const hasBenchmarkAccess = (user: {
  role: string | null | undefined;
}): boolean => {
  const role = (user.role ?? "").toUpperCase();
  return (
    role === "BMO" ||
    role === "DEV" ||
    "BLO" === role ||
    "CEO" === role ||
    "EXE" === role ||
    "MGR" === role ||
    "DAOF" === role ||
    "DAOH" === role ||
    "DAOO" === role
  );
};

export const resolveUtilityScopeId = (user: {
  org_id: number | null;
  role: string | null | undefined;
  is_utility_context_scoped?: boolean;
}): number | null => {
  return hasGlobalUtilityAccess(user) ? null : user.org_id;
};

// Narrows a nullable org_id to number, throwing instead of the silent
// `user.org_id!` non-null assertion a org-scoped write path would otherwise
// use — a global-access user (DEV/BMO) reaching one of these paths has
// org_id === null, and the assertion would write `utility_id: null` rather
// than fail loudly.
export const requireOrgId = (user: { org_id: number | null }): number => {
  if (user.org_id == null) {
    throw new Error(
      "Expected an organisation-scoped user, but org_id is null",
    );
  }
  return user.org_id;
};

export const getCurrentUser = async (): Promise<CurrentUser> => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const cached = await getCachedUserAndRole(session.user.id);
  if (!cached) {
    throw new Error("Unauthorized");
  }
  const { user: u, roleName } = cached;

  const { effectiveOrganisationId: scopedOrgId, isUtilityContextScoped } =
    await resolveDevOrganisationContext(u.organisation_id, roleName);

  return {
    name: u.name,
    // CurrentUser.role is typed as a required `string`, but a user with no
    // role assigned yields `roleName === null` here — same pre-existing gap
    // as the prior `role?.name` (typed `string` despite being `undefined`
    // at runtime when role_id was null). Preserved as-is, not introduced.
    role: roleName as string,
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
