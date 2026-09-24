/**
 * Unit-scale factors for data_entries.multiplier — the scale the reporter used
 * when stating the figure ("the numbers are in Thousands"). PRISM 2 stores the
 * as-entered number, so true LCU = stored value × factor.
 *
 * Domain (Eugene, 2026-09-25): the ONLY valid labels are Ones, Thousands,
 * Millions, Billions — nothing else.
 */
export const MULTIPLIER_FACTORS: Record<string, number> = {
  Ones: 1,
  Thousands: 1_000,
  Millions: 1_000_000,
  Billions: 1_000_000_000,
};

export function multiplierFactor(multiplier: string | null | undefined): number {
  if (!multiplier) return 1;
  return MULTIPLIER_FACTORS[multiplier] ?? 1;
}

/** Single Multiplier label for a flattened row: the uniform value, else Mixed. */
export function rollUpMultiplier(
  multipliers: Iterable<string | null | undefined>,
): string {
  const distinct = new Set(
    [...multipliers].filter((m): m is string => m != null && m !== ""),
  );
  if (distinct.size === 1) return [...distinct][0];
  if (distinct.size === 0) return "Ones";
  return "Mixed";
}
