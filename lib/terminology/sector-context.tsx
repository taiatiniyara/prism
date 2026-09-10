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
// PHASE 5B (live): the root layout (app/layout.tsx, SessionShell) mounts
// <SectorProvider sector={await getActiveSector()}> around the whole signed-in
// tree, so every client `useTerm()` call site follows the request's active
// sector with zero changes. The default below still covers trees rendered
// outside that shell (and tests).
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
