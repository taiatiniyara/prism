"use client";

import { useEffect, useState } from "react";

interface TraceItem {
  traceId: string;
  status: string;
  latencyMs: number;
  createdAt: string;
  retainedUntil: string;
}

export default function AiTracesPage() {
  const [items, setItems] = useState<TraceItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        const response = await fetch("/api/ai/traces", { method: "GET" });
        const body = (await response.json()) as {
          items?: TraceItem[];
          message?: string;
        };

        if (!response.ok) {
          setError(body.message ?? "Unable to load traces.");
          return;
        }

        setItems(body.items ?? []);
      } catch {
        setError("Unable to load traces.");
      }
    };

    void run();
  }, []);

  return (
    <main className="mx-auto w-full max-w-5xl p-6">
      <h1 className="mb-4 text-2xl font-semibold text-slate-900">
        AI Trace Logs
      </h1>
      {error ? <p className="mb-4 text-sm text-rose-700">{error}</p> : null}
      <div className="rounded-md border border-slate-200 bg-white p-4">
        <ul className="space-y-2 text-sm text-slate-800">
          {items.map((item) => (
            <li
              key={item.traceId}
              className="rounded border border-slate-100 p-2"
            >
              <div>Trace: {item.traceId}</div>
              <div>Status: {item.status}</div>
              <div>Latency: {item.latencyMs}ms</div>
            </li>
          ))}
          {!items.length && !error ? <li>No traces yet.</li> : null}
        </ul>
      </div>
    </main>
  );
}
