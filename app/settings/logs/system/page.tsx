"use client";

import { useEffect, useState, useRef, useCallback } from "react";

interface LogEntry {
  level: string;
  message: string;
  meta?: Record<string, unknown>;
  timestamp: string;
}

export default function SystemLogsPage() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [levelFilter, setLevelFilter] = useState("");
  const [search, setSearch] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async () => {
    const params = new URLSearchParams({ limit: "200" });
    if (levelFilter) params.set("level", levelFilter);
    if (search) params.set("search", search);
    try {
      const res = await fetch(`/api/logs/system?${params}`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setEntries(data.entries);
    } finally {
      setLoading(false);
    }
  }, [levelFilter, search]);

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries, autoScroll]);

  const levelColor = (level: string) => {
    if (level === "error") return "text-danger";
    if (level === "warn") return "text-yellow-600";
    if (level === "info") return "text-info";
    return "text-slate-500";
  };

  return (
    <div className="p-4 space-y-3">
      <h2 className="text-lg font-bold">System Logs</h2>

      <div className="flex gap-2">
        <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} className="px-2 py-1 text-sm border rounded">
          <option value="">All levels</option>
          <option value="debug">Debug</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
        </select>
        <input
          type="text" placeholder="Search messages..." value={search}
          onChange={(e) => setSearch(e.target.value)} className="px-2 py-1 text-sm border rounded w-48" />
        <label className="flex items-center gap-1 text-xs cursor-pointer">
          <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} />
          Auto-scroll
        </label>
        <div className="flex-1" />
        <button onClick={fetchLogs} className="px-3 py-1 text-xs border rounded hover:bg-slate-50">Refresh</button>
      </div>

      {loading && entries.length === 0 ? (
        <div className="text-slate-500">Loading...</div>
      ) : (
        <div className="bg-slate-900 text-green-400 font-mono text-xs rounded p-3 max-h-[70vh] overflow-auto">
          {entries.map((e, i) => (
            <div key={i} className="whitespace-pre-wrap break-all leading-relaxed">
              <span className="text-slate-500">[{e.timestamp.slice(11, 19)}]</span>{" "}
              <span className={`font-medium ${levelColor(e.level)}`}>{e.level.toUpperCase()}</span>{" "}
              {e.message}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
