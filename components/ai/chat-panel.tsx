"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { MessageBubble } from "./message-bubble";
import { ChatInput } from "./chat-input";
import { ChatSidebar } from "./chat-sidebar";

interface ChatSession {
  id: number;
  title: string;
  last_turn_at: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  turnId?: number;
}

interface ChatPanelProps {
  showSidebar?: boolean;
}

export function ChatPanel({ showSidebar = true }: ChatPanelProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const abortControllerRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const refreshSessions = useCallback(async () => {
    try {
      const response = await fetch("/api/ai/sessions");
      if (response.ok) {
        const data = await response.json();
        setSessions(data.sessions || []);
      }
    } catch {
      // Silently fail
    }
  }, []);

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  const handleNewSession = async () => {
    setActiveSessionId(null);
    setMessages([]);
    setStreamingContent("");
  };

  const handleSelectSession = async (sessionId: number) => {
    setActiveSessionId(sessionId);
    setMessages([]);
    setStreamingContent("");

    try {
      const response = await fetch(`/api/ai/sessions/${sessionId}`);
      if (response.ok) {
        const data = await response.json();
        const loadedMessages: ChatMessage[] = data.turns.flatMap(
          (turn: { user_message: string; assistant_response: string | null }) => {
            const msgs: ChatMessage[] = [
              {
                id: `user-${Date.now()}-${Math.random()}`,
                role: "user",
                content: turn.user_message,
              },
            ];
            if (turn.assistant_response) {
              msgs.push({
                id: `assistant-${Date.now()}-${Math.random()}`,
                role: "assistant",
                content: turn.assistant_response,
              });
            }
            return msgs;
          },
        );
        setMessages(loadedMessages);
      }
    } catch {
      // Silently fail
    }
  };

  const handleDeleteSession = async (sessionId: number) => {
    try {
      const response = await fetch(`/api/ai/sessions/${sessionId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        if (activeSessionId === sessionId) {
          setActiveSessionId(null);
          setMessages([]);
        }
      }
    } catch {
      // Silently fail
    }
  };

  const handleSendMessage = async (message: string) => {
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: message,
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setStreamingContent("");

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          sessionId: activeSessionId,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const sessionIdHeader = response.headers.get("X-Session-Id");
      const turnIdHeader = response.headers.get("X-Turn-Id");
      let turnId: number | undefined;

      if (sessionIdHeader && !activeSessionId) {
        setActiveSessionId(parseInt(sessionIdHeader, 10));
      }

      if (turnIdHeader) {
        turnId = parseInt(turnIdHeader, 10);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body");
      }

      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullContent += chunk;
        setStreamingContent(fullContent);
      }

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: fullContent,
        turnId,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setStreamingContent("");
      await refreshSessions();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        // User cancelled
      } else {
        const errorMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    } finally {
      setIsLoading(false);
      setStreamingContent("");
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleFeedback = async (
    turnId: number,
    sentiment: "positive" | "negative",
    correction?: string,
  ) => {
    try {
      await fetch("/api/ai/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          turn_id: turnId,
          sentiment,
          correction_text: correction,
        }),
      });
    } catch {
      // Silently fail
    }
  };

  const displayMessages = streamingContent
    ? [
        ...messages,
        {
          id: "streaming",
          role: "assistant" as const,
          content: streamingContent,
        },
      ]
    : messages;

  return (
    <div className="flex h-full overflow-hidden">
      {showSidebar && (
        <ChatSidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
          onDeleteSession={handleDeleteSession}
        />
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto" role="log" aria-live="polite" aria-label="Chat messages">
          <div className="mx-auto max-w-3xl space-y-6 p-6">
            {displayMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <h2 className="mb-2 text-xl font-semibold">PRISM AI</h2>
                <p className="text-muted-foreground max-w-md">
                  Ask me about your utility&apos;s performance, benchmarking data,
                  KPI status, or how to use the PRISM platform.
                </p>
              </div>
            ) : (
              displayMessages.map((message: ChatMessage) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  onFeedback={(sentiment: "positive" | "negative", correction?: string) =>
                    handleFeedback(message.turnId ?? 0, sentiment, correction)
                  }
                />
              ))
            )}

            {isLoading && !streamingContent && (
              <div className="flex items-center gap-2 text-sm">
                <Loader2 className="text-muted-foreground size-4 animate-spin" />
                <span className="text-muted-foreground">
                  PRISM AI is thinking...
                </span>
              </div>
            )}
          </div>
        </div>

        <ChatInput
          onSend={handleSendMessage}
          onStop={handleStop}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
