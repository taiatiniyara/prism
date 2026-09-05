"use client";

import { useEffect, useState } from "react";

interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

function useFetch<T>(url: string): FetchState<T> {
  const [state, setState] = useState<FetchState<T>>({ data: null, loading: true, error: null });
  useEffect(() => {
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((e) => setState({ data: null, loading: false, error: e.message }));
  }, [url]);
  return state;
}

function Card({ title, children, href }: { title: string; children: React.ReactNode; href?: string }) {
  return (
    <div className="border rounded p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">{title}</div>
        {href && <a href={href} className="text-xs text-info hover:underline">View</a>}
      </div>
      {children}
    </div>
  );
}

function SkeletonCard() {
  return <div className="border rounded p-4 animate-pulse"><div className="h-4 bg-slate-200 rounded w-3/4 mb-2" /><div className="h-8 bg-slate-200 rounded w-1/2" /></div>;
}

export default function OverviewPage() {
  const health = useFetch<{ status: string; checks: Record<string, { ok: boolean }> }>("/api/health");
  const security = useFetch<{ activeSessionCount: number; failedLoginSpike: { isSpike: boolean } }>("/api/security/overview");
  const deployment = useFetch<{ commitSha: string; uptimeSeconds: number }>("/api/deployment/info");
  const backup = useFetch<{ backupOk: boolean; lastBackup: { ageHours: number; at: string } | null }>("/api/backup/status");

  const formatUptime = (s: number) => {
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    return `${d}d ${h}h`;
  };

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-bold">Overview</h2>

      <div className="grid grid-cols-2 gap-4">
        <Card title="System Health" href="/settings/config">
          {health.loading ? <SkeletonCard /> : health.data ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${health.data.status === "ok" ? "bg-green-500" : health.data.status === "down" ? "bg-danger" : "bg-yellow-500"}`} />
                <span className="text-sm font-medium capitalize">{health.data.status}</span>
              </div>
              {Object.entries(health.data?.checks ?? {}).slice(0, 5).map(([k, v]) => (
                <div key={k} className="flex items-center gap-2 text-xs ml-4">
                  <span className={`w-1.5 h-1.5 rounded-full ${(v as { ok: boolean }).ok ? "bg-green-400" : "bg-red-400"}`} />
                  <span className="text-slate-600">{k}</span>
                </div>
              ))}
            </div>
          ) : <span className="text-xs text-danger">Failed</span>}
        </Card>

        <Card title="Security" href="/settings/security">
          {security.loading ? <SkeletonCard /> : security.data ? (
            <div className="space-y-1">
              <div className="text-2xl font-bold">{security.data.activeSessionCount} <span className="text-sm font-normal text-slate-500">active</span></div>
              {security.data.failedLoginSpike.isSpike && (
                <div className="text-xs text-danger font-medium">Login spike detected</div>
              )}
            </div>
          ) : <span className="text-xs text-danger">Failed</span>}
        </Card>

        <Card title="Deployment" href="/settings/deployment">
          {deployment.loading ? <SkeletonCard /> : deployment.data ? (
            <div className="space-y-1 text-sm">
              <div>Commit: <span className="font-mono font-medium">{deployment.data.commitSha}</span></div>
              <div>Uptime: <span className="font-medium">{formatUptime(deployment.data.uptimeSeconds)}</span></div>
            </div>
          ) : <span className="text-xs text-danger">Failed</span>}
        </Card>

        <Card title="Backup" href="/settings/backup">
          {backup.loading ? <SkeletonCard /> : backup.data ? (
            <div className="space-y-1">
              <div className={`text-sm font-medium ${backup.data.backupOk ? "text-green-700" : "text-danger"}`}>
                {backup.data.backupOk ? "Healthy" : "Warning"}
              </div>
              {backup.data.lastBackup && (
                <div className="text-xs text-slate-500">
                  Last: {backup.data.lastBackup.ageHours}h ago ({new Date(backup.data.lastBackup.at).toLocaleDateString()})
                </div>
              )}
            </div>
          ) : <span className="text-xs text-danger">Failed</span>}
        </Card>

        <Card title="Quick Links">
          <div className="space-y-1 text-sm">
            <div><a href="/settings/config" className="text-info hover:underline">Config</a></div>
            <div><a href="/settings/logs/errors" className="text-info hover:underline">Error Logs</a></div>
            <div><a href="/settings/logs/audit" className="text-info hover:underline">Audit Logs</a></div>
            <div><a href="/settings/ai/usage" className="text-info hover:underline">AI Usage</a></div>
            <div><a href="/settings/costs" className="text-info hover:underline">Costs</a></div>
            <div><a href="/settings/data-pipeline" className="text-info hover:underline">Pipeline</a></div>
            <div><a href="/settings/kpi/health" className="text-info hover:underline">KPI Health</a></div>
            <div><a href="/settings/logs/system" className="text-info hover:underline">System Logs</a></div>
          </div>
        </Card>
      </div>
    </div>
  );
}
