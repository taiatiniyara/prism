"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Send, MailOpen, Mail, FileText } from "lucide-react";

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

type ClarificationMessage = {
  id: number;
  userId: string;
  actorUserId: string;
  actorName: string | null;
  actorEmail: string | null;
  direction: "outbound" | "inbound";
  subject: string | null;
  message: string;
  receivedFromEmail: string | null;
  createdAt: string;
};

export default function PendingUserDecisionPanel() {
  const [items, setItems] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [decisionState, setDecisionState] = useState<Record<string, string>>(
    {},
  );
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [rejectDialogUserId, setRejectDialogUserId] = useState<string | null>(
    null,
  );
  const [conversationDialogUserId, setConversationDialogUserId] = useState<
    string | null
  >(null);
  const [clarificationHistory, setClarificationHistory] = useState<
    Record<string, ClarificationMessage[]>
  >({});
  const [clarificationHistoryState, setClarificationHistoryState] = useState<
    Record<string, string>
  >({});
  const [clarificationSubject, setClarificationSubject] = useState<
    Record<string, string>
  >({});
  const [clarificationBody, setClarificationBody] = useState<
    Record<string, string>
  >({});
  const [responseSubject, setResponseSubject] = useState<
    Record<string, string>
  >({});
  const [responseEmail, setResponseEmail] = useState<Record<string, string>>(
    {},
  );
  const [responseBody, setResponseBody] = useState<Record<string, string>>({});

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

  async function decide(userId: string, decision: Decision): Promise<boolean> {
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
      return true;
    } catch (e) {
      setDecisionState((prev) => ({
        ...prev,
        [userId]: e instanceof Error ? e.message : "Unable to apply decision.",
      }));
      return false;
    }
  }

  async function loadClarificationHistory(userId: string) {
    setClarificationHistoryState((prev) => ({
      ...prev,
      [userId]: "Loading conversation...",
    }));

    try {
      const response = await fetch(
        `/api/settings/users/${userId}/clarifications`,
        {
          method: "GET",
          cache: "no-store",
        },
      );

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          body?.message || "Unable to load clarification history.",
        );
      }

      setClarificationHistory((prev) => ({
        ...prev,
        [userId]: Array.isArray(body?.items) ? body.items : [],
      }));
      setClarificationHistoryState((prev) => ({ ...prev, [userId]: "" }));
    } catch (e) {
      setClarificationHistoryState((prev) => ({
        ...prev,
        [userId]:
          e instanceof Error
            ? e.message
            : "Unable to load clarification history.",
      }));
    }
  }

  async function sendClarification(userId: string) {
    setDecisionState((prev) => ({
      ...prev,
      [userId]: "Sending clarification...",
    }));

    try {
      const response = await fetch(
        `/api/settings/users/${userId}/clarifications`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "send",
            subject: clarificationSubject[userId] || "",
            message: clarificationBody[userId] || "",
          }),
        },
      );

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.message || "Unable to send clarification.");
      }

      setDecisionState((prev) => ({
        ...prev,
        [userId]: "Clarification sent.",
      }));
      setClarificationBody((prev) => ({ ...prev, [userId]: "" }));
      await loadClarificationHistory(userId);
    } catch (e) {
      setDecisionState((prev) => ({
        ...prev,
        [userId]:
          e instanceof Error ? e.message : "Unable to send clarification.",
      }));
    }
  }

  async function logResponse(userId: string) {
    setDecisionState((prev) => ({ ...prev, [userId]: "Logging response..." }));

    try {
      const response = await fetch(
        `/api/settings/users/${userId}/clarifications`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "log-response",
            subject: responseSubject[userId] || "",
            message: responseBody[userId] || "",
            receivedFromEmail: responseEmail[userId] || "",
          }),
        },
      );

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.message || "Unable to log received response.");
      }

      setDecisionState((prev) => ({ ...prev, [userId]: "Response logged." }));
      setResponseBody((prev) => ({ ...prev, [userId]: "" }));
      setResponseSubject((prev) => ({ ...prev, [userId]: "" }));
      await loadClarificationHistory(userId);
    } catch (e) {
      setDecisionState((prev) => ({
        ...prev,
        [userId]:
          e instanceof Error ? e.message : "Unable to log received response.",
      }));
    }
  }

  async function openConversationDialog(userId: string) {
    setConversationDialogUserId(userId);

    if (!clarificationHistory[userId]) {
      await loadClarificationHistory(userId);
    }
  }

  async function confirmReject(userId: string) {
    const applied = await decide(userId, "reject");
    if (applied) {
      setRejectDialogUserId(null);
    }
  }

  const sortedItems = useMemo(
    () =>
      [...items].sort((a, b) =>
        a.registrationDate.localeCompare(b.registrationDate),
      ),
    [items],
  );

  const rejectUser = rejectDialogUserId
    ? (sortedItems.find((item) => item.id === rejectDialogUserId) ?? null)
    : null;

  const conversationUser = conversationDialogUserId
    ? (sortedItems.find((item) => item.id === conversationDialogUserId) ?? null)
    : null;

  const activeConversationId = conversationUser?.id ?? "";

  if (!loading && !error && sortedItems.length === 0) {
    return null;
  }

  return (
    <>
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
          <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {error}
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
                    <td className="px-2 py-3">
                      {item.dataAccessReason || "-"}
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void decide(item.id, "activate")}
                          className="rounded-md bg-lime-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-lime-700"
                        >
                          Activate
                        </button>
                        <button
                          type="button"
                          onClick={() => setRejectDialogUserId(item.id)}
                          className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          onClick={() => void openConversationDialog(item.id)}
                          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Clarification Conversation
                        </button>
                      </div>
                      {decisionState[item.id] && (
                        <p className="mt-2 text-xs text-slate-600">
                          {decisionState[item.id]}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Dialog
        open={Boolean(rejectDialogUserId)}
        onOpenChange={(open) => {
          if (!open) {
            setRejectDialogUserId(null);
          }
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Reject Registration</DialogTitle>
            <DialogDescription>
              Provide a rejection reason for{" "}
              {rejectUser?.name || "the selected user"}.
            </DialogDescription>
          </DialogHeader>

          {rejectUser && (
            <div className="space-y-4">
              <textarea
                value={rejectReason[rejectUser.id] || ""}
                onChange={(e) =>
                  setRejectReason((prev) => ({
                    ...prev,
                    [rejectUser.id]: e.target.value,
                  }))
                }
                placeholder="Rejection reason"
                rows={6}
                className="w-full rounded-md border border-slate-300 px-4 py-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />

              {decisionState[rejectUser.id] && (
                <p className="text-xs text-slate-600">
                  {decisionState[rejectUser.id]}
                </p>
              )}

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setRejectDialogUserId(null)}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void confirmReject(rejectUser.id)}
                  className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 transition-colors"
                >
                  Confirm Reject
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(conversationDialogUserId)}
        onOpenChange={(open) => {
          if (!open) {
            setConversationDialogUserId(null);
          }
        }}
      >
        <DialogContent className="max-h-[92vh] w-[calc(100vw-3rem)] max-w-352 overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Clarification Conversation</DialogTitle>
            <DialogDescription>
              Review and manage clarification messages for{" "}
              {conversationUser?.name || "selected user"}.
            </DialogDescription>
          </DialogHeader>

          {conversationUser && (
            <div className="space-y-6">
              <section className="space-y-4">
                <p className="text-sm font-semibold text-slate-700">
                  Clarification History
                </p>

                {clarificationHistoryState[activeConversationId] && (
                  <p className="text-sm text-slate-600">
                    {clarificationHistoryState[activeConversationId]}
                  </p>
                )}

                {!clarificationHistoryState[activeConversationId] &&
                  (clarificationHistory[activeConversationId]?.length || 0) ===
                    0 && (
                    <p className="text-sm text-slate-500">
                      No clarification messages logged yet.
                    </p>
                  )}

                <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 max-h-[64vh] overflow-y-auto">
                  {(clarificationHistory[activeConversationId] || []).map(
                    (message) => (
                      <div
                        key={message.id}
                        className="rounded-lg border border-slate-300 bg-white p-4 shadow-sm"
                      >
                        <div className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                          <div className="flex items-center gap-2">
                            {message.direction === "outbound" ? (
                              <Send className="h-4 w-4" />
                            ) : (
                              <MailOpen className="h-4 w-4" />
                            )}
                            <span>
                              {message.direction === "outbound"
                                ? "BMO Message"
                                : "Received Response"}
                            </span>
                          </div>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {new Date(message.createdAt).toLocaleString()} |{" "}
                          {message.actorName ||
                            message.actorEmail ||
                            "Unknown actor"}
                        </p>
                        {message.subject && (
                          <p className="mt-2 text-sm font-medium text-slate-700">
                            <strong>Subject:</strong> {message.subject}
                          </p>
                        )}
                        {message.receivedFromEmail && (
                          <p className="mt-1 text-xs text-slate-600">
                            <strong>From:</strong> {message.receivedFromEmail}
                          </p>
                        )}
                        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                          {message.message}
                        </p>
                      </div>
                    ),
                  )}
                </div>
              </section>

              <section className="space-y-6">
                <div className="rounded-lg border border-slate-300 bg-blue-50 p-4">
                  <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <Mail className="h-4 w-4" />
                    Send Clarification Email
                  </p>
                  <input
                    type="text"
                    value={clarificationSubject[activeConversationId] || ""}
                    onChange={(e) =>
                      setClarificationSubject((prev) => ({
                        ...prev,
                        [activeConversationId]: e.target.value,
                      }))
                    }
                    placeholder="Email subject"
                    className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                  <textarea
                    value={clarificationBody[activeConversationId] || ""}
                    onChange={(e) =>
                      setClarificationBody((prev) => ({
                        ...prev,
                        [activeConversationId]: e.target.value,
                      }))
                    }
                    placeholder="Type your clarification message here..."
                    rows={6}
                    className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                  <button
                    type="button"
                    onClick={() => void sendClarification(activeConversationId)}
                    className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-700"
                  >
                    Send Clarification
                  </button>
                </div>

                <div className="rounded-lg border border-slate-300 bg-amber-50 p-4">
                  <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <FileText className="h-4 w-4" />
                    Log Received Response
                  </p>
                  <input
                    type="email"
                    value={responseEmail[activeConversationId] || ""}
                    onChange={(e) =>
                      setResponseEmail((prev) => ({
                        ...prev,
                        [activeConversationId]: e.target.value,
                      }))
                    }
                    placeholder="Responder email (optional)"
                    className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
                  />
                  <input
                    type="text"
                    value={responseSubject[activeConversationId] || ""}
                    onChange={(e) =>
                      setResponseSubject((prev) => ({
                        ...prev,
                        [activeConversationId]: e.target.value,
                      }))
                    }
                    placeholder="Response subject (optional)"
                    className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
                  />
                  <textarea
                    value={responseBody[activeConversationId] || ""}
                    onChange={(e) =>
                      setResponseBody((prev) => ({
                        ...prev,
                        [activeConversationId]: e.target.value,
                      }))
                    }
                    placeholder="Paste the response message here..."
                    rows={6}
                    className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
                  />
                  <button
                    type="button"
                    onClick={() => void logResponse(activeConversationId)}
                    className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
                  >
                    Log Response
                  </button>
                </div>
              </section>

              {decisionState[activeConversationId] && (
                <p className="text-xs text-slate-600">
                  {decisionState[activeConversationId]}
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
