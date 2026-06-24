import {
  assertMigrationKeyAsync,
  fetchTable,
  parseLimit,
  parseOffset,
  SUPPORTED_TABLES,
  SupportedTable,
} from "../_lib";

type Context = {
  params: Promise<{ table: string }>;
};

export async function GET(request: Request, context: Context) {
  try {
    await assertMigrationKeyAsync();

    const { table } = await context.params;
    if (!SUPPORTED_TABLES.includes(table as SupportedTable)) {
      return Response.json(
        {
          error: "Unsupported table",
          supportedTables: SUPPORTED_TABLES,
        },
        { status: 400 },
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = parseLimit(searchParams.get("limit"));
    const offset = parseOffset(searchParams.get("offset"));

    const data = await fetchTable(table as SupportedTable, limit, offset);

    return Response.json({
      ok: true,
      ...data,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    return Response.json(
      {
        error: "Failed to export migration table",
      },
      { status: 500 },
    );
  }
}
