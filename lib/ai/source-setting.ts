import { db } from "@/db/connection";
import { appSettings } from "@/db/schema/appSettings";
import { eq } from "drizzle-orm";
import {
  AI_PRIMARY_SOURCE_KEY,
  DEFAULT_AI_PRIMARY_SOURCE,
  type AiPrimarySource,
} from "./source-setting-constants";

export {
  AI_PRIMARY_SOURCE_KEY,
  AI_SOURCE_LABELS,
  DEFAULT_AI_PRIMARY_SOURCE,
  secondaryOf,
  type AiPrimarySource,
} from "./source-setting-constants";

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
