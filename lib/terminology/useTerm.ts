"use client";

import { resolveTerm, type ResolveOptions } from "./resolver";
import type { ConceptKey } from "./concepts";
import { useActiveSector } from "./sector-context";

// Client hook for sector-aware terminology (resolutions doc Q3, #11 condition 2).
// UI components read display terms through this (or the server-side `resolveTerm`)
// and NEVER hardcode strings — so the Phase-5b table swap is zero component churn.
//
// Threads the active sector from context (`useActiveSector`) into the resolver,
// so every client call site renders sector-correct labels WITHOUT changes. An
// explicit `options.sector` still wins (a component pinning a sector). In Phase
// 5a both resolve to electricity, so this is behaviour-neutral; when Phase 5b
// mounts a real <SectorProvider>, these call sites follow automatically.
export const useTerm = (
  concept: ConceptKey,
  options: ResolveOptions = {},
): string => {
  const activeSector = useActiveSector();
  return resolveTerm(concept, {
    ...options,
    sector: options.sector ?? activeSector,
  });
};
