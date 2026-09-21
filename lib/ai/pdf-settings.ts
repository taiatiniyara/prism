import { db } from "@/db/connection";
import { appSettings } from "@/db/schema/appSettings";
import { eq } from "drizzle-orm";
import {
  DEFAULT_PDF_REPORT_STYLE,
  PDF_REPORT_STYLE_KEY,
  normalizePdfStyle,
  type PdfReportStyle,
} from "./pdf-settings-constants";

export {
  DEFAULT_PDF_REPORT_STYLE,
  PDF_REPORT_STYLE_KEY,
  normalizePdfStyle,
  type PdfReportStyle,
} from "./pdf-settings-constants";

/**
 * Read the configured PDF report style. Defensive: if the app_settings table
 * doesn't exist yet, the row is unset, or the stored JSON is malformed, fall
 * back to the shipped defaults so PDF generation never breaks — a missing
 * config renders exactly as the old hardcoded constants did.
 */
export async function getPdfReportStyle(): Promise<PdfReportStyle> {
  try {
    const [row] = await db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, PDF_REPORT_STYLE_KEY))
      .limit(1);
    if (!row?.value) return DEFAULT_PDF_REPORT_STYLE;
    return normalizePdfStyle(JSON.parse(row.value));
  } catch {
    return DEFAULT_PDF_REPORT_STYLE;
  }
}

/**
 * Persist the PDF report style. The value is normalized first, so an
 * out-of-range size or a non-hex colour can never be stored.
 */
export async function setPdfReportStyle(
  style: PdfReportStyle,
  updatedBy: string | null,
): Promise<void> {
  const value = JSON.stringify(normalizePdfStyle(style));
  const now = new Date();
  await db
    .insert(appSettings)
    .values({ key: PDF_REPORT_STYLE_KEY, value, updated_by: updatedBy, updated_at: now })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updated_by: updatedBy, updated_at: now },
    });
}
