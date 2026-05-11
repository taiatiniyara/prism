"use server";

import { getCurrentUser } from "@/lib/user.service";
import { revalidatePath } from "next/cache";
import {
  defaultDevValidationBuilderConfig,
  sanitizeDevValidationBuilderConfig,
} from "@/app/data-entry/enter-data/services/validation-builder/shared";
import {
  clearDevValidationBuilderConfigInDb,
  getDevValidationBuilderConfigFromDb,
  resetDevValidationBuilderConfigInDb,
  saveDevValidationBuilderConfigToDb,
} from "@/app/data-entry/enter-data/services/validation-builder/store";
import { DevValidationBuilderConfig } from "@/app/data-entry/enter-data/services/validation-builder/types";

const DEV_VALIDATION_BUILDER_PATH = "/dev/data-entry/validation-builder";

const assertDevUser = async () => {
  const user = await getCurrentUser();
  if (user.role !== "DEV") {
    throw new Error("Unauthorized");
  }
  return user;
};

export const getDevValidationBuilderConfig = async () => {
  const user = await getCurrentUser();
  if (user.role !== "DEV") {
    return {
      success: false,
      message: "Unauthorized",
      data: defaultDevValidationBuilderConfig,
    } as const;
  }

  const config = await getDevValidationBuilderConfigFromDb();
  return {
    success: true,
    message: "Validation builder config loaded",
    data: config,
  } as const;
};

export const saveDevValidationBuilderConfig = async (
  config: DevValidationBuilderConfig,
) => {
  const user = await assertDevUser();
  await saveDevValidationBuilderConfigToDb(
    sanitizeDevValidationBuilderConfig(config),
    user.id,
  );
  revalidatePath(DEV_VALIDATION_BUILDER_PATH);

  return {
    success: true,
    message: "Validation builder config saved",
  } as const;
};

export const resetDevValidationBuilderConfig = async () => {
  const user = await assertDevUser();
  await resetDevValidationBuilderConfigInDb(user.id);
  revalidatePath(DEV_VALIDATION_BUILDER_PATH);

  return {
    success: true,
    message: "Validation builder reset to defaults",
  } as const;
};

export const clearDevValidationBuilderConfig = async () => {
  await assertDevUser();
  await clearDevValidationBuilderConfigInDb();
  revalidatePath(DEV_VALIDATION_BUILDER_PATH);

  return {
    success: true,
    message: "Validation builder config cleared",
  } as const;
};
