"use client";

import { useState } from "react";
import { MessageSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatPanel } from "./chat-panel";

export function FloatingChatbot() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {!isOpen && (
        <Button
          onClick={() => setIsOpen(true)}
          size="icon"
          className="fixed bottom-6 right-6 z-50 size-14 rounded-full shadow-lg"
        >
          <MessageSquare className="size-6" />
        </Button>
      )}

      {isOpen && (
        <div className="border-border bg-background fixed bottom-6 right-6 z-50 flex h-[600px] w-[400px] flex-col rounded-lg border shadow-2xl">
          <div className="border-border flex items-center justify-between border-b px-4 py-3">
            <h3 className="font-semibold">PRISM AI</h3>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setIsOpen(false)}
            >
              <X className="size-4" />
            </Button>
          </div>

          <div className="flex-1 overflow-hidden">
            <ChatPanel showSidebar={false} />
          </div>
        </div>
      )}
    </>
  );
}
