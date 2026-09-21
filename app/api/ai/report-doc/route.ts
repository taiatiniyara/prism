import { getCurrentUser } from "@/lib/user.service";
import { isValidOrigin } from "@/lib/ai/origin";
import { renderReportDoc } from "@/lib/ai/report-doc";
import type { ReportPdfInput } from "@/lib/ai/report-pdf";
import { getPdfReportStyle } from "@/lib/ai/pdf-settings";

// Reads the configured style from the DB — needs the Node runtime.
export const runtime = "nodejs";

const MAX_SECTIONS = 50;

/**
 * Sanitize a download filename. Replace unsafe chars, cap length, then trim
 * leading/trailing separators with a LINEAR scan (not a `^[._-]+|[._-]+$`
 * regex, which is polynomial on many repeated separators — a ReDoS risk on
 * user-controlled input).
 */
function safeDocFilename(raw: string): string {
  const replaced = raw.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 100);
  const isSep = (c: string) => c === "." || c === "_" || c === "-";
  let start = 0;
  let end = replaced.length;
  while (start < end && isSep(replaced[start])) start++;
  while (end > start && isSep(replaced[end - 1])) end--;
  return replaced.slice(start, end) || "report";
}

export async function POST(request: Request) {
  try {
    await getCurrentUser();
  } catch {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!isValidOrigin(request)) {
    return Response.json({ message: "Invalid request origin." }, { status: 403 });
  }

  let body: ReportPdfInput & { filename?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "Invalid request body." }, { status: 400 });
  }

  if (!body || typeof body.title !== "string" || !Array.isArray(body.sections)) {
    return Response.json(
      { message: "title and sections[] are required." },
      { status: 400 },
    );
  }
  if (body.sections.length > MAX_SECTIONS) {
    return Response.json(
      { message: `Maximum ${MAX_SECTIONS} sections allowed.` },
      { status: 400 },
    );
  }

  const filename = safeDocFilename(body.filename || body.title || "report");

  const style = await getPdfReportStyle();
  const html = renderReportDoc(
    {
      title: body.title,
      generated_at: body.generated_at,
      executive_summary: body.executive_summary,
      sections: body.sections,
    },
    style,
  );

  return new Response(html, {
    headers: {
      "Content-Type": "application/msword; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.doc"`,
    },
  });
}
