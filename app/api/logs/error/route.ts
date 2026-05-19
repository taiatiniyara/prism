import { logErrorAndNotifyDev } from "@/lib/error-log.service";
import { getCurrentUser } from "@/lib/user.service";

export async function POST(request: Request) {
  let currentUser;
  try {
    currentUser = await getCurrentUser();
  } catch {
    // Continue without user context - log anonymously
  }

  try {
    const payload = await request.json();

    const source = payload.source ?? request.headers.get("referer") ?? "unknown";
    const errorType = payload.errorType ?? payload.error_type ?? "Unknown";
    const severity = payload.severity ?? "error";
    const message = payload.message ?? "No message provided";
    const stack = payload.stack ?? null;
    const context = payload.context ?? null;
    const url = payload.url ?? null;

    await logErrorAndNotifyDev({
      source,
      errorType,
      severity,
      message,
      stack,
      context,
      url,
      userId: currentUser?.id ?? null,
      userEmail: currentUser?.email ?? null,
      userRole: currentUser?.role ?? null,
    });

    return Response.json({ logged: true }, { status: 201 });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unexpected error";

    return Response.json(
      { message: errorMessage },
      { status: 500 },
    );
  }
}
