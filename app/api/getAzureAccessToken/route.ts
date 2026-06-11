import { timingSafeEqual } from "node:crypto";
import { getAzureToken } from "@/lib/powerbi.service";

export async function GET(req: Request) {
  const apiKey = process.env.API_KEY ?? "";
  const inputApiKey = req.headers.get("Authorization") ?? "";
  if (
    apiKey.length !== inputApiKey.length ||
    !timingSafeEqual(Buffer.from(apiKey), Buffer.from(inputApiKey))
  ) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
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
