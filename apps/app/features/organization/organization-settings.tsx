"use client";

import { OrganizationProfile } from "@delulu/auth";
import { Icon } from "@delulu/design-system/providers/icon";
import { Share08Icon } from "@delulu/icons";
import { SharingPolicy } from "@/features/workspace/sharing-policy";
import { AppLink as Link } from "@/shell/navigation/app-link";
import { PageShell } from "@/shell/navigation/page-shell";
import { useWorkspaceSelection } from "@/shell/providers/workspace";

/**
 * Team workspace settings live in Clerk's organization profile (name, logo,
 * members, invitations, roles). Delulu-specific policies are added to it as
 * custom pages so admins manage everything in one place.
 */
export function OrganizationSettings() {
  const { workspace, isLoading } = useWorkspaceSelection();

  if (isLoading) {
    return null;
  }

  if (!workspace || workspace.isPersonal || !workspace.clerkOrgId) {
    return (
      <PageShell
        description="Organization settings are available for team workspaces."
        page="Organization"
        pages={["Settings"]}
      >
        <p className="text-muted-foreground text-sm">
          {workspace?.isPersonal
            ? "This is your personal workspace, so there's no team to manage. Switch to a team workspace in the sidebar to manage its members and sharing."
            : "This workspace isn't linked to an organization yet."}{" "}
          <Link className="underline underline-offset-4" href="/">
            Back to dashboard
          </Link>
        </p>
      </PageShell>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 justify-center overflow-y-auto p-4 sm:p-8">
      <OrganizationProfile path="/organization" routing="path">
        <OrganizationProfile.Page
          label="Sharing"
          labelIcon={<Icon icon={Share08Icon} size={16} />}
          url="sharing"
        >
          <SharingPolicy />
        </OrganizationProfile.Page>
      </OrganizationProfile>
    </div>
  );
}
