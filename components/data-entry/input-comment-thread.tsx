"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";

import { InputComment } from "@/app/data-entry/review-kpi/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface InputCommentThreadProps {
  dataEntryId: string;
  comments: InputComment[];
  onCommentsUpdated: (comments: InputComment[]) => void;
}

export function InputCommentThread({
  dataEntryId,
  comments,
  onCommentsUpdated,
}: InputCommentThreadProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const orderedComments = useMemo(
    () => [...comments].sort((a, b) => a.date.localeCompare(b.date)),
    [comments],
  );

  const formatCommentTimestamp = (rawDate: string): string => {
    const parsed = new Date(rawDate);
    if (Number.isNaN(parsed.getTime())) {
      return rawDate;
    }

    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(parsed);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const trimmed = String(formData.get("comment") ?? "").trim();

    if (trimmed.length === 0) {
      setError("Please enter a comment.");
      return;
    }

    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/data-entry/review-kpi/inputs/${dataEntryId}/comments`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ comment: trimmed }),
          },
        );

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            message?: string;
          } | null;
          throw new Error(body?.message ?? "Failed to add note.");
        }

        const body = (await response.json()) as { comments: InputComment[] };
        onCommentsUpdated(body.comments);
        event.currentTarget.reset();
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "Failed to add note.",
        );
      }
    });
  };

  return (
    <div className="space-y-1.5 rounded-md border border-dashed border-border/80 bg-muted/10 p-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Notes
      </p>

      <ul className="space-y-4 rounded-sm border border-border/50 bg-background px-1.5 py-1.5">
        {orderedComments.length === 0 ? (
          <li className="text-xs text-muted-foreground">No notes yet.</li>
        ) : (
          orderedComments.map((comment, index) => (
            <li
              key={`${comment.commenterId}-${comment.date}-${index}`}
              className="border-l border-slate-400 bg-muted/20 px-1.5 text-[11px] sm:text-xs"
            >
              <div className="mb-1.5 border-b border-slate-300 pb-1 text-[10px] text-muted-foreground sm:text-[11px]">
                <span className="font-semibold text-foreground/90">
                  {comment.commenterName?.trim() || comment.commenterId}
                </span>
                <span className="mx-1">•</span>
                <span>{comment.commenterRole}</span>
                <span className="mx-1">•</span>
                <span>{formatCommentTimestamp(comment.date)}</span>
              </div>
              <p className="rounded-sm bg-background px-1.5 leading-relaxed text-foreground">
                {comment.comment}
              </p>
            </li>
          ))
        )}
      </ul>

      <form
        className="space-y-1.5"
        onSubmit={handleSubmit}
      >
        <Textarea
          name="comment"
          placeholder="Add a note..."
          disabled={isPending}
          className="min-h-14 text-xs"
        />
        <div className="flex items-center gap-1.5">
          <Button
            type="submit"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={isPending}
          >
            {isPending ? "Posting..." : "Post"}
          </Button>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
      </form>
    </div>
  );
}
