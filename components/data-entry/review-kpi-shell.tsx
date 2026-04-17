import { ReactNode } from "react";
import StateMessage from "@/components/ui/state-message";

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
        <StateMessage
          variant="loading"
          ariaLive="polite"
        >
          Loading KPI rows...
        </StateMessage>
      ) : null}

      {error ? (
        <StateMessage
          variant="error"
          role="alert"
        >
          {error}
        </StateMessage>
      ) : null}

      {!loading && !error && isEmpty ? (
        <StateMessage>{emptyMessage}</StateMessage>
      ) : null}

      {!loading && !error && !isEmpty ? children : null}
    </section>
  );
}
