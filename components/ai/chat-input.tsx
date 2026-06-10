"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop?: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
}

export function ChatInput({
  onSend,
  onStop,
  isLoading = false,
  disabled = false,
  placeholder = "Ask PRISM AI...",
  maxLength,
}: ChatInputProps) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading || disabled) return;
    if (maxLength && trimmed.length > maxLength) return;
    onSend(trimmed);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const charCount = input.length;
  const isOverLimit = maxLength ? charCount > maxLength : false;

  return (
    <div className="border-border flex flex-col border-t p-4">
      <div className="flex items-end gap-2">
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={maxLength ? maxLength + 100 : undefined}
          className="min-h-[44px] max-h-[200px] resize-none"
          rows={1}
          aria-label="Message input"
        />
        {isLoading ? (
          <Button
            variant="outline"
            size="icon"
            onClick={onStop}
            className="shrink-0"
            aria-label="Stop generating"
          >
            <Square className="size-4" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={!input.trim() || disabled}
            size="icon"
            className="shrink-0"
            aria-label="Send message"
          >
            <Send className="size-4" />
          </Button>
        )}
      </div>
      {maxLength && (
        <div className={`mt-1 text-right text-xs ${isOverLimit ? "text-red-500 font-medium" : "text-muted-foreground"}`}>
          {charCount}/{maxLength}
        </div>
      )}
    </div>
  );
}
