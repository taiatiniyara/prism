"use client";

import { useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AiQueryResponse, QueryClass } from "@/lib/ai/types";
import { ExportActions } from "./export-actions";
import { ResponseMetricsTable } from "./response-metrics-table";
import { ResponseSourceAttribution } from "./response-source-attribution";
import { ResponseSummary } from "./response-summary";
import { AI_FOCUS_RING_CLASS } from "./shared";

const QUERY_CLASSES: QueryClass[] = [
  "completeness",
  "review-bottlenecks",
  "stale-missing-kpi",
  "pending-queue",
];

export function AssistantPanel() {
  const [prompt, setPrompt] = useState("");
  const [queryClass, setQueryClass] = useState<QueryClass>("completeness");
  const [reportPeriodId, setReportPeriodId] = useState("");
  const [serviceAreaId, setServiceAreaId] = useState("");
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
        queryClass,
        filterContext: {
          reportPeriodId: reportPeriodId ? Number(reportPeriodId) : undefined,
          serviceAreaId: serviceAreaId ? Number(serviceAreaId) : undefined,
        },
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
    } catch {
      setResponse(null);
      setError("Unable to run query.");
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
          Ask a reporting question
        </label>
        <textarea
          id="ai-prompt"
          className={`w-full rounded-md border border-slate-300 p-2 text-sm ${AI_FOCUS_RING_CLASS}`}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={4}
          required
        />

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="text-sm text-slate-700">
            Query class
            <Select
              value={queryClass}
              onValueChange={(value) => setQueryClass(value as QueryClass)}
            >
              <SelectTrigger
                className={`mt-1 h-9 w-full border-slate-300 ${AI_FOCUS_RING_CLASS}`}
              >
                <SelectValue placeholder="Select query class" />
              </SelectTrigger>
              <SelectContent>
                {QUERY_CLASSES.map((item) => (
                  <SelectItem
                    key={item}
                    value={item}
                  >
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="text-sm text-slate-700">
            Report period ID
            <input
              className={`mt-1 w-full rounded-md border border-slate-300 p-2 ${AI_FOCUS_RING_CLASS}`}
              value={reportPeriodId}
              onChange={(event) => setReportPeriodId(event.target.value)}
              inputMode="numeric"
            />
          </label>
          <label className="text-sm text-slate-700">
            Service area ID
            <input
              className={`mt-1 w-full rounded-md border border-slate-300 p-2 ${AI_FOCUS_RING_CLASS}`}
              value={serviceAreaId}
              onChange={(event) => setServiceAreaId(event.target.value)}
              inputMode="numeric"
            />
          </label>
        </div>

        <button
          type="submit"
          className={`rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white ${AI_FOCUS_RING_CLASS} disabled:opacity-60`}
          disabled={isLoading}
        >
          {isLoading ? "Running query..." : "Run query"}
        </button>

        <p
          aria-live="polite"
          className="text-sm text-slate-600"
        >
          {isLoading ? "Loading results..." : ""}
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
