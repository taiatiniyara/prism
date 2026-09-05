"use client";

import React, { useEffect, useState, useCallback } from "react";

interface AuditEvent {
  id: number;
  action: string;
  actorEmail: string | null;
  actorRole: string | null;
  targetType: string;
  targetId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

export default function AuditLogsPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(pageSize), offset: String(page * pageSize) });
    if (actionFilter) params.set("action", actionFilter);
    if (actorFilter) params.set("actor", actorFilter);
    try {
      const res = await fetch(`/api/logs/audit?${params}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setEvents(data.events);
      setTotal(data.total);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [actionFilter, actorFilter, page]);

  useEffect(() => {
    void (async () => {
      await fetchEvents();
    })();
  }, [fetchEvents]);

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const exportCSV = () => {
    const params = new URLSearchParams({ format: "csv" });
    if (actionFilter) params.set("action", actionFilter);
    if (actorFilter) params.set("actor", actorFilter);
    window.open(`/api/logs/audit?${params}`, "_blank");
  };

  const actionBadge = (action: string) => {
    let color = "bg-slate-100 text-slate-700";
    if (action.startsWith("auth.")) color = "bg-purple-100 text-purple-800";
    else if (action.startsWith("user.")) color = "bg-blue-100 text-blue-800";
    else if (action.startsWith("data_entry.")) color = "bg-success/10 text-success";
    else if (action.startsWith("settings.")) color = "bg-orange-100 text-orange-800";
    else if (action.startsWith("migration.")) color = "bg-cyan-100 text-cyan-800";
    return `inline-block px-2 py-0.5 rounded text-xs font-medium ${color}`;
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Audit Logs</h2>
        <span className="text-sm text-slate-500">{total} events</span>
      </div>

      <div className="flex gap-2">
        <select
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(0); }}
          className="px-2 py-1 text-sm border rounded"
        >
          <option value="">All actions</option>
          <option value="auth.">Auth</option>
          <option value="user.">User management</option>
          <option value="data_entry.">Data entry</option>
          <option value="settings.">Settings</option>
          <option value="migration.">Migration</option>
        </select>
        <input
          type="text"
          placeholder="Filter by actor email..."
          value={actorFilter}
          onChange={(e) => { setActorFilter(e.target.value); setPage(0); }}
          className="px-2 py-1 text-sm border rounded w-56"
        />
        <button
          onClick={() => { setActionFilter(""); setActorFilter(""); setPage(0); }}
          className="px-3 py-1 text-xs border rounded hover:bg-slate-50"
        >
          Clear
        </button>
        <div className="flex-1" />
        <button
          onClick={exportCSV}
          className="px-3 py-1 text-xs border rounded hover:bg-slate-50"
        >
          Export CSV
        </button>
      </div>

      <div className="flex justify-center gap-2 text-sm">
        <button
          onClick={() => setPage(Math.max(0, page - 1))}
          disabled={page === 0}
          className="px-2 py-1 border rounded disabled:opacity-30"
        >
          Prev
        </button>
        <span className="px-2 py-1 text-slate-500">
          {page + 1} / {totalPages || 1}
        </span>
        <button
          onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
          disabled={page >= totalPages - 1}
          className="px-2 py-1 border rounded disabled:opacity-30"
        >
          Next
        </button>
      </div>

      {loading ? (
        <div className="text-slate-500">Loading...</div>
      ) : events.length === 0 ? (
        <div className="text-slate-400 text-center py-8">No audit events found.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b bg-slate-50 text-left">
                <th className="p-2 font-medium w-36">When</th>
                <th className="p-2 font-medium w-36">Action</th>
                <th className="p-2 font-medium w-36">Actor</th>
                <th className="p-2 font-medium">Target</th>
                <th className="p-2 font-medium w-32">IP</th>
                <th className="p-2 font-medium w-16"></th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <React.Fragment key={e.id}>
                  <tr key={e.id} className="border-b hover:bg-slate-50">
                    <td className="p-2 text-xs text-slate-500 whitespace-nowrap">
                      {new Date(e.createdAt).toLocaleString()}
                    </td>
                    <td className="p-2">
                      <span className={actionBadge(e.action)}>{e.action}</span>
                    </td>
                    <td className="p-2 text-xs">
                      {e.actorEmail ? (
                        <span>
                          {e.actorEmail}
                          {e.actorRole && (
                            <span className="text-slate-400 ml-1">({e.actorRole})</span>
                          )}
                        </span>
                      ) : "-"}
                    </td>
                    <td className="p-2 text-xs">
                      {e.targetType}{e.targetId ? ` #${e.targetId}` : ""}
                    </td>
                    <td className="p-2 text-xs text-slate-400 font-mono">{e.ipAddress || "-"}</td>
                    <td className="p-2">
                      {e.details && (
                        <button
                          onClick={() => toggleExpand(e.id)}
                          className="px-2 py-0.5 text-xs border rounded hover:bg-slate-100"
                        >
                          {expanded.has(e.id) ? "Hide" : "Details"}
                        </button>
                      )}
                    </td>
                  </tr>
                  {expanded.has(e.id) && e.details && (
                    <tr key={`${e.id}-detail`}>
                      <td colSpan={6} className="p-3 bg-slate-50">
                        <pre className="text-xs whitespace-pre-wrap">
                          {JSON.stringify(e.details, null, 2)}
                        </pre>
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
