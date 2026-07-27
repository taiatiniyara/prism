import { getCurrentUser } from "@/lib/user.service";
import { isValidOrigin } from "@/lib/ai/origin";
import ExcelJS from "exceljs";

export async function POST(request: Request) {
  try {
    await getCurrentUser();
  } catch {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!isValidOrigin(request)) {
    return Response.json({ message: "Invalid request origin." }, { status: 403 });
  }

  let body: {
    format: "csv" | "excel";
    data: {
      title: string;
      columns: string[];
      rows: (string | number | null)[][];
    };
    filename?: string;
  };

  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "Invalid request body." }, { status: 400 });
  }

  if (!body.data || !body.data.columns || !body.data.rows) {
    return Response.json(
      { message: "data with columns and rows is required." },
      { status: 400 },
    );
  }

  const MAX_COLUMNS = 50;
  const MAX_ROWS = 1000;
  const MAX_CELL_LENGTH = 500;

  if (body.data.columns.length > MAX_COLUMNS) {
    return Response.json({ message: `Maximum ${MAX_COLUMNS} columns allowed.` }, { status: 400 });
  }
  if (body.data.rows.length > MAX_ROWS) {
    return Response.json({ message: `Maximum ${MAX_ROWS} rows allowed.` }, { status: 400 });
  }

  const sanitizedRows = body.data.rows.map((row) =>
    row.map((cell) => {
      if (cell === null || cell === undefined) return "";
      const str = String(cell).slice(0, MAX_CELL_LENGTH);
      return str;
    }),
  );

  // Sanitize before putting it in the Content-Disposition header: allow only
  // a safe filename charset (strips CR/LF, quotes, path separators, etc.),
  // trim leading/trailing separators, and cap length. Prevents header
  // injection and path-traversal-shaped filenames.
  const rawFilename = body.filename || body.data.title || "export";
  const filename =
    rawFilename
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      .replace(/^[._-]+|[._-]+$/g, "")
      .slice(0, 100) || "export";

  if (body.format === "csv") {
    const csvRows = [
      body.data.columns.join(","),
      ...sanitizedRows.map((row) =>
        row
          .map((cell) => {
            if (cell === null || cell === undefined) return "";
            const str = String(cell);
            if (str.includes(",") || str.includes('"') || str.includes("\n")) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          })
          .join(","),
      ),
    ];

    const csvContent = csvRows.join("\n");

    return new Response(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}.csv"`,
      },
    });
  }

  if (body.format === "excel") {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(body.data.title || "Data");

    worksheet.addRow(body.data.columns);

    for (const row of sanitizedRows) {
      worksheet.addRow(row);
    }

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();

    return new Response(buffer as ArrayBuffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
      },
    });
  }

  return Response.json(
    { message: "format must be 'csv' or 'excel'." },
    { status: 400 },
  );
}
