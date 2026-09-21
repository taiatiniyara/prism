import { getCurrentUser } from "@/lib/user.service";
import { isValidOrigin } from "@/lib/ai/origin";
import { renderReportPdf, type ReportPdfInput } from "@/lib/ai/report-pdf";

// pdfkit needs the Node runtime (built-in font metrics + Buffers).
export const runtime = "nodejs";

const MAX_SECTIONS = 50;

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

  const rawFilename = body.filename || body.title || "report";
  const filename =
    rawFilename
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      .replace(/^[._-]+|[._-]+$/g, "")
      .slice(0, 100) || "report";

  const pdf = await renderReportPdf({
    title: body.title,
    generated_at: body.generated_at,
    executive_summary: body.executive_summary,
    sections: body.sections,
  });

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}.pdf"`,
    },
  });
}
