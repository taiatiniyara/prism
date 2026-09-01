"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ChatPanel } from "@/components/ai/chat-panel";

function PrismAiContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session");

  return (
    <main className="h-full w-full">
      <ChatPanel
        showSidebar={true}
        initialSessionId={sessionId ? parseInt(sessionId, 10) : undefined}
      />
    </main>
  );
}

export default function PrismAiPage() {
  return (
    <Suspense fallback={<main className="h-full w-full" />}>
      <PrismAiContent />
    </Suspense>
  );
}
