import { getAzureToken } from "@/lib/powerbi";
import { authorizeSensitiveApiKey } from "../service";
import { logger } from "@/lib/logging/logger";

export async function GET(req: Request) {
  const auth = await authorizeSensitiveApiKey(req);
  if (!auth.success) {
    return Response.json({ message: auth.message }, { status: 401 });
  }

  try {
    const token = await getAzureToken();
    return Response.json(token);
  } catch (error) {
    logger.error("[getAzureAccessToken] Failed to get Azure token", {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json(
      { message: "Failed to get Azure token" },
      { status: 500 },
    );
  }
}
