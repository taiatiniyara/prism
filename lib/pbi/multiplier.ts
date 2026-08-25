/**
 * Unit-scale factors for data_entries.multiplier — the scale the reporter used
 * when stating the figure ("the numbers are in Thousands"). PRISM 2 stores the
 * as-entered number, so true LCU = stored value × factor.
 */
export const MULTIPLIER_FACTORS: Record<string, number> = {
  Ones: 1,
  Tens: 10,
  Hundreds: 100,
  Thousands: 1_000,
  Lakhs: 100_000,
  Millions: 1_000_000,
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
