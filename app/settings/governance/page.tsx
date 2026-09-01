"use client";

import { useEffect, useState } from "react";

interface GovernanceDataItem {
  dlDefId: number;
  dlDef: string;
  value: string;
  unit?: string;
  type?: string;
}

interface GovernanceUtility {
  utility: string;
  utilityId: number;
  utilityAcronym: string;
  data: GovernanceDataItem[];
}

export default function GovernancePage() {
  const [list, setList] = useState<GovernanceUtility[]>([]);
  const [loading, setLoading] = useState(true);
  const [openUtility, setOpenUtility] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/data-entry/governance")
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
    await fetch("/api/data-entry/governance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dlDefId, utilityId, value }),
    });
    setList((prev) =>
      prev.map((u) =>
        u.utilityId === utilityId
          ? {
              ...u,
              data: u.data.map((d) =>
                d.dlDefId === dlDefId ? { ...d, value } : d,
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
      <h2 className="text-lg font-bold mb-4">Governance Data Entry</h2>
      <div className="space-y-1">
        {list.map((u) => (
          <div key={u.utilityId} className="border rounded-md">
            <button
              onClick={() =>
                setOpenUtility(
                  openUtility === String(u.utilityId)
                    ? null
                    : String(u.utilityId),
                )
              }
              className="w-full text-left p-3 font-medium hover:bg-slate-50 flex justify-between items-center"
            >
              <span>{u.utilityAcronym}</span>
              <span className="text-slate-400 text-xs">
                {openUtility === String(u.utilityId) ? "−" : "+"}
              </span>
            </button>
            {openUtility === String(u.utilityId) && (
              <div className="p-3 border-t space-y-3">
                {u.data.map((d) => (
                  <div key={d.dlDefId} className="flex items-center gap-3">
                    <label className="text-sm font-medium min-w-[200px]">
                      {d.dlDef}
                      {d.type && (
                        <span className="text-xs text-slate-400 block">
                          {d.type}
                        </span>
                      )}
                    </label>
                    <select
                      value={d.value}
                      onChange={(e) =>
                        updateValue(u.utilityId, d.dlDefId, e.target.value)
                      }
                      disabled={saving === `${u.utilityId}-${d.dlDefId}`}
                      className="border rounded px-2 py-1 text-sm"
                    >
                      <option value="No">No</option>
                      <option value="Yes">Yes</option>
                    </select>
                    {d.unit && (
                      <span className="text-xs text-slate-400">{d.unit}</span>
                    )}
                    {saving === `${u.utilityId}-${d.dlDefId}` && (
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
