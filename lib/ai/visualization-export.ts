import { toPng } from "html-to-image";

export type CsvCell = string | number | null | undefined;

export function fmtNumber(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function slugifyTitle(title: string, fallback: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function csvEscape(field: CsvCell): string {
  if (field === null || field === undefined) return "";
  const text = String(field);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildCsv(header: string[], rows: CsvCell[][]): string {
  const lines = [header.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(","));
  }
  return lines.join("\n");
}

export function rowsToCsv(
  rows: Array<Record<string, string | number | null>>,
  seriesKeys: string[],
): string {
  const header = ["label", ...seriesKeys];
  return buildCsv(
    header,
    rows.map((row) => header.map((key) => row[key] ?? null)),
  );
}

export function buildContextText(title: string, csv: string, maxRows = 60): string {
  const lines = csv.split("\n");
  const body = lines.length > maxRows + 1 ? `${lines.slice(0, maxRows + 1).join("\n")}\n…(truncated)` : csv;
  return `${title}\n${body}`;
}

export function downloadCsv(filename: string, csv: string): void {
  downloadTextFile(filename, csv, "text/csv;charset=utf-8");
}

export function downloadTextFile(filename: string, content: string, mime = "text/plain"): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    return ok;
  }
}

export async function downloadNodeAsPng(node: HTMLElement, filename: string): Promise<void> {
  const dataUrl = await toPng(node, {
    pixelRatio: 2,
    backgroundColor: getComputedStyle(node).backgroundColor || "#ffffff",
  });
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export async function downloadEchartsPng(
  getDataUrl: (opts: { pixelRatio?: number; backgroundColor?: string }) => string,
  filename: string,
  backgroundColor?: string,
): Promise<void> {
  const dataUrl = getDataUrl({ pixelRatio: 2, backgroundColor: backgroundColor ?? "#ffffff" });
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}