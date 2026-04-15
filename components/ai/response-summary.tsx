import type { AiQueryResponse } from "@/lib/ai/types";
import { AI_PANEL_SECTION_CLASS, AI_PANEL_TITLE_CLASS } from "./shared";

interface ResponseSummaryProps {
  response: AiQueryResponse;
}

export function ResponseSummary({ response }: ResponseSummaryProps) {
  return (
    <section className={AI_PANEL_SECTION_CLASS}>
      <h2 className={`mb-2 ${AI_PANEL_TITLE_CLASS}`}>Summary</h2>
      <p className="text-sm text-slate-900">{response.summary}</p>
    </section>
  );
}
