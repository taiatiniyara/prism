import { parseCreateCustomKpiRequestPayload } from "@/app/api/data-entry/custom-kpi/_lib/validators";
import {
  createCustomKpiRequest,
  listMyCustomKpiRequests,
} from "@/app/settings/kpi/custom-kpi/service";
import { getCurrentUser } from "@/lib/user.service";
import { revalidatePath } from "next/cache";

export async function POST(request: Request) {
  const submitDebugId =
    request.headers.get("X-Custom-Kpi-Submit-Debug-Id") ?? "unknown";

  console.info("custom_kpi_submit_api:start", { submitDebugId });

  let user;
  try {
    user = await getCurrentUser();
  } catch {
    console.error("custom_kpi_submit_api:unauthorized", { submitDebugId });
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await request.json();
    const input = parseCreateCustomKpiRequestPayload(payload);
    const item = await createCustomKpiRequest(user.id, input);
    console.info("custom_kpi_submit_api:created", {
      submitDebugId,
      requestId: item.id,
      userId: user.id,
    });

    try {
      revalidatePath("/settings/kpi");
      console.info("custom_kpi_submit_api:revalidated", {
        submitDebugId,
        requestId: item.id,
      });
    } catch (error) {
      console.error("Failed to revalidate /settings/kpi after request submit", {
        submitDebugId,
        error: error instanceof Error ? error.message : "Unknown error",
        requestId: item.id,
      });
    }

    console.info("custom_kpi_submit_api:success_response", {
      submitDebugId,
      requestId: item.id,
    });

    return Response.json(
      { id: item.id, title: item.title, status: item.status },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("Failed to submit custom KPI request", {
      submitDebugId,
      userId: user.id,
      error: message,
    });

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
