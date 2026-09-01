import { parseRequestIdParam } from "@/app/api/data-entry/custom-kpi/requests/[requestId]/decision/_lib/validators";
import { promoteCustomKpiRequestVisibility } from "@/app/data-entry/review-kpi/service";
import { getCurrentUser } from "@/lib/user.service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { requestId } = await params;
    const safeRequestId = parseRequestIdParam(requestId);
    const result = await promoteCustomKpiRequestVisibility(safeRequestId, user);

    return Response.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";

    if (message.startsWith("VALIDATION:")) {
      return Response.json(
        { message: message.replace("VALIDATION:", "") },
        { status: 400 },
      );
    }

    if (message.startsWith("FORBIDDEN:")) {
      return Response.json(
        { message: message.replace("FORBIDDEN:", "") },
        { status: 403 },
      );
    }

    if (message.startsWith("CONFLICT:")) {
      return Response.json(
        { message: message.replace("CONFLICT:", "") },
        { status: 409 },
      );
    }

    return Response.json(
      { message: "Unable to promote custom KPI visibility." },
      { status: 500 },
    );
  }
}
