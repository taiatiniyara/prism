import { AssistantPanel } from "@/components/ai/assistant-panel";

export default function AiAssistantPage() {
  return (
    <main className="mx-auto w-full max-w-5xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">
          AI Chat Assistant
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Chat naturally about role-scoped PRISM data without manual filters.
        </p>
      </header>
      <AssistantPanel />
    </main>
  );
}
