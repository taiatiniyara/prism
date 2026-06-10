"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Loader2, ArrowDown, RefreshCw, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
  isError?: boolean;
}

interface ChatPanelProps {
  showSidebar?: boolean;
  initialSessionId?: number;
}

const MAX_CHARS = 4000;

export function ChatPanel({ showSidebar = true, initialSessionId }: ChatPanelProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isStreamingRef = useRef(false);
  const messagesRef = useRef(messages);

  messagesRef.current = messages;

  const sessionList = useMemo(() => sessions, [sessions]);

  const refreshSessions = useCallback(async () => {
    try {
      const response = await fetch("/api/ai/sessions");
      if (response.ok) {
        const data = await response.json();
        setSessions(data.sessions || []);
      }
    } catch {
      toast.error("Failed to load conversations");
    }
  }, []);

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  const initialSessionLoaded = useRef(false);
  useEffect(() => {
    if (initialSessionId && !initialSessionLoaded.current) {
      initialSessionLoaded.current = true;
      handleSelectSession(initialSessionId);
    }
  }, [initialSessionId]);

  const scrollToBottom = useCallback((smooth = false) => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: smooth ? "smooth" : "auto",
      });
      setIsAtBottom(true);
    }
  }, []);

  useEffect(() => {
    if (isAtBottom) {
      scrollToBottom();
    }
  }, [messages, streamingContent, isAtBottom, scrollToBottom]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setIsAtBottom(scrollHeight - scrollTop - clientHeight < 80);
  }, []);

  const handleNewSession = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setActiveSessionId(null);
    setMessages([]);
    setStreamingContent("");
    setSidebarOpen(false);
  };

  const handleSelectSession = async (sessionId: number) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setActiveSessionId(sessionId);
    setMessages([]);
    setStreamingContent("");
    setIsLoadingHistory(true);
    setSidebarOpen(false);

    try {
      const response = await fetch(`/api/ai/sessions/${sessionId}`);
      if (response.ok) {
        const data = await response.json();
        const loadedMessages: ChatMessage[] = data.turns.flatMap(
          (turn: { user_message: string; assistant_response: string | null; id: number }) => {
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
                turnId: turn.id,
              });
            }
            return msgs;
          },
        );
        setMessages(loadedMessages);
      } else {
        toast.error("Failed to load conversation");
      }
    } catch {
      toast.error("Failed to load conversation");
    } finally {
      setIsLoadingHistory(false);
      setTimeout(() => scrollToBottom(), 50);
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
        toast.success("Conversation deleted");
      } else {
        toast.error("Failed to delete conversation");
      }
    } catch {
      toast.error("Failed to delete conversation");
    }
  };

  const handleRenameSession = async (sessionId: number, title: string) => {
    try {
      const response = await fetch(`/api/ai/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (response.ok) {
        setSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? { ...s, title } : s)),
        );
      } else {
        toast.error("Failed to rename");
      }
    } catch {
      toast.error("Failed to rename");
    }
  };

  const handleSendMessage = async (message: string) => {
    if (isStreamingRef.current) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: message,
    };

    const updatedMessages = [...messagesRef.current, userMessage];
    setMessages(updatedMessages);
    setIsLoading(true);
    setStreamingContent("");
    isStreamingRef.current = true;

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          sessionId: activeSessionId,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        let errorMsg = "Sorry, I encountered an error. Please try again.";
        if (response.status === 429) {
          const retryAfter = response.headers.get("Retry-After");
          errorMsg = retryAfter
            ? `Rate limit reached. Please wait ${Math.ceil(parseInt(retryAfter, 10))} seconds before trying again.`
            : "Rate limit reached. Please wait a moment before trying again.";
        } else if (response.status === 400) {
          const body = await response.json().catch(() => ({ message: "" }));
          errorMsg = body.message || errorMsg;
        }
        throw new Error(errorMsg);
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

      const finalMessages = [...messagesRef.current, assistantMessage];
      setMessages(finalMessages);
      setStreamingContent("");
      await refreshSessions();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      const msg = error instanceof Error ? error.message : "Sorry, I encountered an error. Please try again.";
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: msg,
        isError: true,
      };
      setMessages((prev) => [...prev, errorMessage]);
      toast.error(msg.length > 120 ? "An error occurred" : msg);
    } finally {
      setIsLoading(false);
      setStreamingContent("");
      abortControllerRef.current = null;
      isStreamingRef.current = false;
    }
  };

  const handleShare = () => {
    if (activeSessionId) {
      const url = `${window.location.origin}/prism-ai?session=${activeSessionId}`;
      navigator.clipboard.writeText(url).then(() => {
        toast.success("Link copied to clipboard");
      }).catch(() => {
        toast.error("Failed to copy link");
      });
    }
  };

  const handleRetry = () => {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (lastUserMsg) {
      setMessages((prev) => prev.filter((m) => !m.isError));
      handleSendMessage(lastUserMsg.content);
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
      const response = await fetch("/api/ai/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          turn_id: turnId,
          sentiment,
          correction_text: correction,
        }),
      });
      if (response.ok) {
        toast.success(sentiment === "positive" ? "Thanks for the feedback!" : "Feedback submitted. Thank you.");
      } else {
        toast.error("Failed to submit feedback");
      }
    } catch {
      toast.error("Failed to submit feedback");
    }
  };

  const handleCopy = (content: string, id: string) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedId(id);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopiedId(null), 2000);
    }).catch(() => {
      toast.error("Failed to copy");
    });
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
        <>
          <div className={`border-border flex h-full w-64 flex-col border-r max-md:hidden ${sidebarOpen ? "max-md:flex max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:bg-background" : ""}`}>
            <ChatSidebar
              sessions={sessionList}
              activeSessionId={activeSessionId}
              onSelectSession={handleSelectSession}
              onNewSession={handleNewSession}
              onDeleteSession={handleDeleteSession}
              onRenameSession={handleRenameSession}
              isLoading={isLoadingHistory}
            />
          </div>
          {sidebarOpen && (
            <div className="fixed inset-0 z-30 bg-black/20 md:hidden" onClick={() => setSidebarOpen(false)} />
          )}
        </>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {showSidebar && (
          <div className="border-border flex items-center gap-2 border-b px-4 py-2 md:hidden">
            <Button variant="ghost" size="icon-sm" onClick={() => setSidebarOpen(true)} aria-label="Open chat history">
              <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </Button>
            <span className="text-sm font-medium">Chats</span>
          </div>
        )}

        <div className="relative min-h-0 flex-1">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="absolute inset-0 overflow-y-auto"
            role="log"
            aria-live="polite"
            aria-label="Chat messages"
          >
            <div className="mx-auto max-w-3xl space-y-6 p-6">
              {isLoadingHistory ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="text-muted-foreground size-5 animate-spin" />
                </div>
              ) : displayMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <h2 className="mb-2 text-xl font-semibold">PRISM AI</h2>
                  <p className="text-muted-foreground max-w-md">
                    Ask me about your utility&apos;s performance, benchmarking data,
                    KPI status, or how to use the PRISM platform.
                  </p>
                </div>
              ) : (
                <div>
                  {activeSessionId && (
                    <div className="flex justify-end">
                      <Button variant="ghost" size="sm" onClick={handleShare}>
                        <Share2 className="mr-1 size-3" />
                        Share
                      </Button>
                    </div>
                  )}
                  {displayMessages.map((msg) => (
                  <div key={msg.id}>
                    <MessageBubble
                      message={msg}
                      onFeedback={(sentiment: "positive" | "negative", correction?: string) =>
                        handleFeedback(msg.turnId ?? 0, sentiment, correction)
                      }
                      onCopy={(content) => handleCopy(content, msg.id)}
                      copied={copiedId === msg.id}
                    />
                    {msg.isError && (
                      <div className="mt-2 flex justify-center">
                        <Button variant="outline" size="sm" onClick={handleRetry}>
                          <RefreshCw className="mr-1 size-3" />
                          Retry
                        </Button>
                      </div>
                    )}
                  </div>
                ))
                }
                </div>
              )}

              {isLoading && !streamingContent && (
                <div className="flex items-center gap-2 text-sm">
                  <Loader2 className="text-muted-foreground size-4 animate-spin" />
                  <span className="text-muted-foreground">PRISM AI is thinking...</span>
                </div>
              )}
            </div>
          </div>

          {!isAtBottom && (
            <Button
              variant="outline"
              size="icon-sm"
              className="absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full shadow"
              onClick={() => scrollToBottom(true)}
              aria-label="Scroll to bottom"
            >
              <ArrowDown className="size-4" />
            </Button>
          )}
        </div>

        <ChatInput
            onSend={handleSendMessage}
            onStop={handleStop}
            isLoading={isLoading}
            maxLength={MAX_CHARS}
          />
        </div>
      </div>
  );
}
