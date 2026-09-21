"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface CostAnomaly {
  date: string;
  costCents: number;
  avg7dCents: number;
  ratio: number;
}

interface CostByUtility {
  utilityId: number;
  utilityName: string;
  spendCents: number;
  requestCount: number;
}

interface CostsData {
  totalSpendCents: number;
  daily: Array<{ date: string; costCents: number }>;
  anomalies: CostAnomaly[];
  byUtility: CostByUtility[];
  budget: {
    dailyLimitCents: number;
    todaySpendCents: number;
    todayOverBudget: boolean;
  };
  days: number;
}

export default function CostsPage() {
  const [data, setData] = useState<CostsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  const requestIdRef = useRef(0);

  const fetchData = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      const res = await fetch(`/api/costs/overview?days=${days}`);
      if (!res.ok) throw new Error("Failed");
      const json = await res.json();
      if (requestIdRef.current !== requestId) return;
      setData(json);
    } catch {
      if (requestIdRef.current !== requestId) return;
      setData(null);
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void (async () => {
      await fetchData();
    })();
  }, [fetchData]);

  const formatCost = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  if (loading) return <div className="p-6 text-slate-500">Loading cost data...</div>;
  if (!data) return <div className="p-6 text-danger">Failed to load cost data.</div>;

  const { budget, anomalies, byUtility } = data;

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Cost &amp; Budget</h2>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="px-2 py-1 text-sm border rounded">
          <option value={7}>7 days</option>
          <option value={30}>30 days</option>
          <option value={90}>90 days</option>
        </select>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className="border rounded p-3">
          <div className="text-xs text-slate-500">Total Spend</div>
          <div className="text-xl font-bold">{formatCost(data.totalSpendCents)}</div>
          <div className="text-xs text-slate-400">{data.days} days</div>
        </div>
        <div className="border rounded p-3">
          <div className="text-xs text-slate-500">Daily Budget</div>
          <div className="text-xl font-bold">{formatCost(budget.dailyLimitCents)}</div>
        </div>
        <div className={`border rounded p-3 ${budget.todayOverBudget ? "border-danger/40 bg-danger/10" : ""}`}>
          <div className="text-xs text-slate-500">Today</div>
          <div className="text-xl font-bold">{formatCost(budget.todaySpendCents)}</div>
          {budget.todayOverBudget && <div className="text-xs text-danger font-medium">OVER BUDGET</div>}
        </div>
        <div className="border rounded p-3">
          <div className="text-xs text-slate-500">Anomalies</div>
          <div className="text-xl font-bold">{anomalies.length}</div>
          <div className="text-xs text-slate-400">2x above 7d avg</div>
        </div>
      </div>

      {anomalies.length > 0 && (
        <div className="border border-danger/40 rounded p-3 bg-danger/10">
          <div className="text-sm font-medium text-danger mb-2">Spend Anomalies</div>
          {anomalies.map((a) => (
            <div key={a.date} className="text-xs text-danger flex gap-4">
              <span>{new Date(a.date).toLocaleDateString()}</span>
              <span className="font-medium">{formatCost(a.costCents)}</span>
              <span>vs avg {formatCost(a.avg7dCents)} ({a.ratio}x)</span>
            </div>
          ))}
        </div>
      )}

      <div>
        <h3 className="text-sm font-medium mb-2">Per-Utility</h3>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b bg-slate-50 text-left">
              <th className="p-2">Utility</th>
              <th className="p-2">Spend</th>
              <th className="p-2">Requests</th>
              <th className="p-2">%</th>
            </tr>
          </thead>
          <tbody>
            {byUtility.map((u) => (
              <tr key={u.utilityId} className="border-b">
                <td className="p-2">{u.utilityName}</td>
                <td className="p-2 font-medium">{formatCost(u.spendCents)}</td>
                <td className="p-2">{u.requestCount}</td>
                <td className="p-2">{data.totalSpendCents > 0 ? Math.round((u.spendCents / data.totalSpendCents) * 100) : 0}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
