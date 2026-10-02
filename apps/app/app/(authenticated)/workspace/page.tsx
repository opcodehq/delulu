import { EmailPreferences } from "@/features/workspace/email-preferences";
import { WorkspaceMembers } from "@/features/workspace/workspace-members";
import { WorkspaceSettings } from "@/features/workspace/workspace-settings";
import { PageShell } from "@/shell/navigation/page-shell";

export default function WorkspacePage() {
  return (
    <PageShell
      description="Manage your workspace details and team members."
      page="Workspace"
      pages={["Settings"]}
    >
      <WorkspaceSettings />
      <EmailPreferences />
      {/* WorkspaceMembers renders null on personal workspaces, so it manages
          its own section chrome rather than a PageSection that could dangle. */}
      <WorkspaceMembers />
    </PageShell>
  );
}
