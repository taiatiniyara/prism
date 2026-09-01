"use client";

import { useEffect, useState, useCallback } from "react";

export default function AiUsagePage() {
  const [tab, setTab] = useState<"overview" | "per-user" | "tools" | "models">("overview");
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const type = tab === "overview" ? "overview" : tab === "per-user" ? "per-user" : tab === "tools" ? "tool-analytics" : "model-health";
    try {
      const res = await fetch(`/api/ai/usage?type=${type}&days=${days}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to load");
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [tab, days]);

  useEffect(() => {
    void (async () => {
      await fetchData();
    })();
  }, [fetchData]);

  const formatCost = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const tabs = [
    { key: "overview" as const, label: "Overview" },
    { key: "per-user" as const, label: "Per User" },
    { key: "tools" as const, label: "Tools" },
    { key: "models" as const, label: "Models" },
  ];

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">AI Usage &amp; Cost</h2>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="px-2 py-1 text-sm border rounded">
          <option value={7}>7 days</option>
          <option value={30}>30 days</option>
          <option value={90}>90 days</option>
        </select>
      </div>

      <div className="flex border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 text-sm ${tab === t.key ? "border-b-2 border-blue-600 text-blue-600 font-medium" : "text-slate-500"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? <div className="text-slate-500">Loading...</div> : error ? <div className="p-6 text-red-600">Error: {error}</div> : !data ? null : (
        <>
          {tab === "overview" && (
            <div className="space-y-4">
              <div className="grid grid-cols-5 gap-3">
                {[
                  ["Requests", (data.totals as Record<string, number>)?.requests],
                  ["Tokens In", (data.totals as Record<string, number>)?.tokensIn],
                  ["Tokens Out", (data.totals as Record<string, number>)?.tokensOut],
                  ["Cost", formatCost((data.totals as Record<string, number>)?.costCents ?? 0)],
                  ["Errors", (data.totals as Record<string, number>)?.errors],
                ].map(([label, value]) => (
                  <div key={label} className="border rounded p-3">
                    <div className="text-xs text-slate-500">{label}</div>
                    <div className="text-lg font-bold">{typeof value === "number" ? value.toLocaleString() : value}</div>
                  </div>
                ))}
              </div>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b bg-slate-50 text-left">
                    <th className="p-2">Date</th>
                    <th className="p-2">Requests</th>
                    <th className="p-2">Tokens In</th>
                    <th className="p-2">Tokens Out</th>
                    <th className="p-2">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.daily as Array<Record<string, unknown>>)?.map((d) => (
                    <tr key={String(d.date)} className="border-b">
                      <td className="p-2">{new Date(String(d.date)).toLocaleDateString()}</td>
                      <td className="p-2">{String(d.requests)}</td>
                      <td className="p-2">{Number(d.tokensIn).toLocaleString()}</td>
                      <td className="p-2">{Number(d.tokensOut).toLocaleString()}</td>
                      <td className="p-2">{formatCost(Number(d.costCents))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === "per-user" && (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b bg-slate-50 text-left">
                  <th className="p-2">User</th>
                  <th className="p-2">Requests</th>
                  <th className="p-2">Tokens In</th>
                  <th className="p-2">Tokens Out</th>
                  <th className="p-2">Cost</th>
                  <th className="p-2">Tool Calls</th>
                  <th className="p-2">Errors</th>
                  <th className="p-2">Budget</th>
                </tr>
              </thead>
              <tbody>
                {(data.users as Array<Record<string, unknown>>)?.map((u) => (
                  <tr key={String(u.userId)} className="border-b">
                    <td className="p-2">{String(u.userName || u.userEmail)}</td>
                    <td className="p-2">{String(u.requests)}</td>
                    <td className="p-2">{Number(u.tokensIn).toLocaleString()}</td>
                    <td className="p-2">{Number(u.tokensOut).toLocaleString()}</td>
                    <td className="p-2 font-medium">{formatCost(Number(u.costCents))}</td>
                    <td className="p-2">{String(u.toolCalls)}</td>
                    <td className="p-2">{String(u.errors)}</td>
                    <td className="p-2">{formatCost(Number(u.dailyBudgetCents))}/day</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === "tools" && (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b bg-slate-50 text-left">
                  <th className="p-2">Tool</th>
                  <th className="p-2">Calls</th>
                  <th className="p-2">Errors</th>
                  <th className="p-2">Avg Latency</th>
                </tr>
              </thead>
              <tbody>
                {(data.tools as Array<Record<string, unknown>>)?.map((t) => (
                  <tr key={String(t.toolName)} className="border-b">
                    <td className="p-2 font-mono">{String(t.toolName)}</td>
                    <td className="p-2">{String(t.callCount)}</td>
                    <td className="p-2">{String(t.errorCount)}</td>
                    <td className="p-2">{t.avgLatencyMs ? `${String(t.avgLatencyMs)}ms` : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === "models" && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-3">
                {[
                  ["Sonnet Calls", String((data as Record<string, unknown>).sonnetCount)],
                  ["Haiku (fallback)", String((data as Record<string, unknown>).haikuCount)],
                  ["Fallback Rate", `${String((data as Record<string, unknown>).fallbackRate)}%`],
                  ["Avg Latency", `${String((data as Record<string, unknown>).avgLatencyMs)}ms`],
                ].map(([label, value]) => (
                  <div key={label} className="border rounded p-3">
                    <div className="text-xs text-slate-500">{label}</div>
                    <div className="text-lg font-bold">{value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
