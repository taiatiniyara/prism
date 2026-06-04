import { ChatPanel } from "@/components/ai/chat-panel";

export default function PrismAiPage() {
  return (
    <main className="h-[calc(100vh-4rem)] w-full">
      <ChatPanel showSidebar={true} />
    </main>
  );
}
