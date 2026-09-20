"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export interface ChartFollowUpHandle {
  openWithSuggestion: (text: string) => void;
}

interface ChartFollowUpProps {
  contextText: string;
  onAsk: (text: string) => void;
  placeholder?: string;
  suggestion?: string;
}

export const ChartFollowUp = forwardRef<ChartFollowUpHandle, ChartFollowUpProps>(
  function ChartFollowUp({ contextText, onAsk, placeholder, suggestion }, ref) {
    const [open, setOpen] = useState(false);
    const [text, setText] = useState("");
    const lastSuggestionRef = useRef("");

    useImperativeHandle(
      ref,
      () => ({
        openWithSuggestion: (next) => {
          setText(next);
          setOpen(true);
        },
      }),
      [],
    );

    useEffect(() => {
      if (suggestion && suggestion !== lastSuggestionRef.current) {
        lastSuggestionRef.current = suggestion;
        setText(suggestion);
        setOpen(true);
      }
    }, [suggestion]);

    const submit = () => {
      const trimmed = text.trim();
      if (!trimmed) return;
      onAsk(contextText ? `${contextText}\n\n${trimmed}` : trimmed);
      setOpen(false);
      setText("");
    };

    return (
      <div className="flex flex-col gap-2">
        {open ? (
          <>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={placeholder ?? "Ask a follow-up about this chart…"}
              className="min-h-[60px] text-xs"
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
              }}
            />
            <div className="flex justify-end gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setOpen(false);
                  setText("");
                }}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={submit} disabled={!text.trim()}>
                <SendHorizontal className="mr-1 size-3" />
                Send
              </Button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs font-medium transition-colors"
          >
            <SendHorizontal className="size-3" />
            Analyze this chart
          </button>
        )}
      </div>
    );
  },
);