"use client";

import { useEffect, useState, useCallback } from "react";

interface Attempt {
  id: string;
  kpiDefId: number | null;
  reportPeriodId: number;
  status: string;
  retryCount: number;
  failureReason: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export default function KpiHealthPage() {
  const [data, setData] = useState<{ attempts: Attempt[]; summary: Record<string, number> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [retrying, setRetrying] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "100" });
    if (statusFilter) params.set("status", statusFilter);
    try {
      const res = await fetch(`/api/kpi/calculation-status?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to load");
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void (async () => {
      await fetchData();
    })();
  }, [fetchData]);

  const retryFailed = async () => {
    if (!data) return;
    const failedIds = data.attempts.filter((a) => a.status === "failed").map((a) => a.id);
    if (failedIds.length === 0) return;
    setRetrying(true);
    await fetch("/api/kpi/calculation-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attemptIds: failedIds }),
    });
    setRetrying(false);
    fetchData();
  };

  const retryOne = async (id: string) => {
    await fetch("/api/kpi/calculation-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attemptIds: [id] }),
    });
    fetchData();
  };

  const statusBadge = (s: string) => {
    const colors: Record<string, string> = {
      completed: "bg-green-100 text-green-800",
      failed: "bg-red-100 text-red-800",
      in_progress: "bg-blue-100 text-blue-800",
      pending: "bg-yellow-100 text-yellow-800",
    };
    return `px-2 py-0.5 rounded text-xs font-medium ${colors[s] || "bg-slate-100"}`;
  };

  if (loading) return <div className="p-6 text-slate-500">Loading KPI calc status...</div>;
  if (error) return <div className="p-6 text-red-600">Error: {error}</div>;

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-bold">KPI Calculation Health</h2>

      <div className="flex gap-3 text-sm">
        {Object.entries(data?.summary ?? {}).map(([k, v]) => (
          <div key={k} className="px-3 py-1.5 rounded bg-slate-100">
            <span className="font-medium">{k}:</span> {v}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-2 py-1 text-sm border rounded">
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="failed">Failed</option>
          <option value="completed">Completed</option>
        </select>
        <button
          onClick={retryFailed}
          disabled={retrying || !data?.attempts.some((a) => a.status === "failed")}
          className="px-3 py-1 text-xs bg-red-100 text-red-800 rounded hover:bg-red-200 disabled:opacity-40"
        >
          Retry All Failed
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b bg-slate-50 text-left">
              <th className="p-2 font-medium">KPI Def</th>
              <th className="p-2 font-medium">Period</th>
              <th className="p-2 font-medium">Status</th>
              <th className="p-2 font-medium">Retries</th>
              <th className="p-2 font-medium">Error</th>
              <th className="p-2 font-medium">Created</th>
              <th className="p-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {data?.attempts.map((a) => (
              <tr key={a.id} className="border-b hover:bg-slate-50">
                <td className="p-2">{a.kpiDefId ?? "-"}</td>
                <td className="p-2">{a.reportPeriodId}</td>
                <td className="p-2"><span className={statusBadge(a.status)}>{a.status}</span></td>
                <td className="p-2">{a.retryCount}</td>
                <td className="p-2 text-red-600 max-w-xs truncate">{a.failureReason || "-"}</td>
                <td className="p-2 text-slate-500">{new Date(a.createdAt).toLocaleString()}</td>
                <td className="p-2">
                  {a.status === "failed" && (
                    <button onClick={() => retryOne(a.id)} className="px-2 py-0.5 text-xs border rounded hover:bg-slate-100">Retry</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
