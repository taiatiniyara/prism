"use client";

import { useState } from "react";

import type { AiQueryResponse } from "@/lib/ai/types";
import { ExportActions } from "./export-actions";
import { ResponseMetricsTable } from "./response-metrics-table";
import { ResponseSourceAttribution } from "./response-source-attribution";
import { ResponseSummary } from "./response-summary";
import { AI_FOCUS_RING_CLASS } from "./shared";

export function AssistantPanel() {
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<AiQueryResponse | null>(null);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const payload = {
        prompt,
        mode: "auto-scope",
      };

      const result = await fetch("/api/ai/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = (await result.json()) as
        | AiQueryResponse
        | { message: string };
      if (!result.ok) {
        setResponse(null);
        setError(
          (body as { message: string }).message ?? "Unable to run query.",
        );
        return;
      }

      setResponse(body as AiQueryResponse);
      setPrompt("");
    } catch {
      setResponse(null);
      setError("Unable to send message.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <form
        className="space-y-3 rounded-md border border-slate-200 bg-white p-4"
        onSubmit={onSubmit}
      >
        <label
          className="block text-sm font-medium text-slate-700"
          htmlFor="ai-prompt"
        >
          Message the assistant
        </label>
        <textarea
          id="ai-prompt"
          className={`w-full rounded-md border border-slate-300 p-2 text-sm ${AI_FOCUS_RING_CLASS}`}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Ask anything about your PRISM data..."
          rows={4}
          required
        />

        <p className="text-xs text-slate-500">
          No manual filters required. The assistant auto-scopes your request.
        </p>

        <button
          type="submit"
          className={`rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white ${AI_FOCUS_RING_CLASS} disabled:opacity-60`}
          disabled={isLoading}
        >
          {isLoading ? "Sending..." : "Send"}
        </button>

        <p
          aria-live="polite"
          className="text-sm text-slate-600"
        >
          {isLoading ? "Assistant is thinking..." : ""}
        </p>
      </form>

      {error ? (
        <section
          className="rounded-md border border-rose-200 bg-rose-50 p-4"
          aria-live="polite"
        >
          <p className="text-sm text-rose-700">{error}</p>
        </section>
      ) : null}

      {response ? (
        <div className="space-y-4">
          <section className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            External narrative sharing is blocked until DEV/BMO review approval.
            Trace ID: {response.traceId}
          </section>
          <ResponseSummary response={response} />
          <ResponseMetricsTable response={response} />
          <ResponseSourceAttribution response={response} />
          <ExportActions traceId={response.traceId} />
        </div>
      ) : null}
    </div>
  );
}
