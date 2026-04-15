import { AssistantPanel } from "@/components/ai/assistant-panel";

export default function AiAssistantPage() {
  return (
    <main className="mx-auto w-full max-w-5xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">
          AI Reporting Assistant
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Ask role-scoped reporting questions and review structured results with
          source attribution.
        </p>
      </header>
      <AssistantPanel />
    </main>
  );
}
