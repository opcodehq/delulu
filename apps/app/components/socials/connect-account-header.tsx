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
import { InlineUpgradePrompt } from "@/components/billing/upgrade-prompt";
import { useApiClient } from "@/components/providers/api-client";
import { useActiveWorkspace } from "@/hooks/use-active-workspace";
import { useFeatureFlag } from "@/hooks/use-feature-flag";
import { useUsageLimit } from "@/hooks/use-usage-limits";
import { useMutationAtom, useResourceAtom } from "@/state/resources";

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
  const { workspaceId } = useActiveWorkspace();
  const { resources } = useApiClient();
  const connect = useMutationAtom(
    resources.connections.mint(workspaceId ?? "", platform)
  );

  if (platform === "FARCASTER") {
    return (
      <Button
        className="flex h-14 items-center justify-start space-x-4 px-4"
        disabled
        variant="outline"
      >
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-lg ${
            socialBackgroundColors[platform]
          } shadow-sm`}
        >
          <SocialIcon className="text-white" size="md" type={platform} />
        </div>
        <div className="flex flex-col items-start">
          <span className="font-medium">{socialDisplayNames[platform]}</span>
          <span className="text-muted-foreground text-sm">
            {socialDescriptions[platform]}
          </span>
        </div>
      </Button>
    );
  }

  if (!workspaceId) {
    return (
      <Button
        className="flex h-14 items-center justify-start space-x-4 px-4"
        disabled
        variant="outline"
      >
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-lg ${
            socialBackgroundColors[platform]
          } shadow-sm`}
        >
          <SocialIcon className="text-white" size="md" type={platform} />
        </div>
        <div className="flex flex-col items-start">
          <span className="font-medium">{socialDisplayNames[platform]}</span>
          <span className="text-muted-foreground text-sm">
            {socialDescriptions[platform]}
          </span>
        </div>
      </Button>
    );
  }

  return (
    <Button
      className="flex h-14 items-center justify-start space-x-4 px-4"
      disabled={connect.isPending}
      onClick={async () => {
        const result = await connect.mutateAsync({ includeInsights: true });
        window.location.assign(result.url);
      }}
      variant="outline"
    >
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-lg ${
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
      <div className="flex flex-col items-start">
        <span className="font-medium">{socialDisplayNames[platform]}</span>
        <span className="text-muted-foreground text-sm">
          {connect.isPending ? "Connecting…" : socialDescriptions[platform]}
        </span>
      </div>
    </Button>
  );
}

export function ConnectAccountDialog() {
  const { workspaceId } = useActiveWorkspace();
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
        <div className="grid grid-cols-1 gap-4 py-4">
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
