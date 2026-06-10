"use client";

import { useState } from "react";
import { Plus, MessageSquare, Trash2, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  onRenameSession: (sessionId: number, title: string) => void;
  isLoading?: boolean;
}

export function ChatSidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onRenameSession,
}: ChatSidebarProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  const handleDeleteClick = (e: React.MouseEvent, sessionId: number) => {
    e.stopPropagation();
    setConfirmDeleteId(sessionId);
  };

  const handleConfirmDelete = (e: React.MouseEvent, sessionId: number) => {
    e.stopPropagation();
    onDeleteSession(sessionId);
    setConfirmDeleteId(null);
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDeleteId(null);
  };

  const startRename = (e: React.MouseEvent, sessionId: number, currentTitle: string) => {
    e.stopPropagation();
    setEditingId(sessionId);
    setEditValue(currentTitle);
  };

  const submitRename = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    if (editingId != null && editValue.trim()) {
      onRenameSession(editingId, editValue.trim().slice(0, 120));
    }
    setEditingId(null);
    setEditValue("");
  };

  const cancelRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
    setEditValue("");
  };

  return (
    <div className="border-border flex h-full w-64 flex-col border-r dark:border-border" role="navigation" aria-label="Chat sessions">
      <div className="border-border border-b p-3 dark:border-border">
        <Button onClick={onNewSession} className="w-full" variant="outline" aria-label="Start new chat">
          <Plus className="mr-2 size-4" />
          New Chat
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2" role="list">
          {sessions.length === 0 ? (
            <p className="text-muted-foreground px-3 py-2 text-sm dark:text-muted-foreground">
              No conversations yet
            </p>
          ) : (
            sessions.map((session) => (
              <div key={session.id}>
                <div
                  role="button"
                  tabIndex={0}
                  className={`group flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    activeSessionId === session.id
                      ? "bg-muted dark:bg-muted"
                      : "hover:bg-muted/50 dark:hover:bg-muted/30"
                  }`}
                  onClick={() => onSelectSession(session.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectSession(session.id);
                    }
                  }}
                  aria-current={activeSessionId === session.id ? "true" : undefined}
                  aria-label={session.title}
                >
                  <MessageSquare className="text-muted-foreground size-4 shrink-0 dark:text-muted-foreground" />
                  {editingId === session.id ? (
                    <div className="flex flex-1 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <Input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") submitRename(e);
                          if (e.key === "Escape") cancelRename(e as unknown as React.MouseEvent);
                        }}
                        className="h-6 flex-1 text-xs"
                        autoFocus
                      />
                      <Button variant="ghost" size="icon-xs" onClick={submitRename} aria-label="Save rename">
                        <Check className="size-3" />
                      </Button>
                      <Button variant="ghost" size="icon-xs" onClick={cancelRename} aria-label="Cancel rename">
                        <X className="size-3" />
                      </Button>
                    </div>
                  ) : (
                    <span className="flex-1 truncate dark:text-foreground">{session.title}</span>
                  )}

                  {confirmDeleteId === session.id ? (
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="destructive"
                        size="icon-xs"
                        onClick={(e) => handleConfirmDelete(e, session.id)}
                        aria-label="Confirm delete"
                      >
                        <Check className="size-3" />
                      </Button>
                      <Button variant="ghost" size="icon-xs" onClick={handleCancelDelete} aria-label="Cancel delete">
                        <X className="size-3" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={(e) => startRename(e, session.id, session.title)}
                        aria-label={`Rename "${session.title}"`}
                      >
                        <Pencil className="size-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={(e) => handleDeleteClick(e, session.id)}
                        aria-label={`Delete chat "${session.title}"`}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
