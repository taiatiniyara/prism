import { DEFAULT_SECTOR, type Sector } from "./sectors";
import { NEUTRAL_DEFAULTS, type ConceptKey } from "./concepts";
import { lookupTerm } from "./terminology.config";

export interface ResolveOptions {
  // Defaults to the active sector (electricity while it is the only live one).
  sector?: Sector;
  plural?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// The ONE terminology resolver (resolutions doc Q3, #11 condition 1).
//
// Pure + synchronous, so the SAME function serves server components, the client
// `useTerm()` hook, and (later) the Silver view-generation script — never two
// maps that can drift.
//
// Resolution chain (#11 condition 3):
//   (sector, concept) in the terminology map → code neutral default → raw key.
// The raw-key branch is unreachable while `ConceptKey` stays exhaustive; it is
// the last-resort guard so the UI can never render a blank or snake_case string.
// ─────────────────────────────────────────────────────────────────────────────
export const resolveTerm = (
  concept: ConceptKey,
  options: ResolveOptions = {},
): string => {
  const sector = options.sector ?? DEFAULT_SECTOR;
  const plural = options.plural ?? false;

  const mapped = lookupTerm(sector, concept);
  if (mapped) {
    return plural ? (mapped.labelPlural ?? mapped.label) : mapped.label;
  }

  const neutral = NEUTRAL_DEFAULTS[concept];
  if (neutral) {
    return plural ? neutral.labelPlural : neutral.label;
  }

  return concept;
};
