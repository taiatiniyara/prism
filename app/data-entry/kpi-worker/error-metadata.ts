/**
 * Pull the useful Postgres fields (SQLSTATE code, constraint, table, column…)
 * out of an error or its `cause`, for structured logging of DB failures.
 */
export const extractErrorMetadata = (error: unknown) => {
  const baseError =
    typeof error === "object" && error !== null
      ? (error as Record<string, unknown>)
      : null;
  const cause =
    baseError && typeof baseError.cause === "object" && baseError.cause !== null
      ? (baseError.cause as Record<string, unknown>)
      : null;

  const pick = (key: string): string | null => {
    const fromBase = baseError?.[key];
    if (typeof fromBase === "string" && fromBase.length > 0) {
      return fromBase;
    }

    const fromCause = cause?.[key];
    if (typeof fromCause === "string" && fromCause.length > 0) {
      return fromCause;
    }

    return null;
  };

  return {
    code: pick("code"),
    detail: pick("detail"),
    constraint: pick("constraint"),
    table: pick("table"),
    column: pick("column"),
    schema: pick("schema"),
  };
};
