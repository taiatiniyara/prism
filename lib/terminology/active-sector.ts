import { cache } from "react";
import { cookies } from "next/headers";
import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db/connection";
import { sectors } from "@/db/schema/sector";
import { organisationSector } from "@/db/schema/sectorTerminology";
import { getSession } from "@/lib/session.service";
import { DEFAULT_SECTOR, type Sector } from "./sectors";
import {
  ACTIVE_SECTOR_COOKIE,
  parseSector,
  pickActiveSector,
} from "./active-sector.core";

// ─────────────────────────────────────────────────────────────────────────────
// Active-sector seam (server) — the SINGLE source of "which sector is active for
// this request", consumed by the terminology resolver so labels render for the
// right sector (ADR 0003 / resolutions doc Q3, #11 condition 2). Server-only:
// resolves per-request, so keep it out of client bundles (call it from server
// components / actions and pass the result down).
//
// PHASE 5B (#11 half, live): the effective organisation (the user's own org, or
// the DEV utility-context org — see lib/session.service.ts) is looked up in
// `organisation_sector`; the request's `prism_active_sector` cookie is honoured
// only within those memberships (precedence in active-sector.core.ts). Any
// failure — no request scope, no session, no org, empty memberships, DB error —
// resolves to DEFAULT_SECTOR, so this can never take a page down and is
// byte-for-byte behaviour-neutral while `organisation_sector` is empty.
//
// `cache()` dedupes within one request: the root layout mounts <SectorProvider>
// from this, and pages that thread it explicitly reuse the same result.
// ─────────────────────────────────────────────────────────────────────────────
export const getActiveSector = cache(async (): Promise<Sector> => {
  try {
    const session = await getSession();
    const orgId = session?.effectiveOrgId ?? null;
    if (!orgId) return DEFAULT_SECTOR;

    const rows = await db
      .select({ code: sectors.code })
      .from(organisationSector)
      .innerJoin(sectors, eq(organisationSector.sector_id, sectors.id))
      .where(
        and(
          eq(organisationSector.organisation_id, orgId),
          eq(sectors.is_active, true),
        ),
      )
      .orderBy(asc(sectors.sort_order), asc(sectors.id));

    const memberships = rows
      .map((r) => parseSector(r.code))
      .filter((s): s is Sector => s !== null);

    const cookieStore = await cookies();
    const requested = parseSector(cookieStore.get(ACTIVE_SECTOR_COOKIE)?.value);

    return pickActiveSector({ memberships, requested });
  } catch {
    return DEFAULT_SECTOR;
  }
});
