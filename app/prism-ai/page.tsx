"use client";

import { Suspense, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChatPanel } from "@/components/ai/chat-panel";

function PrismAiContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session");

  const handleActiveSessionChange = useCallback(
    (activeSessionId: number | null) => {
      const url = activeSessionId ? `/prism-ai?session=${activeSessionId}` : "/prism-ai";
      router.replace(url, { scroll: false });
    },
    [router],
  );

  return (
    <main className="h-full w-full">
      <ChatPanel
        showSidebar={true}
        initialSessionId={sessionId ? parseInt(sessionId, 10) : undefined}
        onActiveSessionChange={handleActiveSessionChange}
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
