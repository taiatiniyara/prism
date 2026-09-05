"use client";

import { useEffect, useState, useCallback } from "react";

interface BackupData {
  lastBackup: { at: string; sizeBytes: number | null; ageHours: number; success: boolean; message: string | null } | null;
  backupOk: boolean;
  backupAgeWarnHours: number;
  tableSizes: Array<{ name: string; rowEstimate: number }>;
  orphans: { staleSessions: number };
}

export default function BackupPage() {
  const [data, setData] = useState<BackupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/backup/status");
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

  if (loading) return <div className="p-6 text-slate-500">Loading backup status...</div>;
  if (error) return <div className="p-6 text-danger">Error: {error}</div>;
  if (!data) return null;

  const ageColor = !data.lastBackup ? "bg-danger/10 text-danger" :
    data.lastBackup.ageHours > Number(data.backupAgeWarnHours) ? "bg-yellow-100 text-yellow-800" : "bg-success/10 text-success";

  const formatSize = (bytes: number | null) => {
    if (bytes == null) return "unknown";
    if (bytes > 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
    if (bytes > 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
    return `${(bytes / 1e3).toFixed(1)} KB`;
  };

  return (
    <div className="p-4 space-y-6">
      <h2 className="text-lg font-bold">Backup &amp; Data Integrity</h2>

      <div className="grid grid-cols-3 gap-3">
        <div className={`border rounded p-3 ${ageColor}`}>
          <div className="text-xs text-slate-500">Last Backup</div>
          <div className="text-lg font-bold">
            {data.lastBackup ? `${data.lastBackup.ageHours}h ago` : "Never"}
          </div>
          {data.lastBackup && (
            <div className="text-xs text-slate-400">
              {new Date(data.lastBackup.at).toLocaleString()} &middot; {formatSize(data.lastBackup.sizeBytes)}
            </div>
          )}
        </div>
        <div className="border rounded p-3">
          <div className="text-xs text-slate-500">Warn Threshold</div>
          <div className="text-lg font-bold">{String(data.backupAgeWarnHours)}h</div>
        </div>
        <div className={`border rounded p-3 ${data.orphans.staleSessions > 0 ? "border-yellow-300 bg-yellow-50" : ""}`}>
          <div className="text-xs text-slate-500">Stale Sessions</div>
          <div className="text-lg font-bold">{data.orphans.staleSessions}</div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">Table Sizes (top 20)</h3>
        {data.tableSizes.length === 0 ? (
          <div className="text-xs text-slate-400">Unable to query table statistics</div>
        ) : (
          <div className="space-y-1">
            {data.tableSizes.map((t) => (
              <div key={t.name} className="text-xs flex items-center gap-2">
                <span className="w-32 truncate">{t.name}</span>
                <span className="text-slate-400 w-16 text-right">{t.rowEstimate.toLocaleString()}</span>
                <div className="flex-1 bg-slate-100 rounded h-3">
                  <div
                    className="bg-blue-400 h-3 rounded"
                    style={{ width: `${Math.min(100, (t.rowEstimate / Math.max(1, data.tableSizes[0]?.rowEstimate ?? 1)) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
