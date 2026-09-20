"use client";

import { useEffect, useState, useCallback } from "react";
import {
  planAllKpiCompute,
  computeKpiChunk,
} from "@/app/settings/kpi/unified-formula-service";

// Drive the batch client-side in small per-KPI × period-chunk calls so the
// server never runs one long in-process operation (the failure that caused the
// 502 outage). Each call is bounded and returns before the next begins.
const PERIOD_CHUNK = 20;

interface RecomputeProgress {
  running: boolean;
  finished: boolean;
  done: number; // KPIs completed
  total: number; // KPIs to do
  processed: number; // values computed
  failed: number;
  error: string | null;
}

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
  const [recompute, setRecompute] = useState<RecomputeProgress | null>(null);

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

  const runRecomputeAll = async () => {
    if (recompute?.running) return;
    setRecompute({ running: true, finished: false, done: 0, total: 0, processed: 0, failed: 0, error: null });
    try {
      const plan = await planAllKpiCompute();
      const total = plan.kpis.length;
      let processed = 0;
      let failed = 0;
      let done = 0;
      setRecompute({ running: true, finished: false, done, total, processed, failed, error: null });
      for (const k of plan.kpis) {
        for (let i = 0; i < plan.periodIds.length; i += PERIOD_CHUNK) {
          const chunk = plan.periodIds.slice(i, i + PERIOD_CHUNK);
          try {
            const r = await computeKpiChunk({
              kpiDefId: k.kpiDefId,
              reportPeriodIds: chunk,
              refreshMeasures: k.refreshMeasures,
            });
            processed += r.processed ?? 0;
            failed += r.failed ?? 0;
          } catch {
            failed += chunk.length;
          }
        }
        done += 1;
        setRecompute({ running: true, finished: false, done, total, processed, failed, error: null });
      }
      setRecompute({ running: false, finished: true, done, total, processed, failed, error: null });
      fetchData();
    } catch (e) {
      setRecompute((prev) => ({
        running: false,
        finished: true,
        done: prev?.done ?? 0,
        total: prev?.total ?? 0,
        processed: prev?.processed ?? 0,
        failed: prev?.failed ?? 0,
        error: e instanceof Error ? e.message : "Recompute failed",
      }));
    }
  };

  const statusBadge = (s: string) => {
    const colors: Record<string, string> = {
      completed: "bg-success/10 text-success",
      failed: "bg-danger/10 text-danger",
      in_progress: "bg-blue-100 text-blue-800",
      pending: "bg-yellow-100 text-yellow-800",
    };
    return `px-2 py-0.5 rounded text-xs font-medium ${colors[s] || "bg-slate-100"}`;
  };

  if (loading) return <div className="p-6 text-slate-500">Loading KPI calc status...</div>;
  if (error) return <div className="p-6 text-danger">Error: {error}</div>;

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
          className="px-3 py-1 text-xs bg-danger/10 text-danger rounded hover:bg-danger/20 disabled:opacity-40"
        >
          Retry All Failed
        </button>
        <button
          onClick={runRecomputeAll}
          disabled={recompute?.running}
          title="Recompute every active KPI that has a formula and inputs, across all participating periods. Runs in small chunks so it can't overload the server. KPIs whose inputs are present get a value; the rest stay missing-input. Keep this tab open until it finishes."
          className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40"
        >
          {recompute?.running
            ? `Recomputing… ${recompute.done}/${recompute.total}`
            : "Recompute all KPIs with inputs"}
        </button>
        {recompute && (recompute.running || recompute.finished) && (
          <span className="self-center text-xs text-slate-600">
            {recompute.running &&
              `KPI ${recompute.done}/${recompute.total} · ${recompute.processed} computed — keep this tab open`}
            {recompute.finished && !recompute.error &&
              `✓ recomputed ${recompute.processed}${recompute.failed ? ` · ${recompute.failed} failed` : ""}`}
            {recompute.finished && recompute.error && `✗ ${recompute.error}`}
          </span>
        )}
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
                <td className="p-2 text-danger max-w-xs truncate">{a.failureReason || "-"}</td>
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
