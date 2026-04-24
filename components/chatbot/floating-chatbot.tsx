"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { ChatPanel } from "@/components/chatbot/chat-panel";

export function FloatingChatbot() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  if (pathname.startsWith("/dashboard/ai-assistant")) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 sm:bottom-6 sm:right-6">
      <div
        id="floating-prism-chat"
        className={`pointer-events-auto mb-3 h-[70vh] w-[calc(100vw-2rem)] max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl transition duration-300 sm:w-md ${
          isOpen
            ? "translate-y-0 scale-100 opacity-100"
            : "translate-y-3 scale-95 opacity-0 pointer-events-none"
        }`}
        aria-hidden={!isOpen}
      >
        <ChatPanel compact />
      </div>

      <div className="pointer-events-auto flex justify-end">
        <button
          type="button"
          onClick={() => setIsOpen((value) => !value)}
          className="group relative inline-flex size-12 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-slate-800"
          aria-expanded={isOpen}
          aria-controls="floating-prism-chat"
          aria-label={isOpen ? "Close PRISM AI" : "Open PRISM AI"}
          title={isOpen ? "Close PRISM AI" : "Open PRISM AI"}
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="size-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3l1.7 3.4L17 8l-3.3 1.6L12 13l-1.7-3.4L7 8l3.3-1.6L12 3z" />
            <path d="M5 15l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z" />
            <path d="M19 14l.8 1.6L21.5 16l-1.7.8L19 18.5l-.8-1.7-1.7-.8 1.7-.8L19 14z" />
          </svg>
          <span className="sr-only">
            {isOpen ? "Close PRISM AI" : "Open PRISM AI"}
          </span>
          <span className="pointer-events-none absolute right-14 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-md transition group-hover:opacity-100">
            {isOpen ? "Close PRISM AI" : "Ask PRISM AI"}
          </span>
        </button>
      </div>
    </div>
  );
}
