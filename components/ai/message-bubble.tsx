"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, User, ThumbsUp, ThumbsDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VisualizationRenderer } from "./visualizations/visualization-renderer";
import type { AiVisualization } from "@/lib/ai/types";
import { useState } from "react";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface MessageBubbleProps {
  message: ChatMessage;
  onFeedback?: (sentiment: "positive" | "negative", correction?: string) => void;
}

export function MessageBubble({ message, onFeedback }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const [feedbackGiven, setFeedbackGiven] = useState<"positive" | "negative" | null>(null);

  const handleFeedback = (sentiment: "positive" | "negative") => {
    if (feedbackGiven) return;
    setFeedbackGiven(sentiment);
    onFeedback?.(sentiment);
  };

  const visualizations = extractVisualizations(message.content);

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
          isUser ? "bg-primary" : "bg-muted"
        }`}
      >
        {isUser ? (
          <User className="text-primary-foreground size-4" />
        ) : (
          <Bot className="size-4" />
        )}
      </div>

      <div className={`flex max-w-[80%] flex-col gap-2 ${isUser ? "items-end" : ""}`}>
        <div
          className={`rounded-lg px-4 py-2 ${
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-muted"
          }`}
        >
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        </div>

        {visualizations.map((viz, index) => (
          <div key={`viz-${index}`} className="w-full">
            <VisualizationRenderer visualization={viz} />
          </div>
        ))}

        {!isUser && message.id && onFeedback && (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => handleFeedback("positive")}
              disabled={feedbackGiven !== null}
              className={feedbackGiven === "positive" ? "text-green-500" : ""}
              aria-label="Thumbs up"
            >
              <ThumbsUp className="size-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => handleFeedback("negative")}
              disabled={feedbackGiven !== null}
              className={feedbackGiven === "negative" ? "text-red-500" : ""}
              aria-label="Thumbs down"
            >
              <ThumbsDown className="size-3" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function extractVisualizations(content: string): AiVisualization[] {
  const visualizations: AiVisualization[] = [];
  const jsonBlockRegex = /```json\s*([\s\S]*?)```/g;

  let match;
  while ((match = jsonBlockRegex.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed && typeof parsed.type === "string") {
        visualizations.push(parsed as AiVisualization);
      }
    } catch {
      // Invalid JSON, skip
    }
  }

  return visualizations;
}
