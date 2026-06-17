"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Loader2, ArrowDown, RefreshCw, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MessageBubble } from "./message-bubble";
import { ChatInput } from "./chat-input";
import { ChatSidebar } from "./chat-sidebar";
import { ChatErrorBoundary } from "./chat-error-boundary";

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
  reasoningContent?: string;
}

interface ChatPanelProps {
  showSidebar?: boolean;
  initialSessionId?: number;
}

const MAX_CHARS = 4000;
const RAF_MAX_BUFFER_CHARS = 12000;

export function ChatPanel({ showSidebar = true, initialSessionId }: ChatPanelProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingReasoning, setStreamingReasoning] = useState("");
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isStreamingRef = useRef(false);
  const animFrameRef = useRef<number | null>(null);
  const messagesRef = useRef(messages);
  const pendingContentRef = useRef("");
  const reasoningContentRef = useRef("");

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

  const scrollToBottom = useCallback((smooth = false) => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: smooth ? "smooth" : "auto",
      });
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
    setStreamingReasoning("");
    setSidebarOpen(false);
  };

  const handleSelectSession = useCallback(async (sessionId: number) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setActiveSessionId(sessionId);
    setMessages([]);
    setStreamingContent("");
    setStreamingReasoning("");
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
  }, [scrollToBottom]);

  useEffect(() => {
    if (initialSessionId && !initialSessionLoaded.current) {
      initialSessionLoaded.current = true;
      handleSelectSession(initialSessionId);
    }
  }, [initialSessionId, handleSelectSession]);

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
    setStreamingReasoning("");
    pendingContentRef.current = "";
    reasoningContentRef.current = "";
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
      let trailingBuffer = "";

      if (!reader) {
        throw new Error("No response body");
      }

      let displayedLen = 0;

      const revealNext = () => {
        const target = pendingContentRef.current;
        if (target.length > RAF_MAX_BUFFER_CHARS) {
          displayedLen = target.length;
          setStreamingContent(target);
          animFrameRef.current = null;
          return;
        }
        if (displayedLen < target.length) {
          displayedLen = Math.min(displayedLen + 3, target.length);
          setStreamingContent(target.slice(0, displayedLen));
          animFrameRef.current = requestAnimationFrame(revealNext);
        } else {
          animFrameRef.current = null;
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const raw = trailingBuffer + decoder.decode(value, { stream: true });
        trailingBuffer = "";

        const segments = raw.split("\n");
        for (let i = 0; i < segments.length; i++) {
          const line = segments[i];
          if (i === segments.length - 1 && !raw.endsWith("\n")) {
            trailingBuffer = line;
            break;
          }
          if (line.startsWith("0:")) {
            try {
              const textContent = JSON.parse(line.slice(2));
              pendingContentRef.current += textContent;
              if (!animFrameRef.current) {
                animFrameRef.current = requestAnimationFrame(revealNext);
              }
            } catch {
              pendingContentRef.current += line;
              if (!animFrameRef.current) {
                animFrameRef.current = requestAnimationFrame(revealNext);
              }
            }
          } else if (line.startsWith("1:")) {
            try {
              const reasoningEvent = JSON.parse(line.slice(2));
              if (reasoningEvent.type === "reasoning-delta" && typeof reasoningEvent.text === "string") {
                reasoningContentRef.current += reasoningEvent.text;
                setStreamingReasoning(reasoningContentRef.current);
              }
            } catch {
              // ignore malformed reasoning events
            }
          } else if (line.startsWith("2:")) {
            // Tool events now streamed as reasoning entries — skip
          } else if (line.startsWith("3:")) {
            // stream error event - silently acknowledge
          } else if (line.length > 0 && !line.startsWith("0:") && !line.startsWith("2:") && !line.startsWith("3:")) {
            const content = line + "\n";
            pendingContentRef.current += content;
            if (!animFrameRef.current) {
              animFrameRef.current = requestAnimationFrame(revealNext);
            }
          }
        }
      }

      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      const fullContent = pendingContentRef.current;
      const fullReasoning = reasoningContentRef.current;
      setStreamingContent(fullContent);
      setStreamingReasoning("");

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: fullContent,
        reasoningContent: fullReasoning || undefined,
        turnId,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setStreamingContent("");
      setStreamingReasoning("");
      await refreshSessions();

      if (fullContent && turnId) {
        fetch("/api/ai/chat/response", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ turnId, content: fullContent }),
        }).catch(() => {});
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        if (pendingContentRef.current) {
          const partialAssistant: ChatMessage = {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: pendingContentRef.current + "\n\n*[Generation stopped]*",
          };
          setMessages((prev) => [...prev, partialAssistant]);
        }
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
    } finally {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      setIsLoading(false);
      setStreamingContent("");
      pendingContentRef.current = "";
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
          reasoningContent: streamingReasoning || undefined,
        },
      ]
    : messages;

  return (
    <ChatErrorBoundary>
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
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <h2 className="mb-2 text-xl font-semibold">PRISM AI</h2>
                  <p className="text-muted-foreground mb-8 max-w-md">
                    Your utility&apos;s performance data, peer benchmarks, and insights — all in one place. Just ask.
                  </p>
                  <div className="grid w-full max-w-2xl grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="border-border rounded-lg border p-4 text-left transition-all duration-200 hover:border-slate-300 hover:shadow-md dark:border-border dark:hover:border-slate-600">
                      <h3 className="mb-2 text-sm font-medium">Performance &amp; Operations</h3>
                      <div className="space-y-1">
                        {[
                          "How did my utility perform in the latest reporting period?",
                          "Show me our SAIDI and SAIFI reliability numbers",
                          "Show me our SAIDI and SAIFI reliability numbers",
                        ].map((q) => (
                          <button
                            key={q}
                            onClick={() => handleSendMessage(q)}
                            className="text-muted-foreground hover:text-foreground block w-full text-left text-xs transition-colors"
                          >
                            &quot;{q}&quot;
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="border-border rounded-lg border p-4 text-left transition-all duration-200 hover:border-slate-300 hover:shadow-md dark:border-border dark:hover:border-slate-600">
                      <h3 className="mb-2 text-sm font-medium">Benchmarking &amp; Peer Comparison</h3>
                      <div className="space-y-1">
                        {[
                          "How do we compare to other Pacific utilities?",
                          "Who's leading on system losses and where do we rank?",
                          "What targets should we aim for next reporting period?",
                        ].map((q) => (
                          <button
                            key={q}
                            onClick={() => handleSendMessage(q)}
                            className="text-muted-foreground hover:text-foreground block w-full text-left text-xs transition-colors"
                          >
                            &quot;{q}&quot;
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="border-border rounded-lg border p-4 text-left transition-all duration-200 hover:border-slate-300 hover:shadow-md dark:border-border dark:hover:border-slate-600">
                      <h3 className="mb-2 text-sm font-medium">Diagnostics &amp; Data Health</h3>
                      <div className="space-y-1">
                        {[
                          "Which KPIs have missing data or errors I should fix?",
                          "What changed since the last reporting period?",
                          "What's waiting in my review queue?",
                        ].map((q) => (
                          <button
                            key={q}
                            onClick={() => handleSendMessage(q)}
                            className="text-muted-foreground hover:text-foreground block w-full text-left text-xs transition-colors"
                          >
                            &quot;{q}&quot;
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="border-border rounded-lg border p-4 text-left transition-all duration-200 hover:border-slate-300 hover:shadow-md dark:border-border dark:hover:border-slate-600">
                      <h3 className="mb-2 text-sm font-medium">Trends &amp; Risk</h3>
                      <div className="space-y-1">
                        {[
                          "Are we trending in the right direction on reliability?",
                          "Which areas of our utility are at highest risk?",
                          "How have our key KPIs trended over the past 3 years?",
                        ].map((q) => (
                          <button
                            key={q}
                            onClick={() => handleSendMessage(q)}
                            className="text-muted-foreground hover:text-foreground block w-full text-left text-xs transition-colors"
                          >
                            &quot;{q}&quot;
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-10">
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
                      isStreaming={msg.id === "streaming"}
                      reasoningContent={msg.reasoningContent}
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
                <div className="flex items-center gap-3">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
                    <span className="text-[11px] font-semibold">AI</span>
                  </div>
                  <div className="prism-thinking-shell">
                    <div className="flex items-center gap-2">
                      <div className="prism-thinking-orb" />
                      <span className="prism-thinking-label text-slate-600 dark:text-slate-300">Thinking</span>
                    </div>
                    <div className="prism-thinking-rail mt-1.5">
                      <div className="prism-thinking-rail-fill" />
                    </div>
                  </div>
                </div>
              )}
              {streamingContent && (
                <div className="mt-2 flex items-center gap-2 px-1 text-xs text-slate-400">
                  <span className="inline-block size-1.5 rounded-full bg-slate-300 animate-pulse" />
                  <span>Typing</span>
                </div>
              )}
            </div>
          </div>

          {!isAtBottom && (
            <Button
              variant="outline"
              size="icon-sm"
              className="absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full shadow"
              onClick={() => { scrollToBottom(true); setIsAtBottom(true); }}
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
    </ChatErrorBoundary>
  );
}
