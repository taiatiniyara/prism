import { getCurrentUser } from "@/lib/user.service";
import SectionContainer from "@/components/layout/section-container";
import StateMessage from "@/components/ui/state-message";
import { getAiSourceConfig } from "@/lib/ai/source-setting";
import AiSettingsForm from "./ai-settings-form";

export default async function AiSettingsPage() {
  const currentUser = await getCurrentUser();

  if (currentUser.role !== "DEV") {
    return (
      <div className="mx-auto w-full max-w-350 space-y-6 pb-8">
        <StateMessage className="p-3 text-sm text-muted-foreground">
          AI Settings can only be accessed by DEV users.
        </StateMessage>
      </div>
    );
  }

  const { primary, secondary } = await getAiSourceConfig();

  return (
    <div className="mx-auto w-full max-w-350 space-y-6 pb-8">
      <SectionContainer className="space-y-4">
        <div>
          <h1 className="text-lg font-semibold">AI Settings</h1>
          <p className="text-sm text-muted-foreground">
            Configure which data source PRISM AI treats as primary for
            performance data, and which (if any) it falls back to. Set the
            secondary to <strong>None</strong> to test the primary source in
            isolation — the other source is then fully disabled for the AI. The
            AI&apos;s source policy is derived from these selections.
          </p>
        </div>
        <AiSettingsForm
          initialPrimary={primary}
          initialSecondary={secondary}
        />
      </SectionContainer>
    </div>
  );
}
