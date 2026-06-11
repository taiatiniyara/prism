"use client";

import { useState, useRef, useEffect } from "react";
import { ArrowUp, Square } from "lucide-react";
import { toast } from "sonner";
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
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [input]);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading || disabled) return;
    if (maxLength && trimmed.length > maxLength) {
      toast.error(`Message exceeds the ${maxLength} character limit.`);
      return;
    }
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
    <div className="border-t border-slate-100 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto max-w-3xl">
        <div className="relative flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 shadow-sm transition-colors focus-within:border-slate-300 focus-within:bg-white focus-within:shadow-md dark:border-slate-700 dark:bg-slate-800 dark:focus-within:border-slate-600 dark:focus-within:bg-slate-800">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            maxLength={maxLength ? maxLength + 100 : undefined}
            className="min-h-[24px] max-h-[160px] resize-none border-0 bg-transparent p-0 text-sm leading-relaxed shadow-none placeholder:text-slate-400 focus-visible:ring-0 dark:placeholder:text-slate-500"
            rows={1}
            aria-label="Message input"
          />
          {isLoading ? (
            <button
              onClick={onStop}
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white transition-colors hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
              aria-label="Stop generating"
            >
              <Square className="size-3.5" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || disabled}
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white transition-all hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-30 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
              aria-label="Send message"
            >
              <ArrowUp className="size-4" />
            </button>
          )}
        </div>
        {maxLength && (
          <div className={`mt-1.5 px-1 text-right text-[11px] ${isOverLimit ? "font-medium text-red-500" : "text-slate-400"}`}>
            {charCount}/{maxLength}
          </div>
        )}
      </div>
    </div>
  );
}
