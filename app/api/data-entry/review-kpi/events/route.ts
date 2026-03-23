import {
  parseOptionalSinceEventId,
  parseReviewKpiFilterContext,
} from "@/app/api/data-entry/review-kpi/_lib/validators";
import { assertReviewKpiReadAccess } from "@/app/data-entry/review-kpi/service";
import {
  listSyncEventsSince,
  subscribeToSyncEvents,
} from "@/app/data-entry/review-kpi/sync-store";
import { SyncEventEnvelope } from "@/app/data-entry/review-kpi/types";
import { getCurrentUser } from "@/lib/user.service";

const matchesScope = (
  event: SyncEventEnvelope,
  context: { reportPeriodId: number; serviceAreaId: number | null },
) => {
  if (event.reportPeriodId !== context.reportPeriodId) {
    return false;
  }

  if (context.serviceAreaId != null && event.serviceAreaId !== context.serviceAreaId) {
    return false;
  }

  return true;
};

export async function GET(request: Request) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const context = parseReviewKpiFilterContext(searchParams);

    if (context.reportPeriodId == null) {
      throw new Error("VALIDATION:reportPeriodId is required.");
    }

    assertReviewKpiReadAccess(user);

    const sinceEventId = parseOptionalSinceEventId(
      searchParams.get("sinceEventId"),
    );

    const scopedContext = {
      reportPeriodId: context.reportPeriodId,
      serviceAreaId: context.serviceAreaId,
    };

    if (sinceEventId != null) {
      const events = listSyncEventsSince(sinceEventId).filter((event) =>
        matchesScope(event, scopedContext),
      );

      return Response.json({ events });
    }

    const encoder = new TextEncoder();

    let cleanup: (() => void) | null = null;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const sendEvent = (event: SyncEventEnvelope) => {
          if (!matchesScope(event, scopedContext)) {
            return;
          }

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        };

        const unsubscribe = subscribeToSyncEvents(sendEvent);
        const heartbeat = setInterval(() => {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        }, 30000);

        // Send sync-recovered marker so clients can confirm stream readiness.
        sendEvent({
          eventId: crypto.randomUUID(),
          eventType: "sync-recovered",
          occurredAt: new Date().toISOString(),
          reportPeriodId: scopedContext.reportPeriodId,
          serviceAreaId: scopedContext.serviceAreaId,
          kpiDefId: 0,
          inputDefId: null,
          dataEntryId: null,
          payload: {},
        });

        cleanup = () => {
          clearInterval(heartbeat);
          unsubscribe();
        };
      },
      cancel() {
        cleanup?.();
      },
    });

    request.signal.addEventListener("abort", () => {
      cleanup?.();
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
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
      { message: "Unable to stream review KPI events." },
      { status: 500 },
    );
  }
}
