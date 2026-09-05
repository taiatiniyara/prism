import { db } from "@/db/connection";
import { migrationLogs } from "@/db/schema/migration-log";
import { desc } from "drizzle-orm";

export async function getMigrationHistory() {
  const rows = await db
    .select()
    .from(migrationLogs)
    .orderBy(desc(migrationLogs.id))
    .limit(200);
  return rows.map((r) => ({
    id: r.id,
    run_at: r.run_at?.toISOString() ?? "",
    step_label: r.step_label,
    success: r.success,
    duration_ms: r.duration_ms,
    error_message: r.error_message,
    records_affected: r.records_affected,
  }));
}

export default async function MigrationHistory() {
  const rows = await getMigrationHistory();
  if (rows.length === 0) {
    return (
      <div className="mt-6 text-sm text-muted-foreground">
        No migration history yet.
      </div>
    );
  }

  return (
    <div className="mt-6">
      <h2 className="text-lg font-semibold mb-3">Migration History</h2>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Time</th>
              <th className="px-3 py-2 font-medium">Step</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Duration</th>
              <th className="px-3 py-2 font-medium">Records</th>
              <th className="px-3 py-2 font-medium">Error</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                  {new Date(row.run_at).toLocaleString()}
                </td>
                <td className="px-3 py-2">{row.step_label}</td>
                <td className="px-3 py-2">
                  <span
                    className={
                      row.success
                        ? "text-success font-medium"
                        : "text-danger font-medium"
                    }
                  >
                    {row.success ? "OK" : "FAIL"}
                  </span>
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {row.duration_ms != null
                    ? `${(row.duration_ms / 1000).toFixed(1)}s`
                    : "-"}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {row.records_affected ?? "-"}
                </td>
                <td className="px-3 py-2 text-danger max-w-xs truncate">
                  {row.error_message ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
