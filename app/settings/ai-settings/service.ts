"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/user.service";
import {
  setAiPrimarySource,
  type AiPrimarySource,
} from "@/lib/ai/source-setting";

export async function updateAiPrimarySource(
  primary: AiPrimarySource,
): Promise<{ success: boolean; message: string }> {
  const user = await getCurrentUser();
  if (user.role !== "DEV") {
    return { success: false, message: "Only DEV users can change AI settings." };
  }
  if (primary !== "webapp" && primary !== "powerbi") {
    return { success: false, message: "Invalid source." };
  }
  await setAiPrimarySource(primary, user.id ?? null);
  revalidatePath("/settings/ai-settings");
  return { success: true, message: "AI primary source updated." };
}
