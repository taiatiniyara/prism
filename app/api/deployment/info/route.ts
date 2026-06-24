import { getCurrentUser } from "@/lib/user.service";
import { getCircuitState } from "@/lib/ai/service";
import { AI_MODELS } from "@/lib/ai/types";
import { execSync } from "node:child_process";

function getCommitSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}

export async function GET(_request: Request): Promise<Response> {
  try {
    const user = await getCurrentUser().catch(() => null);
    if (!user) return Response.json({ message: "Unauthorized" }, { status: 401 });
    if (user.role !== "DEV") {
      return Response.json({ message: "Forbidden" }, { status: 403 });
    }

    const data = {
      commitSha: getCommitSha(),
      nodeVersion: process.version,
      uptimeSeconds: Math.floor(process.uptime()),
      aiCircuitState: {
        sonnet: getCircuitState(AI_MODELS.primary),
        haiku: getCircuitState(AI_MODELS.fallback),
      },
    };

    return Response.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ message, error: true }, { status: 500 });
  }
}
