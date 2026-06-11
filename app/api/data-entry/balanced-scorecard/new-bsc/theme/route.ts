import {
  errorResponse,
  requireUser,
} from "@/app/api/data-entry/balanced-scorecard/new-bsc/_lib/respond";
import { parseSaveThemePayload } from "@/app/api/data-entry/balanced-scorecard/new-bsc/_lib/validators";
import {
  getTheme,
  saveTheme,
} from "@/app/data-entry/balanced-scorecard/new-bsc/service";
import type { BscThemeStyles } from "@/app/data-entry/balanced-scorecard/new-bsc/types";

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  try {
    const theme = await getTheme(auth.user);
    return Response.json(theme);
  } catch (error) {
    return errorResponse(error, "Unable to load BSC theme.");
  }
}

export async function PUT(request: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  try {
    const { styles } = parseSaveThemePayload(await request.json());
    await saveTheme(auth.user, styles as BscThemeStyles);
    return Response.json({ message: "Theme saved." });
  } catch (error) {
    return errorResponse(error, "Unable to save BSC theme.");
  }
}
