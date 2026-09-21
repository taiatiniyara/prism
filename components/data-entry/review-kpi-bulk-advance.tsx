"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { ReviewKpiBulkAdvanceResult } from "@/app/data-entry/review-kpi/types";
import { Button } from "@/components/ui/button";

export function ReviewKpiBulkAdvance() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onAdvance = () => {
    if (
      !window.confirm(
        "Advance every Entered input currently in view to Reviewed? Inputs flagged as outliers will be held at Entered for your attention.",
      )
    ) {
      return;
    }

    setMessage(null);
    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch(
          "/api/data-entry/review-kpi/bulk-advance",
          { method: "POST" },
        );

        const body = (await response
          .json()
          .catch(() => null)) as (ReviewKpiBulkAdvanceResult & {
          message?: string;
        }) | null;

        if (!response.ok || body == null) {
          throw new Error(body?.message ?? "Unable to advance entries.");
        }

        setMessage(
          body.advanced === 0 && body.held === 0
            ? "No Entered inputs to advance."
            : `Advanced ${body.advanced} input${body.advanced === 1 ? "" : "s"} to Reviewed` +
                (body.held > 0
                  ? `, held ${body.held} flagged input${body.held === 1 ? "" : "s"} at Entered.`
                  : ".")
        );
        router.refresh();
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "Unable to advance entries.",
        );
      }
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 px-3">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={isPending}
        onClick={onAdvance}
      >
        {isPending ? "Advancing..." : "Advance Entered → Reviewed"}
      </Button>
      <div
        role="status"
        aria-live="polite"
      >
        {message ? (
          <p className="text-xs text-muted-foreground">{message}</p>
        ) : null}
        {error ? (
          <p
            className="text-xs text-destructive"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
