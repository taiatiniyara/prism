// Shared helpers for managed-list dropdowns (plain module — safe to import from
// both server actions and client components).

// True only for the aggregate "All …" sentinel item (e.g. "All Entity Types"),
// NOT for real items that merely contain the letters "all" — the old
// `name.includes("all")` substring test wrongly dropped "Small", "Allied",
// "Veritically Integrated", etc.
export const isAllSentinelName = (name: string): boolean => {
  const n = name.trim().toLowerCase();
  return n === "all" || n === "all options" || n.startsWith("all ");
};

// Managed-list dropdowns sort by id ascending — the id order is the intended
// logical order (e.g. Small < Medium < Large < Very Large), which alphabetical
// sorting destroys. The id column isn't shown, only used for ordering.
export const byIdAsc = <T extends { id: number | null }>(a: T, b: T): number =>
  (a.id ?? 0) - (b.id ?? 0);
