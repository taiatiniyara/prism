import { parseScorecardFilterContext } from "@/app/api/data-entry/balanced-scorecard/_lib/validators";
import { getScorecardKpiOptions } from "@/app/data-entry/balanced-scorecard/service";
import { getCurrentUser } from "@/lib/user.service";

export async function GET(request: Request) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const context = parseScorecardFilterContext(searchParams);
    const options = await getScorecardKpiOptions(user, context);
    return Response.json({ options });
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
      { message: "Unable to load KPI options." },
      { status: 500 },
    );
  }
}
