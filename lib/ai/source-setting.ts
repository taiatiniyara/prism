import { db } from "@/db/connection";
import { appSettings } from "@/db/schema/appSettings";
import { eq } from "drizzle-orm";

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

/**
 * Read the configured AI primary source. Defensive: if the app_settings table
 * doesn't exist yet (code live before the additive migration is applied) or the
 * value is unrecognised, fall back to the default so the AI keeps working.
 */
export async function getAiPrimarySource(): Promise<AiPrimarySource> {
  try {
    const [row] = await db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, AI_PRIMARY_SOURCE_KEY))
      .limit(1);
    if (row?.value === "webapp" || row?.value === "powerbi") return row.value;
    return DEFAULT_AI_PRIMARY_SOURCE;
  } catch {
    return DEFAULT_AI_PRIMARY_SOURCE;
  }
}

export async function setAiPrimarySource(
  primary: AiPrimarySource,
  updatedBy: string | null,
): Promise<void> {
  const now = new Date();
  await db
    .insert(appSettings)
    .values({ key: AI_PRIMARY_SOURCE_KEY, value: primary, updated_by: updatedBy, updated_at: now })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: primary, updated_by: updatedBy, updated_at: now },
    });
}
