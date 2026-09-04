"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/user.service";
import {
  setAiSourceConfig,
  type AiPrimarySource,
  type AiSecondarySource,
} from "@/lib/ai/source-setting";

export async function updateAiSourceConfig(
  primary: AiPrimarySource,
  secondary: AiSecondarySource,
): Promise<{ success: boolean; message: string }> {
  const user = await getCurrentUser();
  if (user.role !== "DEV") {
    return { success: false, message: "Only DEV users can change AI settings." };
  }
  if (primary !== "webapp" && primary !== "powerbi") {
    return { success: false, message: "Invalid primary source." };
  }
  if (secondary !== "webapp" && secondary !== "powerbi" && secondary !== "none") {
    return { success: false, message: "Invalid secondary source." };
  }
  if (secondary === primary) {
    return {
      success: false,
      message: "Secondary source must differ from primary (or be None).",
    };
  }
  await setAiSourceConfig({ primary, secondary }, user.id ?? null);
  revalidatePath("/settings/ai-settings");
  return { success: true, message: "AI source settings updated." };
}
