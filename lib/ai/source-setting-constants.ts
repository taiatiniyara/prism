/** Which data source the AI treats as primary. */
export type AiPrimarySource = "webapp" | "powerbi";
/** The secondary/fallback source, or "none" (use the primary ONLY — no fallback). */
export type AiSecondarySource = AiPrimarySource | "none";

export const AI_PRIMARY_SOURCE_KEY = "ai_primary_source";
export const AI_SECONDARY_SOURCE_KEY = "ai_secondary_source";
/** Default preserves the historical policy (Power BI primary) when unset. */
export const DEFAULT_AI_PRIMARY_SOURCE: AiPrimarySource = "powerbi";

export const AI_SOURCE_LABELS: Record<AiPrimarySource, string> = {
  webapp: "PRISM Web App",
  powerbi: "Power BI",
};

export const AI_SECONDARY_LABELS: Record<AiSecondarySource, string> = {
  webapp: "PRISM Web App",
  powerbi: "Power BI",
  none: "None (primary only)",
};

/** The default secondary when unset — the source not chosen as primary. */
export function secondaryOf(primary: AiPrimarySource): AiPrimarySource {
  return primary === "webapp" ? "powerbi" : "webapp";
}
