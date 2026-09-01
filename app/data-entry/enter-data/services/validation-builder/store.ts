import { db } from "@/db/connection";
import { devValidationBuilderConfig } from "@/db/schema/devValidationBuilder";
import {
  defaultDevValidationBuilderConfig,
  sanitizeDevValidationBuilderConfig,
} from "@/app/data-entry/enter-data/services/validation-builder/shared";
import { DevValidationBuilderConfig } from "@/app/data-entry/enter-data/services/validation-builder/types";
import { eq } from "drizzle-orm";

const CONFIG_KEY = "default";

export const getDevValidationBuilderConfigFromDb =
  async (): Promise<DevValidationBuilderConfig> => {
    const [row] = await db
      .select({
        configJson: devValidationBuilderConfig.config_json,
      })
      .from(devValidationBuilderConfig)
      .where(eq(devValidationBuilderConfig.config_key, CONFIG_KEY))
      .limit(1);

    if (!row?.configJson) {
      return defaultDevValidationBuilderConfig;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(row.configJson);
    } catch {
      throw new Error(
        "Stored DEV validation builder config is invalid JSON and cannot be loaded.",
      );
    }

    return sanitizeDevValidationBuilderConfig(
      parsed as Partial<DevValidationBuilderConfig>,
    );
  };

export const saveDevValidationBuilderConfigToDb = async (
  config: DevValidationBuilderConfig,
  updatedById?: string,
) => {
  const payload = JSON.stringify(sanitizeDevValidationBuilderConfig(config));

  await db
    .insert(devValidationBuilderConfig)
    .values({
      config_key: CONFIG_KEY,
      config_json: payload,
      updated_by_id: updatedById ?? null,
      updated_at: new Date(),
    })
    .onConflictDoUpdate({
      target: devValidationBuilderConfig.config_key,
      set: {
        config_json: payload,
        updated_by_id: updatedById ?? null,
        updated_at: new Date(),
      },
    });
};

export const resetDevValidationBuilderConfigInDb = async (updatedById?: string) =>
  saveDevValidationBuilderConfigToDb(
    defaultDevValidationBuilderConfig,
    updatedById,
  );

export const clearDevValidationBuilderConfigInDb = async () => {
  await db
    .delete(devValidationBuilderConfig)
    .where(eq(devValidationBuilderConfig.config_key, CONFIG_KEY));
};
