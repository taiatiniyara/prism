import { getCurrentUser } from "@/lib/user.service";
import SectionContainer from "@/components/layout/section-container";
import StateMessage from "@/components/ui/state-message";
import { getAiPrimarySource } from "@/lib/ai/source-setting";
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

  const primary = await getAiPrimarySource();

  return (
    <div className="mx-auto w-full max-w-350 space-y-6 pb-8">
      <SectionContainer className="space-y-4">
        <div>
          <h1 className="text-lg font-semibold">AI Settings</h1>
          <p className="text-sm text-muted-foreground">
            Configure which data source PRISM AI treats as primary for
            performance data. The other source is automatically the secondary
            (used as fallback/verification). The AI&apos;s source policy is
            derived from this selection.
          </p>
        </div>
        <AiSettingsForm initialPrimary={primary} />
      </SectionContainer>
    </div>
  );
}
