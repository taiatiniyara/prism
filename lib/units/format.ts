/**
 * Unit-driven display formatting — the single source of truth (in TypeScript)
 * for turning a STORED measure/KPI value into what a human sees, given its unit.
 *
 * Convention (Eugene, 2026-09-25 — docs/percent-scale-cleanup.md):
 *   A percentage/proportion quantity is STORED as a natural fraction (0–1).
 *   The READ/DISPLAY layer multiplies by 100 when the unit is '%'. Nothing is
 *   baked into KPI formulas. The invariant this relies on:
 *
 *       unit === '%'   ⇒   stored value is a fraction (0–1)
 *
 * This module is the ONE place that ×100 happens in TS. Every TS read surface —
 * the webapp UI (data-entry/review/BSC/KPI cards), the AI data-service, and
 * exports — must format through here so no consumer re-derives scale and shows
 * "0.06%". Power BI cannot call TS; the gold read view mirrors this exact rule in
 * SQL (keep the two in sync — see docs/percent-scale-cleanup.md).
 *
 * DETECTION IS EXACT. Only the literal unit '%' is a proportion. Compound units
 * that merely *contain* '%' — 'Ratio', '% per unit GDP', '% per 1000 persons' —
 * are rates or ratios, NOT proportions, and are never scaled. (A substring
 * `includes('%')` test would wrongly ×100 them.)
 *
 * ACTIVATION: this formatter is correct only once the invariant holds uniformly
 * across the stored data (the Populations A/B cleanup in the same doc). Until
 * then it must not be wired into a live read path, or values still stored on a
 * 0–100 scale would render ×100 too large.
 */

/** The literal unit that denotes a proportion stored as a fraction (0–1). */
const PERCENT_UNIT = "%";
/** The unit whose value is shown exactly as stored (no scaling, no suffix). */
const RATIO_UNIT = "ratio";
/** Units that carry no dimension — value shown bare, no suffix. */
const UNITLESS_UNITS = new Set(["units n/a", "n/a", "none"]);

const norm = (unit: string | null | undefined): string => (unit ?? "").trim();

/** True only for the exact proportion unit '%' (never a compound '%…' unit). */
export const isPercentUnit = (unit: string | null | undefined): boolean =>
  norm(unit) === PERCENT_UNIT;

/** True for the 'Ratio' unit, which displays exactly as stored. */
export const isRatioUnit = (unit: string | null | undefined): boolean =>
  norm(unit).toLowerCase() === RATIO_UNIT;

/** True when the unit adds no dimension to the number (null/empty/'Units N/A'). */
export const isUnitlessUnit = (unit: string | null | undefined): boolean => {
  const u = norm(unit);
  return u === "" || UNITLESS_UNITS.has(u.toLowerCase());
};

/**
 * The value as it should be presented numerically: a '%' fraction becomes its
 * percentage number (0.06 → 6); everything else is unchanged. Charts, the gold
 * SQL mirror, and any consumer that needs the number (not the string) share this.
 * Returns null for a null/NaN input.
 */
export const toDisplayValue = (
  value: number | null | undefined,
  unit: string | null | undefined,
): number | null => {
  if (value == null || !Number.isFinite(value)) return null;
  return isPercentUnit(unit) ? value * 100 : value;
};

/** Round to at most `maxDecimals` places, dropping trailing zeros. */
const roundSmart = (n: number, maxDecimals: number): number => {
  const f = 10 ** maxDecimals;
  return Math.round(n * f) / f;
};

export interface FormatOptions {
  /** Force a fixed number of decimal places (default: smart, ≤2, zeros trimmed). */
  decimals?: number;
  /** String to return for a null/NaN value (default: null). */
  nullText?: string | null;
}

/**
 * Present a stored value with its unit as a display string.
 *
 *   formatByUnit(0.06,  '%')                 → "6%"
 *   formatByUnit(0.945, '%')                 → "94.5%"
 *   formatByUnit(0.94,  'Ratio')             → "0.94"
 *   formatByUnit(57.6,  'Minutes/Customer')  → "57.6 Minutes/Customer"
 *   formatByUnit(42,    'Units N/A')         → "42"
 *   formatByUnit(0.5,   '% per 1000 persons')→ "0.5 % per 1000 persons"  (NOT scaled)
 */
export const formatByUnit = (
  value: number | null | undefined,
  unit: string | null | undefined,
  opts: FormatOptions = {},
): string | null => {
  if (value == null || !Number.isFinite(value)) {
    return opts.nullText ?? null;
  }

  const scaled = toDisplayValue(value, unit) as number;
  const rounded =
    opts.decimals != null
      ? Number(scaled.toFixed(opts.decimals))
      : roundSmart(scaled, 2);
  const numText =
    opts.decimals != null ? rounded.toFixed(opts.decimals) : String(rounded);

  if (isPercentUnit(unit)) return `${numText}%`;
  if (isRatioUnit(unit) || isUnitlessUnit(unit)) return numText;
  return `${numText} ${norm(unit)}`;
};
