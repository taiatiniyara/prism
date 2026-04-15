import { ReactNode } from "react";

interface ReviewKpiShellProps {
  loading?: boolean;
  error?: string | null;
  isEmpty?: boolean;
  emptyMessage?: string;
  children: ReactNode;
}

export function ReviewKpiShell({
  loading = false,
  error = null,
  isEmpty = false,
  emptyMessage = "No KPI rows are available for the selected filters.",
  children,
}: ReviewKpiShellProps) {
  return (
    <section className="space-y-2">
      {loading ? (
        <div
          className="rounded-md border bg-muted/30 p-2 text-xs sm:text-sm"
          aria-live="polite"
        >
          Loading KPI rows...
        </div>
      ) : null}

      {error ? (
        <div
          className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive sm:text-sm"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {!loading && !error && isEmpty ? (
        <div className="rounded-md border bg-muted/20 p-2 text-xs sm:text-sm">
          {emptyMessage}
        </div>
      ) : null}

      {!loading && !error && !isEmpty ? children : null}
    </section>
  );
}
