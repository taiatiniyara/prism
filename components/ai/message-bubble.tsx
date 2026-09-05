"use client";

import { useMemo, useState, useCallback, memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { ThumbsUp, ThumbsDown, Copy, Check, RefreshCw, ChevronDown } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { VisualizationRenderer } from "./visualizations/visualization-renderer";
import type { AiVisualization } from "@/lib/ai/types";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
  reasoningContent?: string;
}

interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
  reasoningContent?: string;
  toolProgress?: Array<{ name: string; status: "running" | "done" | "error" }>;
  onFeedback?: (sentiment: "positive" | "negative", correction?: string) => void;
  onCopy?: (content: string) => void;
  onRegenerate?: () => void;
  copied?: boolean;
}

function CodeBlock({ lang, code, children, ...props }: { lang: string; code: string; children: React.ReactNode } & React.HTMLAttributes<HTMLElement>) {
  const [blockCopied, setBlockCopied] = useState(false);
  const handleCopyBlock = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setBlockCopied(true);
      setTimeout(() => setBlockCopied(false), 2000);
    }).catch(() => {});
  }, [code]);

  return (
    <div className="my-3 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-1 dark:border-slate-700 dark:bg-slate-900">
        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">{lang}</span>
        <button
          onClick={handleCopyBlock}
          className="rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          aria-label="Copy code"
        >
          {blockCopied ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
        </button>
      </div>
      <pre className="overflow-x-auto bg-slate-50 p-4 text-[13px] leading-relaxed dark:bg-slate-900">
        <code className={props.className} {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
}

const markdownComponents: Components = {
  code({ className, children, ...props }) {
    const isBlock = className?.startsWith("language-");
    if (isBlock && className) {
      const lang = className.replace("language-", "");
      const codeString = String(children).replace(/\n$/, "");
      return <CodeBlock lang={lang} code={codeString} {...props}>{children}</CodeBlock>;
    }
    return (
      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[13px] font-medium text-slate-800 dark:bg-slate-800 dark:text-slate-200" {...props}>
        {children}
      </code>
    );
  },
  table({ children }) {
    return (
      <div className="my-3 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="w-full text-[13px]">{children}</table>
      </div>
    );
  },
  th({ children }) {
    return (
      <th className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
        {children}
      </th>
    );
  },
  td({ children }) {
    return (
      <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-800">
        {children}
      </td>
    );
  },
};

interface ReasoningStep {
  label: string;
  icon: string;
  content: string;
}

const REASONING_STEP_PATTERNS: { pattern: RegExp; label: string; icon: string }[] = [
  { pattern: /\b\d+\.\s*\*?\*?Diagnose\b/i, label: "Diagnose", icon: "🔍" },
  { pattern: /\b\d+\.\s*\*?\*?Connect\b/i, label: "Connect", icon: "🔗" },
  { pattern: /\b\d+\.\s*\*?\*?Position\b/i, label: "Position", icon: "📊" },
  { pattern: /\b\d+\.\s*\*?\*?Recommend\b/i, label: "Recommend", icon: "💡" },
  { pattern: /\b\d+\.\s*\*?\*?Caveat\b/i, label: "Caveat", icon: "⚠️" },
];

function parseReasoningSteps(text: string): ReasoningStep[] {
  if (!text) return [];

  const indices: { index: number; stepIndex: number }[] = [];
  for (let i = 0; i < REASONING_STEP_PATTERNS.length; i++) {
    const match = text.match(REASONING_STEP_PATTERNS[i].pattern);
    if (match && match.index !== undefined) {
      indices.push({ index: match.index, stepIndex: i });
    }
  }

  indices.sort((a, b) => a.index - b.index);

  if (indices.length < 2) return [];

  const steps: ReasoningStep[] = [];
  for (let i = 0; i < indices.length; i++) {
    const { index, stepIndex } = indices[i];
    const nextIndex = i + 1 < indices.length ? indices[i + 1].index : text.length;
    const content = text.slice(index, nextIndex).replace(REASONING_STEP_PATTERNS[stepIndex].pattern, "").trim();
    if (content) {
      steps.push({
        label: REASONING_STEP_PATTERNS[stepIndex].label,
        icon: REASONING_STEP_PATTERNS[stepIndex].icon,
        content,
      });
    }
  }

  return steps;
}

function MessageBubbleInner({ message, isStreaming, reasoningContent, toolProgress, onFeedback, onCopy, onRegenerate, copied }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const [feedbackGiven, setFeedbackGiven] = useState<"positive" | "negative" | null>(null);
  const [showCorrection, setShowCorrection] = useState(false);
  const [correctionText, setCorrectionText] = useState("");
  const [thinkingOpen, setThinkingOpen] = useState(isStreaming ?? false);

  const visualizations = useMemo(
    () => extractVisualizations(message.content),
    [message.content],
  );

  const handleFeedback = (sentiment: "positive" | "negative") => {
    if (feedbackGiven === sentiment) {
      setFeedbackGiven(null);
      return;
    }
    setFeedbackGiven(sentiment);
    if (sentiment === "negative") {
      setShowCorrection(true);
    } else {
      setShowCorrection(false);
      onFeedback?.(sentiment);
    }
  };

  const submitCorrection = () => {
    onFeedback?.("negative", correctionText.trim() || undefined);
    setShowCorrection(false);
  };

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""} animate-in fade-in slide-in-from-bottom-1 duration-200`}>
      <div
        className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
          isUser
            ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
            : "bg-slate-100 text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700"
        }`}
      >
        {isUser ? "Y" : "AI"}
      </div>

      <div className={`flex max-w-[80%] flex-col ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={`text-sm leading-relaxed ${
            isUser
              ? "rounded-2xl rounded-br-md bg-slate-100 px-4 py-2.5 text-slate-800 dark:bg-slate-800 dark:text-slate-100"
              : message.isError
                ? "rounded-2xl rounded-bl-md bg-danger/10 px-4 py-2.5 text-danger dark:bg-red-950 dark:text-red-300"
                : "px-1 py-0.5 text-slate-700 dark:text-slate-300"
          }`}
        >
          {!isUser && (reasoningContent || message.reasoningContent) && (() => {
            const reasoningText = reasoningContent || message.reasoningContent || "";
            const steps = parseReasoningSteps(reasoningText);

            return (
            <div className="mb-3 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setThinkingOpen(!thinkingOpen)}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/50"
              >
                <ChevronDown className={`size-3 transition-transform ${thinkingOpen ? "" : "-rotate-90"}`} />
                {isStreaming ? "Thinking…" : "Thought for a moment"}
              </button>
              {thinkingOpen && (
                <div className="border-t border-slate-100 dark:border-slate-800">
                  {toolProgress && toolProgress.length > 0 && (
                    <div className="border-b border-slate-100 px-3 py-1.5 dark:border-slate-800">
                      {toolProgress.map((tool, i) => (
                        <div key={i} className="flex items-center gap-2 py-0.5 text-xs">
                          {tool.status === "running" ? (
                            <span className="inline-block size-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                          ) : tool.status === "error" ? (
                            <span className="inline-block size-1.5 rounded-full bg-red-400 shrink-0" />
                          ) : (
                            <span className="inline-block size-1.5 rounded-full bg-success shrink-0" />
                          )}
                          <span className="text-slate-500 dark:text-slate-400">{tool.name}</span>
                          {tool.status === "running" && (
                            <span className="text-slate-400 dark:text-slate-500 animate-pulse">running...</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {steps.length > 0 ? (
                    steps.map((step, i) => (
                      <details key={i} className="group border-b border-slate-100 last:border-b-0 dark:border-slate-800">
                        <summary className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs text-slate-500 transition-colors hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/50 [&::-webkit-details-marker]:hidden">
                          <ChevronDown className="size-2.5 transition-transform group-open:rotate-0 -rotate-90 shrink-0" />
                          <span>{step.icon}</span>
                          <span className="font-medium">{step.label}</span>
                        </summary>
                        <div className="px-3 pb-2 pt-0 pl-9 text-xs leading-relaxed text-slate-400 dark:text-slate-500">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {step.content}
                          </ReactMarkdown>
                        </div>
                      </details>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-xs leading-relaxed text-slate-400 dark:text-slate-500">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {reasoningText}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              )}
            </div>
            );
          })()}
          <div className={`chat-prose ${isStreaming ? "streaming-cursor" : ""}`}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={markdownComponents}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        </div>

        {visualizations.length > 0 && visualizations.map((viz, index) => (
          <div key={`viz-${index}`} className="mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
            <VisualizationRenderer visualization={viz} />
          </div>
        ))}

        {!isUser && message.id && message.id !== "streaming" && (
          <div className="mt-1 flex items-center gap-0.5">
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                aria-label="Regenerate response"
              >
                <RefreshCw className="size-3" />
              </button>
            )}
            {onCopy && (
              <button
                onClick={() => onCopy(message.content)}
                className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                aria-label="Copy message"
              >
                {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
              </button>
            )}
            {onFeedback && (
              <>
                <button
                  onClick={() => handleFeedback("positive")}
                  className={`rounded-md p-1 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 ${
                    feedbackGiven === "positive" ? "text-success" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  }`}
                  aria-label="Thumbs up"
                >
                  <ThumbsUp className="size-3" />
                </button>
                <button
                  onClick={() => handleFeedback("negative")}
                  className={`rounded-md p-1 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 ${
                    feedbackGiven === "negative" ? "text-danger" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  }`}
                  aria-label="Thumbs down"
                >
                  <ThumbsDown className="size-3" />
                </button>
              </>
            )}
          </div>
        )}

        {showCorrection && (
          <div className="mt-2 w-full space-y-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
            <Textarea
              value={correctionText}
              onChange={(e) => setCorrectionText(e.target.value)}
              placeholder="What went wrong? (optional)"
              className="min-h-[44px] border-slate-200 text-xs dark:border-slate-700"
              rows={2}
              aria-label="Correction feedback"
            />
            <div className="flex gap-1.5">
              <button onClick={submitCorrection} className="rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200">
                Submit
              </button>
              <button onClick={() => setShowCorrection(false)} className="rounded-lg px-3 py-1.5 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function extractVisualizations(content: string): AiVisualization[] {
  const visualizations: AiVisualization[] = [];
  const MAX_VIZ_COUNT = 5;
  const MAX_JSON_SIZE = 50_000;

  const blocks: string[] = [];
  let depth = 0;
  let currentBlock = "";
  let inBlock = false;

  for (let i = 0; i < content.length; i++) {
    if (content.slice(i, i + 3) === "```" && !inBlock) {
      if (depth === 0) {
        inBlock = true;
        currentBlock = "";
        let j = i + 3;
        while (j < content.length && content[j] !== "\n" && content[j] !== "\r") {
          j++;
        }
        i = j;
        continue;
      }
      depth++;
    }

    if (content.slice(i, i + 3) === "```" && inBlock) {
      if (depth === 0) {
        blocks.push(currentBlock);
        inBlock = false;
        i += 2;
        continue;
      }
      depth--;
    }

    if (inBlock) {
      currentBlock += content[i];
    }
  }

  for (const block of blocks) {
    if (visualizations.length >= MAX_VIZ_COUNT) break;
    if (block.length > MAX_JSON_SIZE) continue;

    const trimmed = block.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) continue;

    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed.type === "string") {
        visualizations.push(parsed as AiVisualization);
      }
    } catch {
      // Not valid JSON, skip
    }
  }

  if (visualizations.length === 0) {
    const vizTypes = "(bar-chart|line-chart|table|leaderboard|scatter|radar|sankey|heatmap)";
    const jsonObjectRegex = new RegExp(`\\{[\\s\\S]*?"type"\\s*:\\s*"${vizTypes}"[\\s\\S]*?\\}`, "g");
    let match;
    while ((match = jsonObjectRegex.exec(content)) !== null) {
      if (visualizations.length >= MAX_VIZ_COUNT) break;
      if (match[0].length > MAX_JSON_SIZE) continue;
      try {
        const parsed = JSON.parse(match[0]);
        if (parsed && typeof parsed.type === "string") {
          visualizations.push(parsed as AiVisualization);
        }
      } catch {
        // skip
      }
    }
  }

  return visualizations;
}

export const MessageBubble = memo(MessageBubbleInner);
