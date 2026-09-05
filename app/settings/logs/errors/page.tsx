"use client";

import React, { useEffect, useState, useCallback } from "react";

interface ErrorEntry {
  id: number;
  source: string;
  errorType: string;
  severity: string;
  message: string;
  stack: string | null;
  context: string | null;
  url: string | null;
  userId: string | null;
  userEmail: string | null;
  userRole: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

interface Stats {
  total: number;
  bySeverity: Record<string, number>;
}

export default function ErrorLogsPage() {
  const [errors, setErrors] = useState<ErrorEntry[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, bySeverity: {} });
  const [loading, setLoading] = useState(true);
  const [severity, setSeverity] = useState("");
  const [source, setSource] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [resolving, setResolving] = useState<Set<number>>(new Set());

  const fetchErrors = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "100" });
    if (severity) params.set("severity", severity);
    if (source) params.set("source", source);
    try {
      const res = await fetch(`/api/logs/errors?${params}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setErrors(data.errors);
      setStats(data.stats);
    } catch {
      setErrors([]);
    } finally {
      setLoading(false);
    }
  }, [severity, source]);

  useEffect(() => {
    void (async () => {
      await fetchErrors();
    })();
  }, [fetchErrors]);

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const markResolved = async (ids: number[]) => {
    setResolving(new Set(ids));
    await fetch("/api/logs/errors", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    setResolving(new Set());
    fetchErrors();
  };

  const severityBadge = (s: string) => {
    const colors: Record<string, string> = {
      critical: "bg-danger/10 text-danger",
      error: "bg-orange-100 text-orange-800",
      warning: "bg-yellow-100 text-yellow-800",
    };
    return `inline-block px-2 py-0.5 rounded text-xs font-medium ${colors[s] || "bg-slate-100 text-slate-700"}`;
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Error Logs</h2>
        <div className="flex gap-2 text-sm">
          {Object.entries(stats?.bySeverity ?? {}).map(([s, count]) => (
            <span key={s} className={severityBadge(s)}>
              {s}: {count}
            </span>
          ))}
          <span className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-700">
            Total: {stats.total}
          </span>
        </div>
      </div>

      <div className="flex gap-2">
        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
          className="px-2 py-1 text-sm border rounded"
        >
          <option value="">All severities</option>
          <option value="critical">Critical</option>
          <option value="error">Error</option>
          <option value="warning">Warning</option>
        </select>
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="px-2 py-1 text-sm border rounded"
        >
          <option value="">All sources</option>
          <option value="server">Server</option>
          <option value="client">Client</option>
        </select>
        <button
          onClick={() => { setSeverity(""); setSource(""); }}
          className="px-3 py-1 text-xs border rounded hover:bg-slate-50"
        >
          Clear filters
        </button>
        <div className="flex-1" />
        <button
          onClick={() => markResolved(errors.filter((e) => !e.resolvedAt).map((e) => e.id))}
          disabled={errors.filter((e) => !e.resolvedAt).length === 0}
          className="px-3 py-1 text-xs bg-slate-100 rounded hover:bg-slate-200 disabled:opacity-40"
        >
          Mark all resolved
        </button>
      </div>

      {loading ? (
        <div className="text-slate-500">Loading errors...</div>
      ) : errors.length === 0 ? (
        <div className="text-slate-400 text-center py-8">No errors found.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b bg-slate-50 text-left">
                <th className="p-2 font-medium w-16">When</th>
                <th className="p-2 font-medium w-16">Severity</th>
                <th className="p-2 font-medium w-20">Source</th>
                <th className="p-2 font-medium">Message</th>
                <th className="p-2 font-medium w-32">User</th>
                <th className="p-2 font-medium w-16"></th>
              </tr>
            </thead>
            <tbody>
              {errors.map((e) => (
                <React.Fragment key={e.id}>
                  <tr key={e.id} className="border-b hover:bg-slate-50">
                    <td className="p-2 text-xs text-slate-500 whitespace-nowrap">
                      {new Date(e.createdAt).toLocaleString()}
                    </td>
                    <td className="p-2">
                      <span className={severityBadge(e.severity)}>{e.severity}</span>
                    </td>
                    <td className="p-2 text-xs">{e.source}</td>
                    <td className="p-2 text-xs max-w-md truncate" title={e.message}>
                      {e.message}
                    </td>
                    <td className="p-2 text-xs text-slate-500 truncate max-w-[150px]">
                      {e.userEmail || "-"}
                    </td>
                    <td className="p-2">
                      <div className="flex gap-1">
                        <button
                          onClick={() => toggleExpand(e.id)}
                          className="px-2 py-0.5 text-xs border rounded hover:bg-slate-100"
                        >
                          {expanded.has(e.id) ? "Hide" : "Details"}
                        </button>
                        {!e.resolvedAt && (
                          <button
                            onClick={() => markResolved([e.id])}
                            disabled={resolving.has(e.id)}
                            className="px-2 py-0.5 text-xs border rounded hover:bg-green-50 disabled:opacity-40"
                          >
                            Resolve
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expanded.has(e.id) && (
                    <tr key={`${e.id}-detail`}>
                      <td colSpan={6} className="p-3 bg-slate-50">
                        <div className="space-y-2 text-xs">
                          <div>
                            <span className="font-medium">Type:</span> {e.errorType}
                            {e.url && <span className="ml-4 font-medium">URL:</span>}
                            {e.url && ` ${e.url}`}
                          </div>
                          {e.stack && (
                            <pre className="whitespace-pre-wrap bg-slate-100 p-2 rounded text-xs max-h-48 overflow-auto">
                              {e.stack}
                            </pre>
                          )}
                          {e.context && (
                            <details>
                              <summary className="cursor-pointer text-slate-500">Context</summary>
                              <pre className="whitespace-pre-wrap bg-slate-100 p-2 rounded text-xs mt-1">
                                {typeof e.context === "string" ? e.context : JSON.stringify(JSON.parse(e.context), null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
