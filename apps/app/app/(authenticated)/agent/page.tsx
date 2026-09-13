import { Suspense } from "react";
import { AgentWorkspace } from "@/components/agent/agent-workspace";
import { PageShell } from "@/components/layout/page-shell";

export default function AgentPage() {
  return (
    <PageShell
      className="max-w-7xl"
      description="Research, strategize and create content with an agent that remembers your voice and workspace."
      page="Agent"
      pages={["Content HQ"]}
      title="Content HQ"
    >
      <Suspense>
        <AgentWorkspace />
      </Suspense>
    </PageShell>
  );
}
