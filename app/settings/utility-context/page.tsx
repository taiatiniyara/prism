"use client";

import { useEffect, useState } from "react";

interface UtilityContextItem {
  dl_def_id: number;
  dl_def: string;
  value: string | null;
  unit?: string;
  type?: string;
}

interface UtilityContextUtility {
  utility: string;
  utility_id: number;
  utilityAcronym: string;
  data: UtilityContextItem[];
}

export default function UtilityContextPage() {
  const [list, setList] = useState<UtilityContextUtility[]>([]);
  const [loading, setLoading] = useState(true);
  const [openUtility, setOpenUtility] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/data-entry/utility-context")
      .then((r) => r.json())
      .then(setList)
      .finally(() => setLoading(false));
  }, []);

  async function updateValue(
    utilityId: number,
    dlDefId: number,
    value: string,
  ) {
    const key = `${utilityId}-${dlDefId}`;
    setSaving(key);
    await fetch("/api/data-entry/utility-context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dl_def_id: dlDefId, utility_id: utilityId, value }),
    });
    setList((prev) =>
      prev.map((u) =>
        u.utility_id === utilityId
          ? {
              ...u,
              data: u.data.map((d) =>
                d.dl_def_id === dlDefId ? { ...d, value } : d,
              ),
            }
          : u,
      ),
    );
    setSaving(null);
  }

  if (loading)
    return <div className="p-6 text-slate-500">Loading...</div>;

  return (
    <div className="p-4">
      <h2 className="text-lg font-bold mb-4">Utility Context Data Entry</h2>
      <div className="space-y-1">
        {list.map((u) => (
          <div key={u.utility_id} className="border rounded-md">
            <button
              onClick={() =>
                setOpenUtility(
                  openUtility === String(u.utility_id)
                    ? null
                    : String(u.utility_id),
                )
              }
              className="w-full text-left p-3 font-medium hover:bg-slate-50 flex justify-between items-center"
            >
              <span>{u.utilityAcronym}</span>
              <span className="text-slate-400 text-xs">
                {openUtility === String(u.utility_id) ? "−" : "+"}
              </span>
            </button>
            {openUtility === String(u.utility_id) && (
              <div className="p-3 border-t grid grid-cols-1 md:grid-cols-2 gap-3">
                {u.data.map((d) => (
                  <div key={d.dl_def_id} className="flex items-center gap-2">
                    <label className="text-sm font-medium flex-1">
                      {d.dl_def}
                      {d.type && (
                        <span className="text-xs text-slate-400 block">
                          {d.type}{d.unit ? ` — ${d.unit}` : ""}
                        </span>
                      )}
                    </label>
                    <input
                      type="text"
                      value={d.value ?? ""}
                      onChange={(e) =>
                        updateValue(u.utility_id, d.dl_def_id, e.target.value)
                      }
                      disabled={saving === `${u.utility_id}-${d.dl_def_id}`}
                      className="border rounded px-2 py-1 text-sm w-32"
                      placeholder="Value"
                    />
                    {saving === `${u.utility_id}-${d.dl_def_id}` && (
                      <span className="text-xs text-amber-500">Saving...</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
