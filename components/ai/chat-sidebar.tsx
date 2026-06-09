"use client";

import { Plus, MessageSquare, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ChatSession {
  id: number;
  title: string;
  last_turn_at: string;
}

interface ChatSidebarProps {
  sessions: ChatSession[];
  activeSessionId: number | null;
  onSelectSession: (sessionId: number) => void;
  onNewSession: () => void;
  onDeleteSession: (sessionId: number) => void;
}

export function ChatSidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
}: ChatSidebarProps) {
  return (
    <div className="border-border flex h-full w-64 flex-col border-r" role="navigation" aria-label="Chat sessions">
      <div className="border-border border-b p-3">
        <Button onClick={onNewSession} className="w-full" variant="outline" aria-label="Start new chat">
          <Plus className="mr-2 size-4" />
          New Chat
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2" role="list">
          {sessions.length === 0 ? (
            <p className="text-muted-foreground px-3 py-2 text-sm">
              No conversations yet
            </p>
          ) : (
            sessions.map((session) => (
              <button
                key={session.id}
                className={`group flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                  activeSessionId === session.id
                    ? "bg-muted"
                    : "hover:bg-muted/50"
                }`}
                onClick={() => onSelectSession(session.id)}
                aria-current={activeSessionId === session.id ? "true" : undefined}
                aria-label={session.title}
              >
                <MessageSquare className="text-muted-foreground size-4 shrink-0" />
                <span className="flex-1 truncate">{session.title}</span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="opacity-0 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSession(session.id);
                  }}
                  aria-label={`Delete chat "${session.title}"`}
                >
                  <Trash2 className="size-3" />
                </Button>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
