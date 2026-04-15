import { parseScorecardDraftSavePayload } from "@/app/api/data-entry/balanced-scorecard/_lib/validators";
import { saveScorecardDraft } from "@/app/data-entry/balanced-scorecard/service";
import { getCurrentUser } from "@/lib/user.service";

export async function PUT(request: Request) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = parseScorecardDraftSavePayload(await request.json());
    const updated = await saveScorecardDraft(user, payload);
    return Response.json({
      message: "Scorecard builder draft updated.",
      updated,
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
      { message: "Unable to update balanced scorecard builder draft." },
      { status: 500 },
    );
  }
}
