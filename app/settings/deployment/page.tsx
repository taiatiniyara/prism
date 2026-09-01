"use client";

import { useEffect, useState } from "react";

interface DeployInfo {
  commitSha: string;
  nodeVersion: string;
  uptimeSeconds: number;
  aiCircuitState: {
    sonnet: { open: boolean; remaining: number };
    haiku: { open: boolean; remaining: number };
  };
}

export default function DeploymentPage() {
  const [data, setData] = useState<DeployInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/deployment/info")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6 text-slate-500">Loading deployment info...</div>;
  if (!data) return null;

  const formatUptime = (s: number) => {
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${d}d ${h}h ${m}m`;
  };

  const circuitBadge = (state: { open: boolean; remaining: number }) =>
    state.open
      ? `bg-red-100 text-red-800`
      : `bg-green-100 text-green-800`;

  return (
    <div className="p-4 space-y-6">
      <h2 className="text-lg font-bold">Deployment</h2>

      <div className="grid grid-cols-4 gap-3">
        <div className="border rounded p-3">
          <div className="text-xs text-slate-500">Commit</div>
          <div className="text-sm font-mono font-bold">{data.commitSha}</div>
        </div>
        <div className="border rounded p-3">
          <div className="text-xs text-slate-500">Node.js</div>
          <div className="text-sm font-mono">{data.nodeVersion}</div>
        </div>
        <div className="border rounded p-3">
          <div className="text-xs text-slate-500">Uptime</div>
          <div className="text-sm font-bold">{formatUptime(data.uptimeSeconds)}</div>
        </div>
        <div className="border rounded p-3">
          <div className="text-xs text-slate-500">Environment</div>
          <div className="text-sm">{process.env.NODE_ENV ?? "development"}</div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">AI Circuit Breakers</h3>
        <div className="flex gap-4">
          {Object.entries(data.aiCircuitState ?? {}).map(([model, state]) => (
            <div key={model} className={`border rounded p-3 ${circuitBadge(state)}`}>
              <div className="text-xs font-medium">{model}</div>
              <div className="text-sm font-bold mt-1">
                {state.open ? `OPEN (${state.remaining}s)` : "Closed"}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
