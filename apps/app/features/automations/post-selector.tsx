"use client";

import { Badge } from "@delulu/design-system/components/ui/badge";
import { Button } from "@delulu/design-system/components/ui/button";
import { Skeleton } from "@delulu/design-system/components/ui/skeleton";
import { cn } from "@delulu/design-system/lib/utils";
import { Icon } from "@delulu/design-system/providers/icon";
import {
  Calendar03Icon,
  CheckmarkCircle02Icon,
  GridIcon,
  Image02Icon,
  Video02Icon,
} from "@delulu/icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApiClient } from "@/shell/providers/api-client";
import { useWorkspace } from "@/shell/providers/workspace";
import { useMutationAtom } from "@/shell/state/resources";

interface PostSelectorProps {
  socialProviderId: string | null;
  targetMode: "specific" | "all";
  selectedPostIds: string[];
  onTargetModeChange: (mode: "specific" | "all") => void;
  onSelectionChange: (postIds: string[]) => void;
  triggerType?: string;
}

interface MediaItem {
  readonly id: string;
  readonly caption: string | null;
  readonly mediaType: string;
  readonly thumbnailUrl: string | null;
  readonly mediaUrl: string | null;
}

interface ScheduledItem {
  readonly id: string;
  readonly caption: string | null;
  readonly scheduledAt: string | null;
}

export function PostSelectorLoading() {
  return (
    <output className="block space-y-4 py-2">
      <Skeleton className="h-20 w-full rounded-xl" />
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton className="aspect-square rounded-lg" key={index} />
        ))}
      </div>
      <span className="sr-only">Loading Instagram media</span>
    </output>
  );
}

export function PostSelector({
  socialProviderId,
  targetMode,
  selectedPostIds,
  onTargetModeChange,
  onSelectionChange,
  triggerType,
}: PostSelectorProps) {
  const isStoryMode = triggerType === "STORY_REPLY";
  const { resources } = useApiClient();
  const { workspaceId } = useWorkspace();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [scheduledPosts, setScheduledPosts] = useState<ScheduledItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [scheduledError, setScheduledError] = useState<Error | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const requestKey = useRef("");
  const currentRequestKey = `${workspaceId}:${socialProviderId}:${isStoryMode}`;

  const { mutateAsync: loadMediaPage, isPending: isMediaPending } =
    useMutationAtom({
      effect: (after: string | null) =>
        resources.connections
          .media(workspaceId ?? "", socialProviderId ?? "", {
            kind: isStoryMode ? "stories" : "posts",
            limit: 25,
            ...(after ? { after } : {}),
          })
          .effect(),
    });
  const { mutateAsync: loadScheduledPosts, isPending: isScheduledPending } =
    useMutationAtom({
      effect: () =>
        resources.posts
          .list(workspaceId ?? "", { status: "scheduled", limit: 100 })
          .effect(),
    });

  const loadInitial = useCallback(async () => {
    if (!(workspaceId && socialProviderId)) {
      return;
    }
    const key = currentRequestKey;
    requestKey.current = key;
    setItems([]);
    setScheduledPosts([]);
    setNextCursor(null);
    setLoadError(null);
    setScheduledError(null);
    setHasLoaded(false);
    const scheduledRequest = isStoryMode
      ? Promise.resolve(null)
      : loadScheduledPosts(undefined);
    try {
      const mediaPage = await loadMediaPage(null);
      if (requestKey.current !== key) {
        scheduledRequest.catch(() => undefined);
        return;
      }
      setItems([...mediaPage.data]);
      setNextCursor(mediaPage.nextCursor);
      setHasLoaded(true);
    } catch (error) {
      if (requestKey.current === key) {
        setLoadError(
          error instanceof Error ? error : new Error("Unable to load media")
        );
        setHasLoaded(true);
      }
      scheduledRequest.catch(() => undefined);
      return;
    }
    try {
      const scheduledPage = await scheduledRequest;
      if (requestKey.current !== key) {
        return;
      }
      setScheduledPosts(
        scheduledPage?.data
          .filter((post) =>
            post.targets.some(
              (target) => target.connectionId === socialProviderId
            )
          )
          .map((post) => ({
            id: post.id,
            caption: post.groups[0]?.segments[0]?.text ?? null,
            scheduledAt:
              post.targets.find(
                (target) => target.connectionId === socialProviderId
              )?.scheduledAt ?? null,
          })) ?? []
      );
    } catch (error) {
      if (requestKey.current === key) {
        setScheduledError(
          error instanceof Error
            ? error
            : new Error("Unable to load scheduled posts")
        );
      }
    }
  }, [
    isStoryMode,
    currentRequestKey,
    loadMediaPage,
    loadScheduledPosts,
    socialProviderId,
    workspaceId,
  ]);

  useEffect(() => {
    loadInitial().catch(() => undefined);
  }, [loadInitial]);

  const loadMore = async () => {
    if (!nextCursor) {
      return;
    }
    setLoadError(null);
    try {
      const page = await loadMediaPage(nextCursor);
      setItems((current) => {
        const byId = new Map(current.map((item) => [item.id, item]));
        for (const item of page.data) {
          byId.set(item.id, item);
        }
        return [...byId.values()];
      });
      setNextCursor(page.nextCursor);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error : new Error("Unable to load more media")
      );
    }
  };

  const handlePostToggle = (postId: string) => {
    onSelectionChange(
      selectedPostIds.includes(postId)
        ? selectedPostIds.filter((id) => id !== postId)
        : [...selectedPostIds, postId]
    );
  };

  if (!socialProviderId) {
    return (
      <div className="rounded-lg border border-border border-dashed p-6 text-center">
        <p className="text-muted-foreground text-sm">
          Select an Instagram account first
        </p>
      </div>
    );
  }

  const isInitialLoading =
    requestKey.current !== currentRequestKey ||
    !hasLoaded ||
    (items.length === 0 &&
      !loadError &&
      (isMediaPending || isScheduledPending));
  if (isInitialLoading) {
    return <PostSelectorLoading />;
  }

  const itemLabel = isStoryMode ? "stories" : "posts and Reels";
  const hasScheduledPosts = !isStoryMode && scheduledPosts.length > 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          aria-pressed={targetMode === "specific"}
          className={cn(
            "min-h-16 rounded-xl border p-3 text-left transition-colors",
            targetMode === "specific"
              ? "border-primary bg-primary/5 ring-1 ring-primary/20"
              : "hover:border-muted-foreground/50"
          )}
          onClick={() => onTargetModeChange("specific")}
          type="button"
        >
          <span className="block font-medium text-sm">
            Specific {itemLabel}
          </span>
          <span className="mt-1 block text-muted-foreground text-xs">
            Choose one or more items below
          </span>
        </button>
        <button
          aria-pressed={targetMode === "all"}
          className={cn(
            "min-h-16 rounded-xl border p-3 text-left transition-colors",
            targetMode === "all"
              ? "border-primary bg-primary/5 ring-1 ring-primary/20"
              : "hover:border-muted-foreground/50"
          )}
          onClick={() => {
            onTargetModeChange("all");
            onSelectionChange([]);
          }}
          type="button"
        >
          <span className="block font-medium text-sm">
            Any current or future {isStoryMode ? "story" : "post"}
          </span>
          <span className="mt-1 block text-muted-foreground text-xs">
            Trigger automatically without choosing items
          </span>
        </button>
      </div>

      {loadError && (
        <div
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-3"
          role="alert"
        >
          <p className="text-destructive text-sm">{loadError.message}</p>
          <Button
            className="mt-2"
            onClick={() => loadInitial().catch(() => undefined)}
            size="sm"
            variant="outline"
          >
            Retry
          </Button>
        </div>
      )}
      {scheduledError && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="text-sm">
            Live media loaded, but scheduled posts are temporarily unavailable.
          </p>
        </div>
      )}

      {targetMode === "specific" && (
        <>
          {items.length === 0 && !hasScheduledPosts && !loadError ? (
            <div className="rounded-lg border border-border border-dashed p-6 text-center">
              <p className="text-muted-foreground text-sm">
                No {itemLabel} found for this Instagram account
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {items.map((post) => {
                const isSelected = selectedPostIds.includes(post.id);
                const MediaIcon =
                  post.mediaType === "VIDEO"
                    ? Video02Icon
                    : post.mediaType === "CAROUSEL_ALBUM"
                      ? GridIcon
                      : Image02Icon;
                const preview =
                  post.thumbnailUrl ??
                  (post.mediaType === "IMAGE" ? post.mediaUrl : null);
                return (
                  <button
                    aria-label={`${isSelected ? "Unselect" : "Select"} ${post.caption || "Instagram media"}`}
                    aria-pressed={isSelected}
                    className={cn(
                      "group relative aspect-square min-h-11 overflow-hidden rounded-lg border transition-all",
                      isSelected
                        ? "border-primary ring-2 ring-primary/30"
                        : "border-border hover:border-muted-foreground/50"
                    )}
                    key={post.id}
                    onClick={() => handlePostToggle(post.id)}
                    type="button"
                  >
                    {preview ? (
                      <img
                        alt=""
                        className="h-full w-full object-cover"
                        src={preview}
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center bg-muted">
                        <Icon
                          className="text-muted-foreground"
                          icon={MediaIcon}
                          size={24}
                        />
                      </span>
                    )}
                    <span className="absolute top-2 right-2 rounded-full bg-black/65 p-1 text-white">
                      <Icon
                        icon={isSelected ? CheckmarkCircle02Icon : MediaIcon}
                        size={16}
                      />
                    </span>
                    {post.caption && (
                      <span className="absolute right-0 bottom-0 left-0 line-clamp-2 bg-gradient-to-t from-black/85 to-transparent p-2 pt-6 text-left text-white text-xs">
                        {post.caption}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {nextCursor && (
            <Button
              className="w-full"
              disabled={isMediaPending}
              onClick={() => loadMore().catch(() => undefined)}
              variant="outline"
            >
              {isMediaPending ? "Loading…" : "Load more"}
            </Button>
          )}

          {hasScheduledPosts && (
            <>
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-border" />
                <span className="text-muted-foreground text-xs">
                  Scheduled posts
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                {scheduledPosts.map((post) => {
                  const pendingId = `pending:${post.id}`;
                  const isSelected = selectedPostIds.includes(pendingId);
                  return (
                    <button
                      aria-label={`${isSelected ? "Unselect" : "Select"} scheduled post`}
                      aria-pressed={isSelected}
                      className={cn(
                        "group relative aspect-square min-h-11 overflow-hidden rounded-lg border bg-muted transition-all",
                        isSelected
                          ? "border-primary ring-2 ring-primary/30"
                          : "border-border hover:border-muted-foreground/50"
                      )}
                      key={post.id}
                      onClick={() => handlePostToggle(pendingId)}
                      type="button"
                    >
                      <span className="flex h-full items-center justify-center">
                        <Icon
                          className="text-muted-foreground"
                          icon={Image02Icon}
                          size={24}
                        />
                      </span>
                      <Badge
                        className="absolute top-2 right-2 gap-1 text-[10px]"
                        variant="secondary"
                      >
                        <Icon icon={Calendar03Icon} size={10} />
                        Scheduled
                      </Badge>
                      {post.caption && (
                        <span className="absolute right-0 bottom-0 left-0 line-clamp-2 bg-gradient-to-t from-black/85 to-transparent p-2 pt-6 text-left text-white text-xs">
                          {post.caption}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {selectedPostIds.length > 0 && (
            <p className="text-center text-muted-foreground text-sm">
              {selectedPostIds.length} item
              {selectedPostIds.length === 1 ? "" : "s"} selected
            </p>
          )}
        </>
      )}
    </div>
  );
}
