import { DEFAULT_SECTOR, type Sector } from "./sectors";

// ─────────────────────────────────────────────────────────────────────────────
// Active-sector seam (server) — the SINGLE source of "which sector is active for
// this request", consumed by the terminology resolver so labels render for the
// right sector (ADR 0003 / resolutions doc Q3, #11 condition 2). Server-only:
// resolves per-request, so keep it out of client bundles (call it from server
// components / actions and pass the result down).
//
// PHASE 5A (now): electricity is the only live sector, so this returns
// DEFAULT_SECTOR. That is byte-for-byte what the resolver already defaults to,
// so threading call sites through this today is behaviour-neutral — the point is
// to move the churn to now so Phase 5b is a one-function flip.
//
// PHASE 5B (when #2 lands `sector_terminology` + `organisation_sector` + the
// sector filter context): replace ONLY the body below to read the active sector
// from the filter context (cookie-scope, cf. lib/utility-context.ts) and/or the
// user's `organisation_sector` rows. Keep the `Promise<Sector>` signature so
// every call site already threaded here stays untouched.
// ─────────────────────────────────────────────────────────────────────────────
export const getActiveSector = async (): Promise<Sector> => {
  // TODO(phase-5b): resolve from the sector filter context / organisation_sector
  // instead of the static default. Until then electricity is the only live
  // sector, so the default is correct.
  return DEFAULT_SECTOR;
};
