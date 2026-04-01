"use client";

import { useEffect, useMemo, useState } from "react";

type PendingUser = {
  id: string;
  name: string;
  email: string;
  organisation: string | null;
  registrationDate: string;
  datasetRequired: string | null;
  dataAccessReason: string | null;
  status: "pending";
};

type Decision = "activate" | "reject";

export default function PendingUserDecisionPanel() {
  const [items, setItems] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [decisionState, setDecisionState] = useState<Record<string, string>>(
    {},
  );
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});

  async function loadPendingUsers() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/settings/users/pending", {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message || "Unable to load pending users.");
      }

      const body = (await response.json()) as { items?: PendingUser[] };
      setItems(Array.isArray(body.items) ? body.items : []);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to load pending users.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPendingUsers();
  }, []);

  async function decide(userId: string, decision: Decision) {
    setDecisionState((prev) => ({ ...prev, [userId]: "Saving..." }));

    try {
      const response = await fetch(`/api/settings/users/${userId}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          decision,
          rejectionReason:
            decision === "reject" ? rejectReason[userId] : undefined,
        }),
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.message || "Unable to apply decision.");
      }

      setDecisionState((prev) => ({ ...prev, [userId]: "Saved" }));
      setItems((prev) => prev.filter((item) => item.id !== userId));
    } catch (e) {
      setDecisionState((prev) => ({
        ...prev,
        [userId]: e instanceof Error ? e.message : "Unable to apply decision.",
      }));
    }
  }

  const sortedItems = useMemo(
    () =>
      [...items].sort((a, b) =>
        a.registrationDate.localeCompare(b.registrationDate),
      ),
    [items],
  );

  return (
    <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">
          Pending User Decisions
        </h2>
        <button
          type="button"
          onClick={() => void loadPendingUsers()}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      {loading && (
        <p className="text-sm text-slate-600">Loading pending users...</p>
      )}

      {!loading && error && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      {!loading && !error && sortedItems.length === 0 && (
        <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">
          No pending users found.
        </p>
      )}

      {!loading && !error && sortedItems.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-225 text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                <th className="px-2 py-2">Name</th>
                <th className="px-2 py-2">Email</th>
                <th className="px-2 py-2">Organisation</th>
                <th className="px-2 py-2">Registered</th>
                <th className="px-2 py-2">Dataset Required</th>
                <th className="px-2 py-2">Data Access Reason</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-slate-100 align-top"
                >
                  <td className="px-2 py-3">{item.name}</td>
                  <td className="px-2 py-3">{item.email}</td>
                  <td className="px-2 py-3">{item.organisation || "-"}</td>
                  <td className="px-2 py-3">
                    {new Date(item.registrationDate).toLocaleString()}
                  </td>
                  <td className="px-2 py-3">{item.datasetRequired || "-"}</td>
                  <td className="px-2 py-3">{item.dataAccessReason || "-"}</td>
                  <td className="px-2 py-3">
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => void decide(item.id, "activate")}
                        className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                      >
                        Activate
                      </button>
                      <input
                        type="text"
                        value={rejectReason[item.id] || ""}
                        onChange={(e) =>
                          setRejectReason((prev) => ({
                            ...prev,
                            [item.id]: e.target.value,
                          }))
                        }
                        placeholder="Rejection reason"
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => void decide(item.id, "reject")}
                        className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
                      >
                        Reject
                      </button>
                      {decisionState[item.id] && (
                        <p className="text-xs text-slate-600">
                          {decisionState[item.id]}
                        </p>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
