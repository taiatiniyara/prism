"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_SECTOR, type Sector } from "./sectors";

// ─────────────────────────────────────────────────────────────────────────────
// Client-side active-sector context (resolutions doc Q3, #11 condition 2).
// `useTerm()` reads this internally so client components render sector-correct
// labels with ZERO call-site changes.
//
// Defaults to DEFAULT_SECTOR when NO provider is mounted, so all existing usage
// is safe today without wrapping any tree — electricity is the only live sector.
//
// PHASE 5B: mount <SectorProvider sector={await getActiveSector()}> at the
// subtree that owns the sector filter (seed the value from the server seam in a
// server component, pass it into this client provider). The mount point is
// deliberately NOT chosen now — it depends on where the Phase-5b sector filter
// lives; until then the default is correct and no provider is required.
// ─────────────────────────────────────────────────────────────────────────────
const SectorContext = createContext<Sector>(DEFAULT_SECTOR);

export const SectorProvider = ({
  sector,
  children,
}: {
  sector: Sector;
  children: ReactNode;
}) => (
  <SectorContext.Provider value={sector}>{children}</SectorContext.Provider>
);

export const useActiveSector = (): Sector => useContext(SectorContext);
