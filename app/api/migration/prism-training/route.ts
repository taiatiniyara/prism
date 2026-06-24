import {
  assertMigrationKeyAsync,
  fetchTable,
  normalizeTables,
  parseLimit,
  parseOffset,
  SUPPORTED_TABLES,
} from "./_lib";

export async function GET(request: Request) {
  try {
    await assertMigrationKeyAsync();

    const { searchParams } = new URL(request.url);
    const includeRows = searchParams.get("includeRows") !== "false";
    const limit = parseLimit(searchParams.get("limit"));
    const offset = parseOffset(searchParams.get("offset"));

    const requested = normalizeTables(searchParams.getAll("table"));
    const tables = requested.length > 0 ? requested : [...SUPPORTED_TABLES];

    if (!includeRows) {
      return Response.json({
        ok: true,
        tables,
        pagination: { limit, offset },
      });
    }

    const data = await Promise.all(
      tables.map((table) => fetchTable(table, limit, offset)),
    );

    return Response.json({
      ok: true,
      tables,
      pagination: { limit, offset },
      data,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    return Response.json(
      {
        error: "Failed to export migration tables",
      },
      { status: 500 },
    );
  }
}
