"use client";

import dynamic from "next/dynamic";
import type { IReportEmbedConfiguration } from "powerbi-client";

const PowerBIEmbed = dynamic(
  () => import("powerbi-client-react").then((mod) => mod.PowerBIEmbed),
  { ssr: false },
);

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
    tokenType: 1, // models.TokenType.Embed — inlined to avoid SSR evaluation of powerbi-client
  };
  return (
    <PowerBIEmbed
      embedConfig={embedConfig}
      cssClassName="h-[100vh] w-[100%]"
    />
  );
}
