export function formatLabel(input: string): string {
  return (
    input
      // Replace underscores with spaces
      .replace(/_/g, " ")
      // Remove standalone "id" words (case-insensitive)
      .replace(/\bid\b/gi, "")
      // Split into words, filter out empties
      .split(" ")
      .filter(Boolean)
      // Capitalize each word
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      // Join back with spaces
      .join(" ")
  );
}

export function createVariableName(str: string): string {
  // Convert to lowercase, replace spaces with underscores, and remove non-alphanumeric characters
  return str
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

// Unit names whose slug would be misleading as a variable suffix.
const UNIT_SUFFIX_OVERRIDES: Record<string, string> = {
  "%": "pct",
  "units n/a": "", // no unit -> no suffix (never "_na")
};

/**
 * Derives a measure's variable_name: slugified name + unit suffix.
 * Rules: Units N/A produces NO suffix; "%" becomes "pct"; the suffix is skipped
 * when the name already ends with it. Derived ONCE at measure creation and then
 * frozen — renames must not re-derive it (formulas reference the token).
 */
export function deriveMeasureVariableName(
  name: string,
  unitName?: string | null,
): string {
  const base = createVariableName(name);
  const unitKey = (unitName ?? "").trim().toLowerCase();
  if (!unitKey) return base;
  const suffix =
    UNIT_SUFFIX_OVERRIDES[unitKey] !== undefined
      ? UNIT_SUFFIX_OVERRIDES[unitKey]
      : createVariableName(unitKey);
  if (!suffix || base === suffix || base.endsWith(`_${suffix}`)) return base;
  return `${base}_${suffix}`;
}

export function formatReportPeriodDisplay(
  reportDate: Date,
  reportPeriodTypeName?: string | null,
): string {
  const monthLabel = [
    reportDate.getUTCFullYear(),
    String(reportDate.getUTCMonth() + 1).padStart(2, "0"),
  ].join("-");
  const yearLabel = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    timeZone: "UTC",
  }).format(reportDate);
  const normalizedType = (reportPeriodTypeName ?? "").trim().toLowerCase();

  if (normalizedType.includes("financial year")) {
    return yearLabel;
  }

  if (normalizedType.includes("month")) {
    return monthLabel;
  }

  return monthLabel;
}
