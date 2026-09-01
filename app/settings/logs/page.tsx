"use client";

import { useEffect, useState } from "react";

interface LogEntry {
  id: string;
  data_entry_id: string;
  previous_value: string;
  new_value: string;
  updated_at: string;
  updated_by_name: string | null;
  updated_by_email: string | null;
}

export default function DataEntryLogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/data-entry/logs?limit=200")
      .then((r) => r.json())
      .then(setLogs)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6 text-slate-500">Loading logs...</div>;

  return (
    <div className="p-4">
      <h2 className="text-lg font-bold mb-4">Data Entry Logs</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b bg-slate-50 text-left">
              <th className="p-2 font-medium">Data Entry ID</th>
              <th className="p-2 font-medium">Previous Value</th>
              <th className="p-2 font-medium">New Value</th>
              <th className="p-2 font-medium">Updated By</th>
              <th className="p-2 font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-4 text-center text-slate-400">
                  No logs found.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="border-b hover:bg-slate-50">
                  <td className="p-2 font-mono text-xs">{log.data_entry_id}</td>
                  <td className="p-2 font-mono text-xs text-slate-500">
                    {log.previous_value}
                  </td>
                  <td className="p-2 font-mono text-xs">{log.new_value}</td>
                  <td className="p-2 text-xs">
                    {log.updated_by_name ?? log.updated_by_email ?? "-"}
                  </td>
                  <td className="p-2 text-xs text-slate-500">
                    {new Date(log.updated_at).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
