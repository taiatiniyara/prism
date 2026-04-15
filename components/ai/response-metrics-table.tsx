import type { AiQueryResponse } from "@/lib/ai/types";
import { AI_PANEL_SECTION_CLASS, AI_PANEL_TITLE_CLASS } from "./shared";

interface ResponseMetricsTableProps {
  response: AiQueryResponse;
}

export function ResponseMetricsTable({ response }: ResponseMetricsTableProps) {
  return (
    <section className={AI_PANEL_SECTION_CLASS}>
      <h2 className={`mb-3 ${AI_PANEL_TITLE_CLASS}`}>Metrics</h2>
      <ul className="space-y-1 text-sm text-slate-900">
        {response.metrics.map((metric) => (
          <li key={metric.label}>
            <span className="font-medium">{metric.label}:</span> {metric.value}
            {metric.unit ? ` ${metric.unit}` : ""}
          </li>
        ))}
      </ul>

      <h3 className={`mt-4 mb-2 ${AI_PANEL_TITLE_CLASS}`}>Rows</h3>
      <pre className="max-h-56 overflow-auto rounded bg-slate-50 p-3 text-xs text-slate-700">
        {JSON.stringify(response.rows, null, 2)}
      </pre>
    </section>
  );
}
