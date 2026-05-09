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
