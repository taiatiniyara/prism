import { assertMigrationKey } from "../../prism-training/_lib";
import { syncGenerators } from "@/app/migration/generators-sync";

export async function POST(request: Request) {
  try {
    assertMigrationKey(request);

    const result = await syncGenerators();

    return Response.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (
      error instanceof Error &&
      error.message === "MIGRATION_API_KEY is not configured on this server."
    ) {
      return Response.json(
        { error: "MIGRATION_API_KEY is not configured on this server." },
        { status: 503 },
      );
    }

    return Response.json(
      {
        ok: false,
        inserted: 0,
        updated: 0,
        deleted: 0,
        total: 0,
        skippedInvalidForeignKeys: 0,
        error: error instanceof Error ? error.message : "Failed to sync generators.",
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  return Response.json({
    endpoint: "POST /api/migration/sync/generators",
    description:
      "Mirrors prism's `units` table to prism-training (/api/migration/generators): inserts new, updates existing, and deletes units absent from prism-training.",
    auth: "x-migration-key header",
  });
}
