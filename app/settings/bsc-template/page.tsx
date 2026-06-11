import { getCurrentUser } from "@/lib/user.service";
import { getTemplate } from "@/app/data-entry/balanced-scorecard/new-bsc/service";
import SectionContainer from "@/components/layout/section-container";
import StateMessage from "@/components/ui/state-message";

import BscTemplateEditor from "./templateEditor";

export default async function BscTemplatePage() {
  const currentUser = await getCurrentUser();
  const canEdit = currentUser.role === "DEV" || currentUser.role === "BMO";

  if (!canEdit) {
    return (
      <div className="mx-auto w-full max-w-350 space-y-6 pb-8">
        <StateMessage className="p-3 text-sm text-muted-foreground">
          The BSC master template can only be edited by DEV and BMO users.
        </StateMessage>
      </div>
    );
  }

  const template = await getTemplate(currentUser).catch(() => ({ nodes: [] }));

  return (
    <div className="mx-auto w-full max-w-350 space-y-6 pb-8">
      <SectionContainer className="space-y-3">
        <div>
          <h1 className="text-lg font-semibold">BSC Master Template</h1>
          <p className="text-sm text-muted-foreground">
            The shared framework utilities build their scorecards from. Mandatory
            nodes appear, locked, on every utility scorecard; optional nodes are
            offered for selection. Changes here propagate to all utilities.
          </p>
        </div>
        <BscTemplateEditor initialNodes={template.nodes} />
      </SectionContainer>
    </div>
  );
}
