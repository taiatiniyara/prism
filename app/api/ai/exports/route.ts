import { generateExport } from "@/lib/ai/export.service";
import { canUseAiAssistant } from "@/lib/ai/access-policy";
import { getCurrentUser } from "@/lib/user.service";
import type { AiQueryResponse } from "@/lib/ai/types";

interface ExportRequestBody {
  traceId: string;
  format: "pdf" | "csv";
}

const mockResponse = (traceId: string): AiQueryResponse => ({
  traceId,
  summary: "Export snapshot",
  metrics: [{ label: "Rows returned", value: 1 }],
  rows: [{ traceId }],
  attribution: [
    {
      sourceName: "export-snapshot",
      sourceType: "SERVICE_FUNCTION",
      sourceRef: "lib/ai/export.service.ts",
    },
  ],
  export: { pdfAvailable: true, csvAvailable: true, reportId: traceId },
});

export async function POST(request: Request) {
  let user;

  try {
    user = await getCurrentUser();
  } catch {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!canUseAiAssistant(user.role)) {
    return Response.json(
      { message: "Forbidden", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  try {
    const body = (await request.json()) as Partial<ExportRequestBody>;
    if (!body.traceId || (body.format !== "pdf" && body.format !== "csv")) {
      return Response.json(
        { message: "traceId and format are required.", code: "VALIDATION" },
        { status: 400 },
      );
    }

    const response = mockResponse(body.traceId);
    const result = generateExport(response, body.format);
    return Response.json(result, { status: 200 });
  } catch {
    return Response.json(
      { message: "Unable to generate export.", code: "DOWNSTREAM_FAILURE" },
      { status: 500 },
    );
  }
}
