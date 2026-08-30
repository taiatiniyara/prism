"use client";

import { useEffect, useState, useCallback } from "react";

export default function AlertsPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("error");
  const [enabled, setEnabled] = useState(true);
  const [cooldown, setCooldown] = useState(60);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts");
      if (!res.ok) throw new Error("Failed");
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const createRule = async () => {
    await fetch("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, enabled, cooldownMinutes: cooldown }),
    });
    fetchData();
  };

  const markAllRead = async () => {
    await fetch("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "mark-all-read" }),
    });
  };

  if (loading) return <div className="p-6 text-slate-500">Loading alerts...</div>;
  if (!data) return null;

  const rules = (data.rules as Array<Record<string, unknown>>) || [];
  const history = (data.history as Array<Record<string, unknown>>) || [];

  return (
    <div className="p-4 space-y-6">
      <h2 className="text-lg font-bold">Alerting</h2>

      <div className="border rounded p-4 space-y-3">
        <h3 className="text-sm font-medium">Add Alert Rule</h3>
        <div className="flex gap-2 items-end">
          <div>
            <label className="text-xs text-slate-500 block">Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="px-2 py-1 text-sm border rounded">
              <option value="error">Error</option>
              <option value="cost">Cost</option>
              <option value="powerbi">Power BI</option>
              <option value="security">Security</option>
              <option value="backup">Backup</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 block">Cooldown (min)</label>
            <input type="number" value={cooldown} onChange={(e) => setCooldown(Number(e.target.value))} className="px-2 py-1 text-sm border rounded w-20" />
          </div>
          <div className="flex items-center gap-1 pb-0.5">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <label className="text-xs">Enabled</label>
          </div>
          <button onClick={createRule} className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
            Create Rule
          </button>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium">Your Rules</h3>
          <button onClick={markAllRead} className="px-3 py-1 text-xs border rounded hover:bg-slate-50">Mark All Read</button>
        </div>
        {rules.length === 0 ? (
          <div className="text-xs text-slate-400">No rules configured</div>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b bg-slate-50 text-left">
                <th className="p-2">Category</th>
                <th className="p-2">Severity</th>
                <th className="p-2">Cooldown</th>
                <th className="p-2">Status</th>
                <th className="p-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={String(r.id)} className="border-b">
                  <td className="p-2">{String(r.category)}</td>
                  <td className="p-2">{String(r.severityFilter || "all")}</td>
                  <td className="p-2">{String(r.cooldownMinutes)}m</td>
                  <td className="p-2">{r.enabled ? "ON" : "OFF"}</td>
                  <td className="p-2 text-slate-500">{new Date(String(r.createdAt)).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {history.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2">Recent Alert History</h3>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b bg-slate-50 text-left">
                <th className="p-2">When</th>
                <th className="p-2">Message</th>
                <th className="p-2">Dispatched</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => {
                const alertHist = h.alert_history as Record<string, unknown> | undefined;
                return (
                  <tr key={String(alertHist?.id || h.id)} className="border-b">
                    <td className="p-2 text-slate-500 whitespace-nowrap">
                      {new Date(String(alertHist?.triggeredAt)).toLocaleString()}
                    </td>
                    <td className="p-2 text-xs">{String(alertHist?.message || "")}</td>
                    <td className="p-2">{alertHist?.dispatched ? "YES" : "NO"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
