// Registered terminology concepts — the vocabulary whose display label varies by
// sector (ADR 0003). A typo in a `concept_key` is a COMPILE error here, never a
// silent fall-through to a raw key (resolutions doc Q3, #11 condition 5).
//
// Phase 5a ships one concept (`service_area`); later concepts (provider, source,
// units, utility_function …) are added here and get sector labels through the
// same resolver with zero call-site changes.
export const CONCEPTS = ["service_area"] as const;

export type ConceptKey = (typeof CONCEPTS)[number];

// Code-level NEUTRAL defaults — the guaranteed fallback so the UI never renders a
// blank or snake_case key, even against an empty terminology map (resolutions doc
// Q3, #11 condition 3). Sector-neutral wording (this is what a sector with no
// override sees). `labelPlural` is always provided here so plural resolution can
// never fall through to string-concatenation (#11 condition 4).
export const NEUTRAL_DEFAULTS: Record<
  ConceptKey,
  { label: string; labelPlural: string }
> = {
  service_area: { label: "Service Area", labelPlural: "Service Areas" },
};
