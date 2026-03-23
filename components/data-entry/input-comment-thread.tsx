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
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const orderedComments = useMemo(
    () => [...comments].sort((a, b) => a.date.localeCompare(b.date)),
    [comments],
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = draft.trim();

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
          throw new Error(body?.message ?? "Failed to add comment.");
        }

        const body = (await response.json()) as { comments: InputComment[] };
        onCommentsUpdated(body.comments);
        setDraft("");
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "Failed to add comment.",
        );
      }
    });
  };

  return (
    <div className="space-y-1.5 rounded-md border border-dashed border-border/80 bg-muted/10 p-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Comments
      </p>

      <ul className="space-y-1 rounded-sm border border-border/50 bg-background px-1.5 py-1">
        {orderedComments.length === 0 ? (
          <li className="text-xs text-muted-foreground">No comments yet.</li>
        ) : (
          orderedComments.map((comment, index) => (
            <li
              key={`${comment.commenterId}-${comment.date}-${index}`}
              className="text-[11px] sm:text-xs"
            >
              <p className="font-medium">{comment.commenterRole}</p>
              <p>{comment.comment}</p>
            </li>
          ))
        )}
      </ul>

      <form
        className="space-y-1.5"
        onSubmit={handleSubmit}
      >
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a comment"
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
            {isPending ? "Saving..." : "Add comment"}
          </Button>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
      </form>
    </div>
  );
}
