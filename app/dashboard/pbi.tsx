"use client";

import { Component, type ReactNode } from "react";
import dynamic from "next/dynamic";
import type { IReportEmbedConfiguration, models } from "powerbi-client";

const PowerBIEmbed = dynamic(
  () => import("powerbi-client-react").then((mod) => mod.PowerBIEmbed),
  { ssr: false },
);

class EmbedErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
          <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-300">
            Dashboard failed to load
          </h2>
          <p className="text-muted-foreground mt-2 max-w-md text-sm">
            The Power BI dashboard encountered an error. Please refresh the page or contact support.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

// TokenType.Embed = 1
const TOKEN_TYPE_EMBED = 1 satisfies models.TokenType;

export default function PowerBiDashboard(props: {
  token: string;
  embedUrl: string;
  reportId: string;
}) {
  const embedConfig: IReportEmbedConfiguration = {
    type: "report",
    id: props.reportId,
    embedUrl: props.embedUrl,
    accessToken: props.token,
    settings: {
      filterPaneEnabled: false,
      navContentPaneEnabled: false,
    },
    tokenType: TOKEN_TYPE_EMBED,
  };
  return (
    <EmbedErrorBoundary>
      <PowerBIEmbed
        embedConfig={embedConfig}
        cssClassName="h-[100vh] w-[100%]"
      />
    </EmbedErrorBoundary>
  );
}
