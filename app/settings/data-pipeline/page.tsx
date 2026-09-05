"use client";

import { useEffect, useState, useCallback } from "react";

export default function DataPipelinePage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/data-pipeline/stats");
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to load");
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await fetchData();
    })();
  }, [fetchData]);

  if (loading) return <div className="p-6 text-slate-500">Loading pipeline stats...</div>;
  if (error) return <div className="p-6 text-danger">Error: {error}</div>;
  if (!data) return null;

  const sc = data.statusCounts as Record<string, number>;
  const statuses = ["requested", "pending", "entered", "reviewed", "approved", "endorsed", "notAvailable"];
  const maxCount = Math.max(1, ...statuses.map((s) => sc[s] ?? 0));
  const utilities = data.utilities as Array<{ id: number; name: string }> || [];

  return (
    <div className="p-4 space-y-6">
      <h2 className="text-lg font-bold">Data Entry Pipeline</h2>

      <div className="flex gap-4 text-sm">
        <div className="px-3 py-1.5 rounded bg-slate-100">Total: {String(data.totalEntries)}</div>
        <div className="px-3 py-1.5 rounded bg-green-100 text-green-800">{String(data.completedPct)}% complete</div>
        <div className="px-3 py-1.5 rounded bg-yellow-100 text-yellow-800">{String(data.stuckCount)} stuck (&gt;{String(data.stuckThresholdDays)}d)</div>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">Status Distribution</h3>
        <div className="space-y-1">
          {statuses.map((s) => {
            const count = sc[s] ?? 0;
            const pct = Math.round((count / maxCount) * 100);
            return (
              <div key={s} className="flex items-center gap-2">
                <span className="text-xs w-24 text-right">{s}</span>
                <div className="flex-1 bg-slate-100 rounded h-5">
                  <div className="bg-info h-5 rounded" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs w-12">{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {utilities.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2">Utilities ({utilities.length})</h3>
          <div className="grid grid-cols-2 gap-2">
            {utilities.map((u) => (
              <div key={u.id} className="border rounded p-2 text-sm">{u.name}</div>
            ))}
          </div>
        </div>
      )}

      {(data.stuckEntries as unknown[])?.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2">Stuck Entries</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b bg-slate-50 text-left">
                  <th className="p-1 font-medium">Entry ID</th>
                  <th className="p-1 font-medium">Status</th>
                  <th className="p-1 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {(data.stuckEntries as Array<Record<string, unknown>>).map((e) => (
                  <tr key={String(e.id)} className="border-b">
                    <td className="p-1 font-mono">{String(e.id).slice(0, 8)}</td>
                    <td className="p-1">{String(e.statusId)}</td>
                    <td className="p-1 text-slate-500">{new Date(String(e.updatedAt)).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
