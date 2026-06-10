"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { MessageSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatPanel } from "./chat-panel";

export function FloatingChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  if (pathname?.startsWith("/prism-ai")) {
    return null;
  }

  return (
    <>
      {!isOpen && (
        <Button
          onClick={() => setIsOpen(true)}
          size="icon"
          className="fixed bottom-6 right-6 z-50 size-14 rounded-full shadow-lg transition-transform hover:scale-110"
          aria-label="Open PRISM AI chat"
        >
          <MessageSquare className="size-6" />
        </Button>
      )}

      <div
        className={`border-border bg-background fixed bottom-6 right-6 z-50 flex max-h-[min(600px,calc(100vh-4rem))] h-[600px] w-[min(400px,calc(100vw-2rem))] flex-col rounded-lg border shadow-2xl transition-all duration-200 ${
          isOpen ? "scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0"
        }`}
      >
        <div className="border-border flex items-center justify-between border-b px-4 py-3">
          <h3 className="font-semibold">PRISM AI</h3>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setIsOpen(false)}
            aria-label="Close chat"
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-hidden">
          <ChatPanel showSidebar={false} />
        </div>
      </div>
    </>
  );
}
