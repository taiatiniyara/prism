import { getAzureToken } from "@/lib/powerbi";
import { authorizeSensitiveApiKey } from "../service";

export async function GET(req: Request) {
  const auth = await authorizeSensitiveApiKey(req);
  if (!auth.success) {
    return Response.json({ message: auth.message }, { status: 401 });
  }

  try {
    const token = await getAzureToken();
    return Response.json(token);
  } catch {
    return Response.json(
      { message: "Failed to get Azure token" },
      { status: 500 },
    );
  }
}
