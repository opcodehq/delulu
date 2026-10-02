import { useState } from "react";
import { FlowSidebarPanel } from "@/features/automations/flow-builder/flow-sidebar-panel";
import type { SendDmStep } from "@/features/automations/flow-builder/utils/flow-types";

export function DmPreview() {
  const [step, setStep] = useState<SendDmStep>({
    id: "dm",
    type: "send_dm",
    messageTemplate: "Thanks for your interest! Here is your link.",
    buttons: [{ type: "url", title: "Get content", url: "" }],
  });
  return (
    <FlowSidebarPanel
      instagramProviders={[]}
      notes={[]}
      onClose={() => undefined}
      onDeleteStep={() => undefined}
      onSocialProviderChange={() => undefined}
      onUpdateStep={(_, patch) => setStep({ ...step, ...patch } as SendDmStep)}
      onUpdateTrigger={() => undefined}
      selectedId="dm"
      socialProviderId="connection_instagram"
      steps={[step]}
      triggers={[
        {
          id: "trigger",
          type: "trigger",
          triggerType: "COMMENT",
          targetMode: "all",
          targetPostIds: [],
          nextStepId: "dm",
        },
      ]}
    />
  );
}
