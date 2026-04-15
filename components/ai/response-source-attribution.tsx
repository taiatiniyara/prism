import type { AiQueryResponse } from "@/lib/ai/types";
import { AI_PANEL_SECTION_CLASS, AI_PANEL_TITLE_CLASS } from "./shared";

interface ResponseSourceAttributionProps {
  response: AiQueryResponse;
}

export function ResponseSourceAttribution({
  response,
}: ResponseSourceAttributionProps) {
  return (
    <section className={AI_PANEL_SECTION_CLASS}>
      <h2 className={`mb-2 ${AI_PANEL_TITLE_CLASS}`}>Sources</h2>
      <ul className="list-disc pl-5 text-sm text-slate-900">
        {response.attribution.map((item) => (
          <li key={`${item.sourceType}:${item.sourceRef}`}>
            {item.sourceName} ({item.sourceType}) - {item.sourceRef}
          </li>
        ))}
      </ul>
    </section>
  );
}
