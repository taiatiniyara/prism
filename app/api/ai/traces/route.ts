import { getCurrentUser } from "@/lib/user.service";
import { canUseAiAssistant } from "@/lib/ai/access-policy";
import { traceLogService } from "@/lib/ai/trace-log.service";

export async function GET() {
  let user;

  try {
    user = await getCurrentUser();
  } catch {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (
    !canUseAiAssistant(user.role) ||
    !traceLogService.canReviewTraces(user.role)
  ) {
    return Response.json(
      { message: "Forbidden", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  const items = await traceLogService.listTraces({ limit: 100 });
  return Response.json({ items }, { status: 200 });
}
