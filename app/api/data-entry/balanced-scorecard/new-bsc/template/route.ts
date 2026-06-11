import {
  errorResponse,
  requireUser,
} from "@/app/api/data-entry/balanced-scorecard/new-bsc/_lib/respond";
import { parseCreateTemplateNodePayload } from "@/app/api/data-entry/balanced-scorecard/new-bsc/_lib/validators";
import {
  addTemplateNode,
  getTemplate,
} from "@/app/data-entry/balanced-scorecard/new-bsc/service";

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  try {
    const template = await getTemplate(auth.user);
    return Response.json(template);
  } catch (error) {
    return errorResponse(error, "Unable to load BSC template.");
  }
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  try {
    const payload = parseCreateTemplateNodePayload(await request.json());
    const created = await addTemplateNode(auth.user, payload);
    return Response.json({ message: "Template node created.", created });
  } catch (error) {
    return errorResponse(error, "Unable to create template node.");
  }
}
