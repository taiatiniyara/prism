import { getCurrentUser } from "@/lib/user.service";
import { getLogBuffer } from "@/lib/logging/logger";

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return Response.json({ message: "Unauthorized" }, { status: 401 });
  if (user.role !== "DEV") {
    return Response.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const buffer = getLogBuffer();
    const { searchParams } = new URL(request.url);
    const level = searchParams.get("level");
    const search = searchParams.get("search")?.toLowerCase();
    const limit = Math.min(1000, Math.max(1, parseInt(searchParams.get("limit") ?? "200", 10) || 200));

    let entries = buffer;
    if (level) {
      const levels = level.split(",");
      entries = entries.filter((e) => levels.includes(e.level));
    }
    if (search) {
      entries = entries.filter((e) => e.message.toLowerCase().includes(search));
    }

    const sliced = entries.slice(-limit).reverse();

    return Response.json({ entries: sliced, bufferSize: buffer.length, limit });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ message, error: true }, { status: 500 });
  }
}
