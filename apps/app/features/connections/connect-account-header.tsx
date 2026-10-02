"use client";
import { Button } from "@delulu/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@delulu/design-system/components/ui/dialog";
import { SocialIcon } from "@delulu/design-system/components/ui/social-icon";
import {
  type SupportedSocialPlatform,
  socialBackgroundColors,
  socialDescriptions,
  socialDisplayNames,
} from "@delulu/design-system/lib/social-config";
import { Icon } from "@delulu/design-system/providers/icon";
import { Loading03Icon, Plus } from "@delulu/icons";
import { InlineUpgradePrompt } from "@/features/billing/upgrade-prompt";
import { useUsageLimit } from "@/features/billing/use-usage-limits";
import { useApiClient } from "@/shell/providers/api-client";
import { useWorkspaceSelection } from "@/shell/providers/workspace";
import {
  ResourceBoundary,
  useMutationAtom,
  useResourceAtom,
} from "@/shell/state/resources";
import { useFeatureFlag } from "@/shell/use-feature-flag";

const ALL_SOCIAL_PLATFORMS: SupportedSocialPlatform[] = [
  "TWITTER",
  "LINKEDIN",
  "TIKTOK",
  "INSTAGRAM",
  "THREADS",
  "FACEBOOK",
  // 'PINTEREST',
  // 'FARCASTER',
  "YOUTUBE",
];

function useSocialPlatforms() {
  const twitterEnabled = useFeatureFlag("twitter");
  return ALL_SOCIAL_PLATFORMS.filter((p) => p !== "TWITTER" || twitterEnabled);
}

function ConnectPlatformButton({
  platform,
}: {
  platform: SupportedSocialPlatform;
}) {
  const { workspaceId } = useWorkspaceSelection();
  const { resources } = useApiClient();
  const connect = useMutationAtom(
    resources.connections.mint(workspaceId ?? "", platform)
  );

  return (
    <Button
      className="justify-start gap-3"
      disabled={!workspaceId || platform === "FARCASTER" || connect.isPending}
      onClick={async () => {
        const result = await connect.mutateAsync({ includeInsights: true });
        window.location.assign(result.url);
      }}
      size="content"
      variant="outline"
    >
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
          socialBackgroundColors[platform]
        } shadow-sm`}
      >
        {connect.isPending ? (
          <Icon
            className="animate-spin text-white"
            icon={Loading03Icon}
            size={20}
          />
        ) : (
          <SocialIcon className="text-white" size="md" type={platform} />
        )}
      </div>
      <div className="flex min-w-0 flex-col items-start">
        <span className="font-medium">{socialDisplayNames[platform]}</span>
        <span className="text-muted-foreground text-sm">
          {connect.isPending ? "Connecting…" : socialDescriptions[platform]}
        </span>
      </div>
    </Button>
  );
}

export function ConnectAccountDialog() {
  return (
    <ResourceBoundary
      fallback={<Button disabled>Connect Account</Button>}
      renderError={(_error, retry) => (
        <Button onClick={retry} variant="outline">
          Retry connection options
        </Button>
      )}
    >
      <ConnectAccountDialogContent />
    </ResourceBoundary>
  );
}

function ConnectAccountDialogContent() {
  const { workspaceId } = useWorkspaceSelection();
  const { resources } = useApiClient();
  const accounts = useResourceAtom({
    ...resources.connections.list(workspaceId ?? "", { limit: 100 }),
    enabled: Boolean(workspaceId),
  });
  const limitCheck = useUsageLimit("socialAccounts", accounts.data?.total ?? 0);
  const isAtLimit = !limitCheck.allowed;
  const platforms = useSocialPlatforms();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button disabled={isAtLimit}>
          <Icon className="mr-2" icon={Plus} size={16} />
          Connect Account
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect Social Account</DialogTitle>
          <DialogDescription>
            {isAtLimit
              ? `You've reached your ${limitCheck.planType} plan limit of ${limitCheck.limit} social accounts`
              : "All connections use official platform APIs. Your passwords never touch our servers."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-2 py-2">
          {isAtLimit ? (
            <InlineUpgradePrompt feature="socialAccounts" />
          ) : (
            platforms.map((platform) => (
              <ConnectPlatformButton key={platform} platform={platform} />
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
