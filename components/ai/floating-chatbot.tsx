"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatPanel } from "./chat-panel";

export function FloatingChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) close();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, close]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  if (pathname?.startsWith("/prism-ai")) {
    return null;
  }

  return (
    <>
      <div className="animate-bobble fixed bottom-8 right-8 z-50">
        <Button
          onClick={() => setIsOpen(true)}
          className="group h-12 gap-2 rounded-2xl bg-primary px-4 text-white shadow-lg hover:shadow-xl hover:shadow-primary/25 transition-all duration-300 hover:scale-105 animate-glow"
          aria-label="Open PRISM AI"
        >
          <Sparkles className="size-4 text-white transition-transform duration-300 group-hover:rotate-12" />
          <span className="text-sm font-medium">PRISM AI</span>
        </Button>
      </div>

      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={close}
      />

      {/* Drawer */}
      <div
        className={`bg-background fixed right-0 top-0 z-50 flex h-full w-full flex-col border-l shadow-2xl transition-transform duration-300 ease-in-out md:w-1/2 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="border-border flex shrink-0 items-center justify-between border-b px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="bg-primary/10 flex size-8 items-center justify-center rounded-lg">
              <Sparkles className="text-primary size-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">PRISM AI</h3>
              <p className="text-muted-foreground text-[11px]">Pacific Power Association</p>
            </div>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={close} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <ChatPanel showSidebar={true} />
        </div>
      </div>
    </>
  );
}
