import {
  errorResponse,
  requireUser,
} from "@/app/api/data-entry/balanced-scorecard/new-bsc/_lib/respond";
import { parseCreateObjectiveLinkPayload } from "@/app/api/data-entry/balanced-scorecard/new-bsc/_lib/strategy-map.validators";
import { addObjectiveLink } from "@/app/data-entry/balanced-scorecard/new-bsc/strategy-map.service";

export async function POST(request: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  try {
    const payload = parseCreateObjectiveLinkPayload(await request.json());
    const result = await addObjectiveLink(auth.user, payload);
    return Response.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Unable to create link.");
  }
}
