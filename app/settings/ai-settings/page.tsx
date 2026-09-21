import { getCurrentUser } from "@/lib/user.service";
import SectionContainer from "@/components/layout/section-container";
import StateMessage from "@/components/ui/state-message";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getAiSourceConfig } from "@/lib/ai/source-setting";
import { getPdfReportStyle } from "@/lib/ai/pdf-settings";
import AiSettingsForm from "./ai-settings-form";
import PdfSettingsForm from "./pdf-settings-form";

export default async function AiSettingsPage() {
  const currentUser = await getCurrentUser();
  const isDev = currentUser.role === "DEV";
  const isBmo = currentUser.role === "BMO";

  if (!isDev && !isBmo) {
    return (
      <div className="mx-auto w-full max-w-350 space-y-6 pb-8">
        <StateMessage className="p-3 text-sm text-muted-foreground">
          AI Settings can only be accessed by DEV or BMO users.
        </StateMessage>
      </div>
    );
  }

  // Data-source config is DEV-only; the PDF style is editable by DEV and BMO.
  const sourceConfig = isDev ? await getAiSourceConfig() : null;
  const pdfStyle = await getPdfReportStyle();

  return (
    <div className="mx-auto w-full max-w-350 space-y-6 pb-8">
      <SectionContainer className="space-y-4">
        <div>
          <h1 className="text-lg font-semibold">AI Settings</h1>
          <p className="text-sm text-muted-foreground">
            Configure PRISM AI&apos;s data sources and the styling of the PDF
            reports it generates.
          </p>
        </div>

        <Tabs defaultValue={isDev ? "source" : "pdf"}>
          <TabsList>
            {isDev && <TabsTrigger value="source">Data Source</TabsTrigger>}
            <TabsTrigger value="pdf">PDF Report</TabsTrigger>
          </TabsList>

          {isDev && sourceConfig && (
            <TabsContent value="source" className="pt-4">
              <p className="mb-4 max-w-2xl text-sm text-muted-foreground">
                Choose which data source PRISM AI treats as primary for
                performance data, and which (if any) it falls back to. Set the
                secondary to <strong>None</strong> to test the primary in
                isolation — the other source is then fully disabled for the AI.
              </p>
              <AiSettingsForm
                initialPrimary={sourceConfig.primary}
                initialSecondary={sourceConfig.secondary}
              />
            </TabsContent>
          )}

          <TabsContent value="pdf" className="pt-4">
            <p className="mb-4 max-w-2xl text-sm text-muted-foreground">
              Style the PDF performance reports PRISM AI generates — colours,
              type sizes, and page layout. Changes apply to every report
              downloaded after saving.
            </p>
            <PdfSettingsForm initialStyle={pdfStyle} />
          </TabsContent>
        </Tabs>
      </SectionContainer>
    </div>
  );
}
