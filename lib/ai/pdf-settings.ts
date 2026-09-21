import { db } from "@/db/connection";
import { appSettings } from "@/db/schema/appSettings";
import { eq } from "drizzle-orm";
import {
  DEFAULT_PDF_REPORT_STYLE,
  EMPTY_PDF_FONT_META,
  PDF_FONT_KEY,
  PDF_FONT_MAX_BYTES,
  PDF_FONT_SLOTS,
  PDF_REPORT_STYLE_KEY,
  normalizePdfStyle,
  type PdfFontSlot,
  type PdfFontSlotsMeta,
  type PdfReportStyle,
} from "./pdf-settings-constants";

export {
  DEFAULT_PDF_REPORT_STYLE,
  PDF_REPORT_STYLE_KEY,
  normalizePdfStyle,
  type PdfReportStyle,
} from "./pdf-settings-constants";

/** Decoded font buffers for the renderer — only the slots that are present. */
export interface PdfFontBuffers {
  regular?: Buffer;
  bold?: Buffer;
  italic?: Buffer;
}

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

// ── Custom brand font (Phase 2) ──────────────────────────────────────────────

interface StoredFont {
  filename: string;
  base64: string;
}

/**
 * Validate raw font bytes: must be a single TrueType/OpenType font by magic
 * number (not WOFF/WOFF2/TTC, which pdfkit can't registerFont from a Buffer),
 * and within the size cap. Returns a Buffer on success.
 */
export function validateFontBytes(
  bytes: Uint8Array,
): { ok: true; buffer: Buffer } | { ok: false; message: string } {
  if (bytes.byteLength === 0) return { ok: false, message: "The file is empty." };
  if (bytes.byteLength > PDF_FONT_MAX_BYTES) {
    return {
      ok: false,
      message: `Font is too large (max ${Math.round(PDF_FONT_MAX_BYTES / (1024 * 1024))} MB).`,
    };
  }
  const b = Buffer.from(bytes);
  const tag = b.subarray(0, 4);
  const isTrueType = tag[0] === 0x00 && tag[1] === 0x01 && tag[2] === 0x00 && tag[3] === 0x00;
  const magic = tag.toString("latin1");
  const isOpenType = magic === "OTTO"; // CFF-flavoured OpenType
  const isAppleTrue = magic === "true"; // legacy Apple TrueType
  if (!isTrueType && !isOpenType && !isAppleTrue) {
    if (magic === "wOFF" || magic === "wOF2") {
      return { ok: false, message: "WOFF/WOFF2 isn’t supported — upload a .ttf or .otf file." };
    }
    if (magic === "ttcf") {
      return { ok: false, message: "Font collections (.ttc) aren’t supported — upload a single .ttf or .otf." };
    }
    return { ok: false, message: "Not a valid TrueType/OpenType font (.ttf or .otf)." };
  }
  return { ok: true, buffer: b };
}

async function readFontRow(slot: PdfFontSlot): Promise<StoredFont | null> {
  try {
    const [row] = await db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, PDF_FONT_KEY[slot]))
      .limit(1);
    if (!row?.value) return null;
    const parsed = JSON.parse(row.value) as Partial<StoredFont>;
    if (typeof parsed?.base64 !== "string" || !parsed.base64) return null;
    return { filename: String(parsed.filename ?? "font"), base64: parsed.base64 };
  } catch {
    return null;
  }
}

/**
 * Which font slots are set + their filenames — for the settings UI. Never
 * returns the font bytes (they're large and the client doesn't need them).
 */
export async function getPdfFontSlotsMeta(): Promise<PdfFontSlotsMeta> {
  const meta: PdfFontSlotsMeta = {
    regular: { present: false, filename: null },
    bold: { present: false, filename: null },
    italic: { present: false, filename: null },
  };
  try {
    for (const slot of PDF_FONT_SLOTS) {
      const row = await readFontRow(slot);
      if (row) meta[slot] = { present: true, filename: row.filename };
    }
    return meta;
  } catch {
    return EMPTY_PDF_FONT_META;
  }
}

/**
 * Decoded font buffers for the renderer. Regular gates the whole custom font:
 * if it's absent, returns {} and the report renders in Helvetica as before.
 */
export async function getPdfFontBuffers(): Promise<PdfFontBuffers> {
  try {
    const regular = await readFontRow("regular");
    if (!regular) return {};
    const out: PdfFontBuffers = { regular: Buffer.from(regular.base64, "base64") };
    const bold = await readFontRow("bold");
    if (bold) out.bold = Buffer.from(bold.base64, "base64");
    const italic = await readFontRow("italic");
    if (italic) out.italic = Buffer.from(italic.base64, "base64");
    return out;
  } catch {
    return {};
  }
}

/** Persist a validated font into a slot. */
export async function setPdfFont(
  slot: PdfFontSlot,
  filename: string,
  buffer: Buffer,
  updatedBy: string | null,
): Promise<void> {
  const value = JSON.stringify({ filename, base64: buffer.toString("base64") } satisfies StoredFont);
  const now = new Date();
  await db
    .insert(appSettings)
    .values({ key: PDF_FONT_KEY[slot], value, updated_by: updatedBy, updated_at: now })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updated_by: updatedBy, updated_at: now },
    });
}

/** Remove a font slot (reverts that face to Helvetica / Regular fallback). */
export async function clearPdfFont(slot: PdfFontSlot): Promise<void> {
  await db.delete(appSettings).where(eq(appSettings.key, PDF_FONT_KEY[slot]));
}
