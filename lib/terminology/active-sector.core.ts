import { DEFAULT_SECTOR, SECTORS, type Sector } from "./sectors";

// ─────────────────────────────────────────────────────────────────────────────
// Pure active-sector resolution (Phase 5b, #11). No Next/DB imports so it is
// unit-testable and safe to share with client code; `active-sector.ts` is the
// server seam that feeds it real inputs (session org → organisation_sector rows,
// plus the request's sector-filter cookie).
// ─────────────────────────────────────────────────────────────────────────────

// Cookie-scoped sector filter (cf. lib/utility-context.ts DEV org context). Set
// by the Phase-5c sector switch; honoured ONLY when the value is one of the
// org's sectors, so a stale/forged cookie can never surface labels for a sector
// the org isn't in.
export const ACTIVE_SECTOR_COOKIE = "prism_active_sector";

export const ACTIVE_SECTOR_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export const parseSector = (raw: string | undefined | null): Sector | null =>
  raw && (SECTORS as readonly string[]).includes(raw) ? (raw as Sector) : null;

// Precedence, given the org's sector memberships (ordered by sectors.sort_order):
//   1. the requested (cookie) sector, if the org is a member of it
//   2. the org's only sector, when it has exactly one
//   3. DEFAULT_SECTOR when the org is a member of it
//   4. the org's first sector
//   5. DEFAULT_SECTOR — no org / no memberships (every org today: the M:N table
//      is empty until #10/#13 populate it), so this stays behaviour-neutral.
export const pickActiveSector = ({
  memberships,
  requested,
}: {
  memberships: readonly Sector[];
  requested: Sector | null;
}): Sector => {
  if (requested && memberships.includes(requested)) return requested;
  if (memberships.length === 1) return memberships[0];
  if (memberships.includes(DEFAULT_SECTOR)) return DEFAULT_SECTOR;
  return memberships[0] ?? DEFAULT_SECTOR;
};
