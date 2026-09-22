// Server-filled report tables ("table_ref").
//
// A report turn used to spend most of its wall-clock with the model RE-TYPING table rows
// it had just read from a tool result into the `report` block (~45 output tokens/s; a
// fleet table is thousands of tokens). Instead, a data tool may return its tables under
// `tables`, and a report section may point at one:
//
//   tool output   { data: { tables: { kpi_ranking: { columns, rows } }, … } }
//   report block  { type: "report", sections: [{ heading, content,
//                     data_table: { table_ref: "kpi_ranking", columns?: [...], limit?: 10 } }] }
//
// The chat route registers every tool result's tables for the duration of the request and
// resolves each ref to today's inline shape `{ columns, rows }` BEFORE the visualization is
// streamed or persisted — so ReportView, renderReportPdf and the Word export are untouched,
// and a reloaded conversation needs no registry. Dependency-free and unit-tested; see
// docs/ai-benchmark-report-tool-spec.md §9.

export interface ReportTable {
  columns: string[];
  rows: Record<string, unknown>[];
}

export interface ReportTableRef {
  table_ref: string;
  columns?: string[];
  limit?: number;
}

// A resolved report must still fit the client's per-visualization cap.
export const MAX_RESOLVED_TABLE_ROWS = 100;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const toReportTable = (value: unknown): ReportTable | null => {
  if (!isRecord(value)) return null;
  const { columns, rows } = value;
  if (!Array.isArray(columns) || !columns.every((c) => typeof c === "string")) return null;
  if (!Array.isArray(rows) || !rows.every(isRecord)) return null;
  return { columns: columns as string[], rows: rows as Record<string, unknown>[] };
};

// Tools wrap their payload as AiToolResult `{ data, metadata }`; accept a bare `tables` too.
export const extractTablesFromToolOutput = (output: unknown): Record<string, ReportTable> => {
  if (!isRecord(output)) return {};
  const holder = isRecord(output.data) && "tables" in output.data ? output.data : output;
  if (!isRecord(holder.tables)) return {};
  const tables: Record<string, ReportTable> = {};
  for (const [key, value] of Object.entries(holder.tables)) {
    const table = toReportTable(value);
    if (table) tables[key] = table;
  }
  return tables;
};

// Request-scoped. A bare key resolves to the MOST RECENT tool result that produced it;
// `"<toolCallId>:<key>"` pins a specific call when a turn holds two bundles.
export class ReportTableRegistry {
  private readonly tables = new Map<string, ReportTable>();
  private readonly missed = new Set<string>();

  addToolResult(toolCallId: string, output: unknown): number {
    const found = extractTablesFromToolOutput(output);
    for (const [key, table] of Object.entries(found)) {
      this.tables.set(key, table);
      this.tables.set(`${toolCallId}:${key}`, table);
    }
    return Object.keys(found).length;
  }

  get(ref: string): ReportTable | undefined {
    const table = this.tables.get(ref);
    if (!table) this.missed.add(ref);
    return table;
  }

  // Refs a report asked for that no tool result provided — for the route to log.
  get unresolvedRefs(): string[] {
    return [...this.missed];
  }

  get size(): number {
    return this.tables.size;
  }
}

const isTableRef = (v: unknown): v is ReportTableRef =>
  isRecord(v) && typeof v.table_ref === "string";

const materialize = (table: ReportTable, ref: ReportTableRef, rowCap: number): ReportTable => {
  // Unknown column names are ignored rather than rendered as empty columns; if none of the
  // requested columns exist, fall back to the table's own.
  const requested = (ref.columns ?? []).filter((c) => table.columns.includes(c));
  const columns = requested.length > 0 ? requested : table.columns;
  const limit =
    typeof ref.limit === "number" && Number.isFinite(ref.limit) && ref.limit > 0
      ? Math.min(Math.floor(ref.limit), rowCap)
      : rowCap;
  const rows = table.rows
    .slice(0, limit)
    .map((row) => Object.fromEntries(columns.map((c) => [c, row[c] ?? null])));
  return { columns, rows };
};

export interface ResolveResult {
  visualization: unknown;
  resolved: string[];
  unresolved: string[];
}

// Replaces every `data_table: { table_ref }` in a report block with the referenced rows.
// An unknown ref DROPS that section's table (the narrative still renders) — it never fails
// the turn. Non-report blocks and inline tables pass through untouched. Pure: no mutation.
export const resolveReportTableRefs = (
  visualization: unknown,
  registry: ReportTableRegistry,
  rowCap: number = MAX_RESOLVED_TABLE_ROWS,
): ResolveResult => {
  const result: ResolveResult = { visualization, resolved: [], unresolved: [] };
  if (!isRecord(visualization) || visualization.type !== "report") return result;
  if (!Array.isArray(visualization.sections)) return result;

  const sections = visualization.sections.map((section: unknown) => {
    if (!isRecord(section) || !isTableRef(section.data_table)) return section;
    const ref = section.data_table;
    const table = registry.get(ref.table_ref);
    if (!table) {
      result.unresolved.push(ref.table_ref);
      const { data_table: _dropped, ...rest } = section;
      void _dropped;
      return rest;
    }
    result.resolved.push(ref.table_ref);
    return { ...section, data_table: materialize(table, ref, rowCap) };
  });

  result.visualization = { ...visualization, sections };
  return result;
};

// Resolves, then shrinks the row cap until the serialized block fits `maxJsonSize`.
// Returns the JSON string, or null if even a minimal table can't fit.
export const resolveReportToJson = (
  visualization: unknown,
  registry: ReportTableRegistry,
  maxJsonSize: number,
): (ResolveResult & { json: string }) | null => {
  for (let cap = MAX_RESOLVED_TABLE_ROWS; cap >= 5; cap = Math.floor(cap / 2)) {
    const attempt = resolveReportTableRefs(visualization, registry, cap);
    const json = JSON.stringify(attempt.visualization);
    if (json.length <= maxJsonSize) return { ...attempt, json };
    if (attempt.resolved.length === 0) return null; // oversize without our rows — not ours to fix
  }
  return null;
};
