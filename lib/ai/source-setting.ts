import { db } from "@/db/connection";
import { appSettings } from "@/db/schema/appSettings";
import { eq } from "drizzle-orm";
import {
  AI_PRIMARY_SOURCE_KEY,
  AI_SECONDARY_SOURCE_KEY,
  DEFAULT_AI_PRIMARY_SOURCE,
  secondaryOf,
  type AiPrimarySource,
  type AiSecondarySource,
} from "./source-setting-constants";

export {
  AI_PRIMARY_SOURCE_KEY,
  AI_SECONDARY_SOURCE_KEY,
  AI_SOURCE_LABELS,
  AI_SECONDARY_LABELS,
  DEFAULT_AI_PRIMARY_SOURCE,
  secondaryOf,
  type AiPrimarySource,
  type AiSecondarySource,
} from "./source-setting-constants";

export interface AiSourceConfig {
  primary: AiPrimarySource;
  secondary: AiSecondarySource;
}

async function readSetting(key: string): Promise<string | undefined> {
  const [row] = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .limit(1);
  return row?.value;
}

/**
 * Read the configured AI primary source. Defensive: if the app_settings table
 * doesn't exist yet or the value is unrecognised, fall back to the default so
 * the AI keeps working.
 */
export async function getAiPrimarySource(): Promise<AiPrimarySource> {
  try {
    const value = await readSetting(AI_PRIMARY_SOURCE_KEY);
    if (value === "webapp" || value === "powerbi") return value;
    return DEFAULT_AI_PRIMARY_SOURCE;
  } catch {
    return DEFAULT_AI_PRIMARY_SOURCE;
  }
}

/**
 * Read the configured secondary source for a given primary. "none" means the
 * primary is used in isolation (no fallback). When unset, defaults to the source
 * not chosen as primary (backward compatible). A stored value equal to the
 * primary is invalid and coerced to "none".
 */
export async function getAiSecondarySource(
  primary: AiPrimarySource,
): Promise<AiSecondarySource> {
  try {
    const value = await readSetting(AI_SECONDARY_SOURCE_KEY);
    if (value === "none") return "none";
    if (value === "webapp" || value === "powerbi") {
      return value === primary ? "none" : value;
    }
    return secondaryOf(primary); // unset → the other source
  } catch {
    return secondaryOf(primary);
  }
}

export async function getAiSourceConfig(): Promise<AiSourceConfig> {
  const primary = await getAiPrimarySource();
  const secondary = await getAiSecondarySource(primary);
  return { primary, secondary };
}

async function upsertSetting(
  key: string,
  value: string,
  updatedBy: string | null,
): Promise<void> {
  const now = new Date();
  await db
    .insert(appSettings)
    .values({ key, value, updated_by: updatedBy, updated_at: now })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updated_by: updatedBy, updated_at: now },
    });
}

export async function setAiSourceConfig(
  config: AiSourceConfig,
  updatedBy: string | null,
): Promise<void> {
  await upsertSetting(AI_PRIMARY_SOURCE_KEY, config.primary, updatedBy);
  await upsertSetting(AI_SECONDARY_SOURCE_KEY, config.secondary, updatedBy);
}
