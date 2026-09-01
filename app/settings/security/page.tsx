"use client";

import { useEffect, useState, useCallback } from "react";

interface SecurityData {
  failedLoginSpike: { currentHour: number; avgHourly: number; dailyTotal: number; isSpike: boolean };
  activeSessions: Array<{ id: string; userEmail: string; userRole: string; ipAddress: string | null; userAgent: string | null; createdAt: string; expiresAt: string }>;
  activeSessionCount: number;
  roleChanges: Array<{ id: number; action: string; actorEmail: string | null; targetId: string | null; details: Record<string, unknown> | null; createdAt: string }>;
  registrationFunnel: { active: number; pending: number; deactivated: number };
}

export default function SecurityPage() {
  const [data, setData] = useState<SecurityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/security/overview");
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed");
      setData(json);
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

  if (loading) return <div className="p-6 text-slate-500">Loading security overview...</div>;
  if (error) return <div className="p-6 text-red-600">Error: {error}</div>;
  if (!data) return <div className="p-6 text-red-600">Failed to load</div>;

  return (
    <div className="p-4 space-y-6">
      <h2 className="text-lg font-bold">Security &amp; Auth</h2>

      <div className="grid grid-cols-4 gap-3">
        <div className={`border rounded p-3 ${data.failedLoginSpike.isSpike ? "border-red-300 bg-red-50" : ""}`}>
          <div className="text-xs text-slate-500">Failed logins (1h)</div>
          <div className="text-2xl font-bold">{data.failedLoginSpike.currentHour}</div>
          <div className="text-xs text-slate-400">Avg: {data.failedLoginSpike.avgHourly}/h</div>
          {data.failedLoginSpike.isSpike && <div className="text-xs text-red-600 font-medium mt-1">SPIKE DETECTED</div>}
        </div>
        <div className="border rounded p-3">
          <div className="text-xs text-slate-500">Active Sessions</div>
          <div className="text-2xl font-bold">{data.activeSessionCount}</div>
        </div>
        <div className="border rounded p-3">
          <div className="text-xs text-slate-500">Role Changes (7d)</div>
          <div className="text-2xl font-bold">{data.roleChanges.length}</div>
        </div>
        <div className="border rounded p-3">
          <div className="text-xs text-slate-500">Users</div>
          <div className="flex gap-2 text-sm mt-1">
            <span className="text-green-700">{data.registrationFunnel.active} active</span>
            <span className="text-yellow-700">{data.registrationFunnel.pending} pending</span>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">Active Sessions ({data.activeSessions.length})</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b bg-slate-50 text-left">
                <th className="p-2 font-medium">User</th>
                <th className="p-2 font-medium">Role</th>
                <th className="p-2 font-medium">IP</th>
                <th className="p-2 font-medium">User Agent</th>
                <th className="p-2 font-medium">Login</th>
              </tr>
            </thead>
            <tbody>
              {data.activeSessions.map((s) => (
                <tr key={s.id} className="border-b hover:bg-slate-50">
                  <td className="p-2">{s.userEmail}</td>
                  <td className="p-2">{s.userRole}</td>
                  <td className="p-2 font-mono text-slate-500">{s.ipAddress || "-"}</td>
                  <td className="p-2 text-slate-500 max-w-xs truncate">{s.userAgent || "-"}</td>
                  <td className="p-2 text-slate-500">{new Date(s.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">Recent Role Changes</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b bg-slate-50 text-left">
                <th className="p-2 font-medium">When</th>
                <th className="p-2 font-medium">Actor</th>
                <th className="p-2 font-medium">Target ID</th>
                <th className="p-2 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {data.roleChanges.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="p-2 text-slate-500">{new Date(r.createdAt).toLocaleString()}</td>
                  <td className="p-2">{r.actorEmail || "-"}</td>
                  <td className="p-2 font-mono">{r.targetId || "-"}</td>
                  <td className="p-2 text-slate-500">{r.details ? JSON.stringify(r.details) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
