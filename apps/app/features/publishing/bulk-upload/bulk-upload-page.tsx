"use client";

import { BULK_UPLOAD_SCHEDULED } from "@delulu/analytics/events";
import { useAnalytics } from "@delulu/analytics/posthog/client";
import {
  Alert,
  AlertDescription,
} from "@delulu/design-system/components/ui/alert";
import { Button } from "@delulu/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@delulu/design-system/components/ui/card";
import { Icon } from "@delulu/design-system/providers/icon";
import { AlertCircleIcon, Loading03Icon } from "@delulu/icons";
import { useCallback, useEffect, useReducer } from "react";
import { PiPaperPlaneTiltFill } from "react-icons/pi";
import { toast } from "sonner";
import { InlineUpgradePrompt } from "@/features/billing/upgrade-prompt";
import { useUsageLimit } from "@/features/billing/use-usage-limits";
import { BulkDropzone } from "@/features/publishing/bulk-upload/bulk-dropzone";
import { BulkSocialSelector } from "@/features/publishing/bulk-upload/bulk-social-selector";
import type {
  BulkVideo,
  SelectedProvider,
} from "@/features/publishing/bulk-upload/bulk-upload-reducer";
import {
  bulkUploadReducer,
  computeScheduledAt,
  initialState,
} from "@/features/publishing/bulk-upload/bulk-upload-reducer";
import { BulkVideoList } from "@/features/publishing/bulk-upload/bulk-video-list";
import { ScheduleConfig } from "@/features/publishing/bulk-upload/schedule-config";
import {
  PLATFORM_VIDEO_RULES,
  validateVideo,
} from "@/features/publishing/platform-rules";
import { useMediaStorage } from "@/features/publishing/use-media-storage";
import { PageShell } from "@/shell/navigation/page-shell";
import { useAppRouter as useRouter } from "@/shell/navigation/route-transition";
import { useApiClient } from "@/shell/providers/api-client";
import { useWorkspaceSelection } from "@/shell/providers/workspace";
import {
  useMutationAtom as useApiMutation,
  useResourceAtom,
} from "@/shell/state/resources";
import { usePermissions } from "@/shell/use-permissions";

type PlatformSettingsValue =
  | {
      readonly platform: "BLUESKY";
      readonly values: { readonly replyDisabled?: boolean };
    }
  | {
      readonly platform: "FACEBOOK";
      readonly values: { readonly privacy: "PUBLIC" | "FRIENDS" | "ONLY_ME" };
    }
  | {
      readonly platform: "FARCASTER";
      readonly values: { readonly channelId?: string };
    }
  | {
      readonly platform: "INSTAGRAM";
      readonly values: {
        readonly shareToFeed: boolean;
        readonly shareToStory: boolean;
        readonly trialReels: boolean;
        readonly graduationStrategy: "MANUAL" | "SS_PERFORMANCE";
      };
    }
  | {
      readonly platform: "LINKEDIN";
      readonly values: { readonly visibility: "PUBLIC" | "CONNECTIONS" };
    }
  | {
      readonly platform: "PINTEREST";
      readonly values: { readonly boardId?: string };
    }
  | {
      readonly platform: "THREADS";
      readonly values: {
        readonly replyControl: "everyone" | "following" | "mentioned";
      };
    }
  | {
      readonly platform: "TIKTOK";
      readonly values: {
        readonly privacy:
          | "PUBLIC_TO_EVERYONE"
          | "MUTUAL_FOLLOW_FRIENDS"
          | "FOLLOWER_OF_CREATOR"
          | "SELF_ONLY";
        readonly allowComments: boolean;
        readonly allowDuet: boolean;
        readonly allowStitch: boolean;
        readonly promotionContent: "NONE" | "SELF" | "PAID" | "BOTH";
      };
    }
  | {
      readonly platform: "TWITTER";
      readonly values: {
        readonly replyRestriction: "everyone" | "following" | "mentioned";
      };
    }
  | {
      readonly platform: "YOUTUBE";
      readonly values: {
        readonly privacy: "PUBLIC" | "PRIVATE" | "UNLISTED";
        readonly madeForKids: boolean;
        readonly ageRestriction?: boolean;
      };
    };

function defaultPlatformSettings(
  platform: SelectedProvider["socialType"]
): PlatformSettingsValue {
  switch (platform) {
    case "BLUESKY":
      return { platform, values: {} } as const;
    case "FACEBOOK":
      return { platform, values: { privacy: "PUBLIC" as const } } as const;
    case "FARCASTER":
      return { platform, values: {} } as const;
    case "INSTAGRAM":
      return {
        platform,
        values: {
          shareToFeed: true,
          shareToStory: false,
          trialReels: false,
          graduationStrategy: "MANUAL" as const,
        },
      } as const;
    case "LINKEDIN":
      return { platform, values: { visibility: "PUBLIC" as const } } as const;
    case "PINTEREST":
      return { platform, values: {} } as const;
    case "THREADS":
      return {
        platform,
        values: { replyControl: "everyone" as const },
      } as const;
    case "TIKTOK":
      return {
        platform,
        values: {
          privacy: "PUBLIC_TO_EVERYONE" as const,
          allowComments: true,
          allowDuet: true,
          allowStitch: true,
          promotionContent: "NONE" as const,
        },
      } as const;
    case "TWITTER":
      return {
        platform,
        values: { replyRestriction: "everyone" as const },
      } as const;
    case "YOUTUBE":
      return {
        platform,
        values: { privacy: "PUBLIC" as const, madeForKids: false },
      } as const;
    default:
      throw new Error(`Unsupported connection platform: ${platform}`);
  }
}

export function BulkUploadPage() {
  const [state, dispatch] = useReducer(bulkUploadReducer, initialState);
  const { uploadAndSaveMedia } = useMediaStorage();
  const { workspaceId } = useWorkspaceSelection();
  const { resources } = useApiClient();
  const bulkCreate = useApiMutation(
    resources.posts.bulkCreate(workspaceId ?? "")
  );
  const router = useRouter();
  const analytics = useAnalytics();
  const { requiresApproval, isViewer } = usePermissions();

  const usage = useResourceAtom({
    ...resources.billing.usage(workspaceId ?? ""),
    enabled: Boolean(workspaceId),
  });
  const monthlyPostsCount = usage.data?.usage.monthlyPosts ?? 0;
  const monthlyPostsLimit = useUsageLimit("monthlyPosts", monthlyPostsCount);
  const postsRemaining = monthlyPostsLimit.isUnlimited
    ? Number.POSITIVE_INFINITY
    : Math.max(0, (monthlyPostsLimit.limit ?? 0) - monthlyPostsCount);

  const isSubmitting = state.submissionStatus === "submitting";
  const allUploaded = state.videos.every(
    (video) => video.uploadStatus === "uploaded" && video.uploadResult?.mediaId
  );
  const hasVideos = state.videos.length > 0;
  const hasProviders = state.selectedProviders.length > 0;
  const hasSchedule = state.startDate !== null;
  const hasValidationErrors = state.videos.some(
    (v) => v.validationErrors.length > 0
  );
  const exceedsLimit =
    !monthlyPostsLimit.isUnlimited && state.videos.length > postsRemaining;

  const canSubmit =
    hasVideos &&
    hasProviders &&
    hasSchedule &&
    allUploaded &&
    !hasValidationErrors &&
    !exceedsLimit &&
    !isSubmitting &&
    !isViewer;

  // Warn before closing with in-progress work
  useEffect(() => {
    if (!hasVideos) {
      return;
    }
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasVideos]);

  // Validate videos when platforms change
  useEffect(() => {
    const validateAll = async () => {
      for (const video of state.videos) {
        const errors: string[] = [];
        for (const provider of state.selectedProviders) {
          const rules =
            PLATFORM_VIDEO_RULES[
              provider.socialType as keyof typeof PLATFORM_VIDEO_RULES
            ];
          if (rules) {
            const result = await validateVideo(video.file, rules);
            if (!result.isValid) {
              errors.push(
                ...result.errors.map((e) => `${provider.socialType}: ${e}`)
              );
            }
          }
        }
        dispatch({ type: "SET_VALIDATION_ERRORS", id: video.id, errors });
      }
    };
    if (state.selectedProviders.length > 0 && state.videos.length > 0) {
      validateAll();
    }
  }, [state.selectedProviders, state.videos.length]);

  const handleFilesSelected = useCallback(
    async (newVideos: BulkVideo[]) => {
      dispatch({ type: "ADD_VIDEOS", videos: newVideos });

      // Upload all in parallel
      for (const video of newVideos) {
        dispatch({
          type: "SET_UPLOAD_STATUS",
          id: video.id,
          status: "uploading",
        });

        uploadAndSaveMedia(video.file)
          .then((result) => {
            dispatch({
              type: "SET_UPLOAD_STATUS",
              id: video.id,
              status: "uploaded",
              result: {
                bucketKey: result.bucketKey,
                url: result.url,
                mediaId: result.mediaId,
              },
            });
          })
          .catch(() => {
            dispatch({
              type: "SET_UPLOAD_STATUS",
              id: video.id,
              status: "failed",
            });
            toast.error(`Failed to upload ${video.file.name}`);
          });
      }
    },
    [uploadAndSaveMedia]
  );

  const handleToggleProvider = useCallback((provider: SelectedProvider) => {
    dispatch({ type: "TOGGLE_PROVIDER", provider });
  }, []);

  const handleScheduleAll = useCallback(async () => {
    if (!(canSubmit && state.startDate && workspaceId)) {
      return;
    }
    const startDate = state.startDate;

    dispatch({ type: "SET_SUBMISSION_STATUS", status: "submitting" });

    let successCount = 0;
    let failCount = 0;

    for (const video of state.videos) {
      dispatch({ type: "SET_POST_STATUS", id: video.id, status: "creating" });
    }
    try {
      const results = await bulkCreate.mutateAsync(
        state.videos.map((video, index) => {
          const groupId = crypto.randomUUID();
          const scheduledAt = new Date(
            computeScheduledAt(index, startDate, state.intervalMinutes)
          ).toISOString();
          return {
            groups: [
              {
                id: groupId,
                isDefault: true,
                segments: [
                  {
                    text: video.caption,
                    media: video.uploadResult?.mediaId
                      ? [{ id: video.uploadResult.mediaId }]
                      : [],
                  },
                ],
              },
            ],
            targets: state.selectedProviders.map((provider) => ({
              connectionId: provider.socialId,
              groupId,
              settings: defaultPlatformSettings(provider.socialType),
              scheduledAt,
            })),
            source: "app" as const,
            submitForReview: requiresApproval,
          };
        })
      );
      results.forEach((result, index) => {
        const video = state.videos[index];
        if (!video) {
          return;
        }
        dispatch({
          type: "SET_POST_STATUS",
          id: video.id,
          status: result.ok ? "created" : "failed",
        });
        if (result.ok) {
          successCount++;
        } else {
          failCount++;
        }
      });
    } catch {
      failCount = state.videos.length;
      for (const video of state.videos) {
        dispatch({ type: "SET_POST_STATUS", id: video.id, status: "failed" });
      }
    }

    analytics.capture(BULK_UPLOAD_SCHEDULED, {
      total_videos: state.videos.length,
      success_count: successCount,
      fail_count: failCount,
      platforms: state.selectedProviders.map((p) => p.socialType),
      interval_minutes: state.intervalMinutes,
    });

    if (failCount === 0) {
      dispatch({ type: "SET_SUBMISSION_STATUS", status: "done" });
      toast.success(`${successCount} posts scheduled successfully`);
      router.push("/posts?status=scheduled");
    } else {
      dispatch({ type: "SET_SUBMISSION_STATUS", status: "partial-failure" });
      toast.error(
        `${successCount} scheduled, ${failCount} failed. You can retry the failed ones.`
      );
    }
  }, [
    canSubmit,
    state,
    bulkCreate,
    analytics,
    router,
    requiresApproval,
    workspaceId,
  ]);

  return (
    <PageShell
      description="Upload multiple videos and schedule them across your social accounts."
      page="Bulk Upload"
      pages={["Content"]}
    >
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="flex-1 space-y-4">
          <BulkDropzone
            disabled={isSubmitting}
            onFilesSelected={handleFilesSelected}
          />

          <BulkVideoList
            disabled={isSubmitting}
            intervalMinutes={state.intervalMinutes}
            onCaptionChange={(id, caption) =>
              dispatch({ type: "SET_CAPTION", id, caption })
            }
            onMove={(id, direction) =>
              dispatch({ type: "MOVE_VIDEO", id, direction })
            }
            onRemove={(id) => dispatch({ type: "REMOVE_VIDEO", id })}
            startDate={state.startDate}
            videos={state.videos}
          />
        </div>

        <div className="w-full lg:w-80">
          <Card className="sticky top-4">
            <CardHeader>
              <CardTitle className="text-sm">Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <BulkSocialSelector
                onToggle={handleToggleProvider}
                selectedProviders={state.selectedProviders}
              />

              <ScheduleConfig
                intervalMinutes={state.intervalMinutes}
                onIntervalChange={(minutes) =>
                  dispatch({ type: "SET_INTERVAL", minutes })
                }
                onStartDateChange={(date) =>
                  dispatch({ type: "SET_START_DATE", date: date ?? null })
                }
                startDate={state.startDate}
                videoCount={state.videos.length}
              />

              {exceedsLimit && (
                <InlineUpgradePrompt
                  feature="monthlyPosts"
                  requiredPlan="VIBE"
                />
              )}

              {!(monthlyPostsLimit.isUnlimited || exceedsLimit) &&
                hasVideos &&
                monthlyPostsLimit.percentageUsed >= 60 && (
                  <Alert>
                    <Icon icon={AlertCircleIcon} size={16} />
                    <AlertDescription className="text-xs">
                      {postsRemaining} posts remaining this month. Scheduling{" "}
                      {state.videos.length}.
                    </AlertDescription>
                  </Alert>
                )}

              {isViewer && (
                <Alert>
                  <AlertDescription className="text-xs">
                    Viewers cannot create posts.
                  </AlertDescription>
                </Alert>
              )}

              <Button
                className="w-full justify-center gap-2"
                disabled={!canSubmit}
                onClick={handleScheduleAll}
              >
                {requiresApproval
                  ? `Submit ${state.videos.length} for Approval`
                  : `Schedule ${state.videos.length} Posts`}
                {isSubmitting ? (
                  <Icon
                    className="animate-spin"
                    icon={Loading03Icon}
                    size={16}
                  />
                ) : (
                  <PiPaperPlaneTiltFill className="size-4" />
                )}
              </Button>

              {!hasVideos && (
                <p className="text-center text-muted-foreground text-xs">
                  Drop videos above to get started
                </p>
              )}
              {hasVideos && !hasProviders && (
                <p className="text-center text-muted-foreground text-xs">
                  Select at least one social network
                </p>
              )}
              {hasVideos && hasProviders && !hasSchedule && (
                <p className="text-center text-muted-foreground text-xs">
                  Pick a start date and time
                </p>
              )}
              {hasVideos && !allUploaded && (
                <p className="text-center text-muted-foreground text-xs">
                  Waiting for uploads to complete...
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
