import { ChatPanel } from "@/components/chatbot/chat-panel";

export default function ChatbotPage() {
  return (
    <main className="mx-auto h-[calc(100vh-7rem)] w-full max-w-5xl p-4 sm:p-6">
      <ChatPanel />
    </main>
  );
}
