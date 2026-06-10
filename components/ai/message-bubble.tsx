"use client";

import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, User, ThumbsUp, ThumbsDown, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { VisualizationRenderer } from "./visualizations/visualization-renderer";
import type { AiVisualization } from "@/lib/ai/types";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
}

interface MessageBubbleProps {
  message: ChatMessage;
  onFeedback?: (sentiment: "positive" | "negative", correction?: string) => void;
  onCopy?: (content: string) => void;
  copied?: boolean;
}

export function MessageBubble({ message, onFeedback, onCopy, copied }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const [feedbackGiven, setFeedbackGiven] = useState<"positive" | "negative" | null>(null);
  const [showCorrection, setShowCorrection] = useState(false);
  const [correctionText, setCorrectionText] = useState("");

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
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
          isUser ? "bg-primary dark:bg-primary" : "bg-muted dark:bg-muted"
        }`}
      >
        {isUser ? (
          <User className="text-primary-foreground size-4" />
        ) : (
          <Bot className="size-4 dark:text-foreground" />
        )}
      </div>

      <div className={`flex max-w-[80%] flex-col gap-2 ${isUser ? "items-end" : ""}`}>
        <div
          className={`rounded-lg px-4 py-2 ${
            isUser
              ? "bg-primary text-primary-foreground dark:bg-primary dark:text-primary-foreground"
              : message.isError
                ? "bg-destructive/10 text-destructive dark:bg-destructive/20"
                : "bg-muted dark:bg-muted dark:text-foreground"
          }`}
        >
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        </div>

        {visualizations.length > 0 && visualizations.map((viz, index) => (
          <div key={`viz-${index}`} className="w-full">
            <VisualizationRenderer visualization={viz} />
          </div>
        ))}

        {!isUser && message.id && message.id !== "streaming" && (
          <div className="flex items-center gap-1">
            {onCopy && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => onCopy(message.content)}
                aria-label="Copy message"
              >
                {copied ? <Check className="size-3 text-green-500" /> : <Copy className="size-3" />}
              </Button>
            )}
            {onFeedback && (
              <>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => handleFeedback("positive")}
                  className={feedbackGiven === "positive" ? "text-green-500" : ""}
                  aria-label="Thumbs up"
                >
                  <ThumbsUp className="size-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => handleFeedback("negative")}
                  className={feedbackGiven === "negative" ? "text-red-500" : ""}
                  aria-label="Thumbs down"
                >
                  <ThumbsDown className="size-3" />
                </Button>
              </>
            )}
          </div>
        )}

        {showCorrection && (
          <div className="w-full space-y-1">
            <Textarea
              value={correctionText}
              onChange={(e) => setCorrectionText(e.target.value)}
              placeholder="What went wrong? (optional)"
              className="min-h-[44px] text-xs"
              rows={2}
              aria-label="Correction feedback"
            />
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={submitCorrection}>
                Submit
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowCorrection(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function extractVisualizations(content: string): AiVisualization[] {
  const visualizations: AiVisualization[] = [];
  const jsonBlockRegex = /```json\s*([\s\S]*?)```/g;

  const MAX_VIZ_COUNT = 5;
  const MAX_JSON_SIZE = 50_000;

  let match;
  while ((match = jsonBlockRegex.exec(content)) !== null) {
    if (visualizations.length >= MAX_VIZ_COUNT) break;

    const jsonStr = match[1];
    if (jsonStr.length > MAX_JSON_SIZE) continue;

    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed && typeof parsed.type === "string") {
        visualizations.push(parsed as AiVisualization);
      }
    } catch {
      // Invalid JSON, skip
    }
  }

  return visualizations;
}
