import { getCurrentUser } from "@/lib/user.service";
import { getConfig } from "@/lib/config.service";

export async function GET(_request: Request): Promise<Response> {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (user.role !== "DEV") {
    return Response.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const config = getConfig();
    return Response.json(config);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to read config";
    return Response.json({ message }, { status: 500 });
  }
}
