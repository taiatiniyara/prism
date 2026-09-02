/** Which data source the AI treats as primary; the other is the secondary/fallback. */
export type AiPrimarySource = "webapp" | "powerbi";

export const AI_PRIMARY_SOURCE_KEY = "ai_primary_source";
/** Default preserves the historical policy (Power BI primary) when unset. */
export const DEFAULT_AI_PRIMARY_SOURCE: AiPrimarySource = "powerbi";

export const AI_SOURCE_LABELS: Record<AiPrimarySource, string> = {
  webapp: "PRISM Web App",
  powerbi: "Power BI",
};

export function secondaryOf(primary: AiPrimarySource): AiPrimarySource {
  return primary === "webapp" ? "powerbi" : "webapp";
}