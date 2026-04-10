import { parseCreateCustomKpiRequestPayload } from "@/app/api/data-entry/custom-kpi/_lib/validators";
import {
  createCustomKpiRequest,
  listMyCustomKpiRequests,
} from "@/app/settings/kpi/custom-kpi/service";
import { getCurrentUser } from "@/lib/user.service";

export async function POST(request: Request) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await request.json();
    const input = parseCreateCustomKpiRequestPayload(payload);
    const item = await createCustomKpiRequest(user.id, input);

    return Response.json(item, { status: 201 });
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

    return Response.json(
      { message: "Unable to submit custom KPI request." },
      { status: 500 },
    );
  }
}

export async function GET() {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const items = await listMyCustomKpiRequests(user.id);
    return Response.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";

    if (message.startsWith("FORBIDDEN:")) {
      return Response.json(
        { message: message.replace("FORBIDDEN:", "") },
        { status: 403 },
      );
    }

    return Response.json(
      { message: "Unable to list custom KPI requests." },
      { status: 500 },
    );
  }
}
