"use client";

import { useEffect, useState } from "react";

interface ConfigVar {
  key: string;
  status: "set" | "unset";
  preview: string;
  exampleValue: string;
}

interface ConfigFlag {
  name: string;
  enabled: boolean;
}

interface ConfigResponse {
  vars: ConfigVar[];
  flags: ConfigFlag[];
  missingFromExample: string[];
}

export default function ConfigPage() {
  const [data, setData] = useState<ConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    fetch("/api/dev/config")
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 403 ? "DEV access required" : "Failed to load config");
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6 text-slate-500">Loading configuration...</div>;
  if (error) return <div className="p-6 text-danger">Error: {error}</div>;
  if (!data) return null;

  const filtered = filter
    ? data.vars.filter((v) => v.key.toLowerCase().includes(filter.toLowerCase()))
    : data.vars;

  const setCount = data.vars.filter((v) => v.status === "set").length;
  const unsetCount = data.vars.filter((v) => v.status === "unset").length;

  return (
    <div className="p-4 space-y-6">
      <h2 className="text-lg font-bold">Environment Configuration</h2>

      <div className="flex gap-4 text-sm">
        <div className="px-3 py-1.5 rounded bg-success/10 text-success font-medium">
          {setCount} set
        </div>
        <div className="px-3 py-1.5 rounded bg-yellow-100 text-yellow-800 font-medium">
          {unsetCount} unset
        </div>
        {data.missingFromExample.length > 0 && (
          <div className="px-3 py-1.5 rounded bg-danger/10 text-danger font-medium">
            {data.missingFromExample.length} missing from .env.example
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {data.flags.map((flag) => (
          <div
            key={flag.name}
            className={`px-3 py-1 rounded-full text-xs font-medium ${
              flag.enabled
                ? "bg-success/10 text-success"
                : "bg-slate-100 text-slate-500"
            }`}
          >
            {flag.enabled ? "ON" : "OFF"} {flag.name}
          </div>
        ))}
      </div>

      {data.missingFromExample.length > 0 && (
        <div className="rounded border border-danger/40 bg-danger/10 p-3">
          <p className="text-sm font-medium text-danger mb-1">
            Missing from .env.example
          </p>
          <p className="text-xs text-danger font-mono">
            {data.missingFromExample.join(", ")}
          </p>
        </div>
      )}

      <div className="flex gap-2 items-center">
        <input
          type="text"
          placeholder="Filter variables..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-3 py-1.5 text-sm border rounded w-64"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b bg-slate-50 text-left">
              <th className="p-2 font-medium w-[1%]">Status</th>
              <th className="p-2 font-medium">Key</th>
              <th className="p-2 font-medium">Value</th>
              <th className="p-2 font-medium">Example</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((v) => (
              <tr key={v.key} className="border-b hover:bg-slate-50">
                <td className="p-2">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      v.status === "set"
                        ? "bg-success/10 text-success"
                        : "bg-yellow-100 text-yellow-800"
                    }`}
                  >
                    {v.status === "set" ? "Set" : "Unset"}
                  </span>
                </td>
                <td className="p-2 font-mono text-xs">{v.key}</td>
                <td className="p-2 font-mono text-xs max-w-xs truncate" title={v.preview}>
                  {v.preview}
                </td>
                <td className="p-2 font-mono text-xs text-slate-400">
                  {v.exampleValue}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
