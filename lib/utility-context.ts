import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db/connection";
import { organisations } from "@/db/schema/utility";

export const DEV_UTILITY_CONTEXT_COOKIE = "prism_dev_utility_context_org_id";

export const DEV_UTILITY_CONTEXT_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export const parseOrganisationContextId = (
  rawValue: string | undefined,
): number | null => {
  if (!rawValue) {
    return null;
  }

  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
};

export const resolveDevOrganisationContext = async (
  devOrganisationId: number | null,
  roleName: string | null | undefined,
): Promise<{ effectiveOrganisationId: number | null; isUtilityContextScoped: boolean }> => {
  let effectiveOrganisationId = devOrganisationId;
  let isUtilityContextScoped = false;

  if (roleName === "DEV") {
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

  return { effectiveOrganisationId, isUtilityContextScoped };
};
