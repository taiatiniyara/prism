"use client";

import { Component, type ReactNode } from "react";
import { logger } from "@/lib/logging/logger";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ChatErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error("[ai-chat] Render error", { error: error.message, componentStack: errorInfo.componentStack });
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <p className="text-sm font-medium text-red-600 dark:text-red-400">Something went wrong</p>
          <p className="text-muted-foreground mt-1 text-xs">
            The chat encountered an error. Please try refreshing the page.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
