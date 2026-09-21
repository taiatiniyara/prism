"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/user.service";
import {
  setAiSourceConfig,
  type AiPrimarySource,
  type AiSecondarySource,
} from "@/lib/ai/source-setting";
import { setPdfReportStyle } from "@/lib/ai/pdf-settings";
import {
  normalizePdfStyle,
  type PdfReportStyle,
} from "@/lib/ai/pdf-settings-constants";

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

/**
 * Update the AI performance-report PDF style. Editable by DEV and BMO (unlike
 * the data-source config, which is DEV-only). The value is normalized server
 * side, so an out-of-range size or non-hex colour is coerced before persisting.
 */
export async function updatePdfReportStyle(
  style: PdfReportStyle,
): Promise<{ success: boolean; message: string }> {
  const user = await getCurrentUser();
  if (user.role !== "DEV" && user.role !== "BMO") {
    return { success: false, message: "Only DEV or BMO users can change PDF settings." };
  }
  await setPdfReportStyle(normalizePdfStyle(style), user.id ?? null);
  revalidatePath("/settings/ai-settings");
  return { success: true, message: "PDF report style updated." };
}
