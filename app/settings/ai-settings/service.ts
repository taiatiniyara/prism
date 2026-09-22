"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/user.service";
import {
  setAiSourceConfig,
  type AiPrimarySource,
  type AiSecondarySource,
} from "@/lib/ai/source-setting";
import {
  clearPdfFont,
  setPdfFont,
  setPdfReportStyle,
  validateFontBytes,
} from "@/lib/ai/pdf-settings";
import {
  PDF_FONT_SLOTS,
  normalizePdfStyle,
  type PdfFontSlot,
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

const isPdfFontSlot = (v: unknown): v is PdfFontSlot =>
  typeof v === "string" && (PDF_FONT_SLOTS as readonly string[]).includes(v);

/**
 * Upload a custom brand font (.ttf/.otf) into a slot. DEV/BMO only. The bytes
 * are validated by magic number + size cap before being persisted.
 */
export async function uploadPdfFont(
  formData: FormData,
): Promise<{ success: boolean; message: string; filename?: string }> {
  const user = await getCurrentUser();
  if (user.role !== "DEV" && user.role !== "BMO") {
    return { success: false, message: "Only DEV or BMO users can change PDF settings." };
  }
  const slot = formData.get("slot");
  if (!isPdfFontSlot(slot)) {
    return { success: false, message: "Invalid font slot." };
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, message: "No file provided." };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = validateFontBytes(bytes);
  if (!check.ok) {
    return { success: false, message: check.message };
  }
  const filename = file.name.slice(0, 120) || "font";
  await setPdfFont(slot, filename, check.buffer, user.id ?? null);
  revalidatePath("/settings/ai-settings");
  return { success: true, message: `${slot} font uploaded.`, filename };
}

/** Remove a custom font slot (reverts that face to the fallback). DEV/BMO only. */
export async function removePdfFont(
  slot: PdfFontSlot,
): Promise<{ success: boolean; message: string }> {
  const user = await getCurrentUser();
  if (user.role !== "DEV" && user.role !== "BMO") {
    return { success: false, message: "Only DEV or BMO users can change PDF settings." };
  }
  if (!isPdfFontSlot(slot)) {
    return { success: false, message: "Invalid font slot." };
  }
  await clearPdfFont(slot);
  revalidatePath("/settings/ai-settings");
  return { success: true, message: `${slot} font removed.` };
}
