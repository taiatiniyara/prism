import {
  parseScorecardFilterContext,
  parseScorecardUpdatePayload,
} from "@/app/api/data-entry/balanced-scorecard/_lib/validators";
import {
  getScorecardResponse,
  saveScorecardConfiguration,
} from "@/app/data-entry/balanced-scorecard/service";
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
    const response = await getScorecardResponse(user, context);
    return Response.json(response);
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
      { message: "Unable to load balanced scorecard." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = parseScorecardUpdatePayload(await request.json());
    const updated = await saveScorecardConfiguration(user, payload);
    return Response.json({ message: "Scorecard KPI updated.", updated });
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
      { message: "Unable to update balanced scorecard." },
      { status: 500 },
    );
  }
}
