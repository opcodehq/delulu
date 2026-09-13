"use client";

import { resourceEffect } from "@delulu/client";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@delulu/design-system/components/ui/sheet";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@delulu/design-system/components/ui/tabs";
import { cn } from "@delulu/design-system/lib/utils";
import { SocialTypes } from "@delulu/validators/post";
import { format } from "date-fns";
import { Effect } from "effect";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApiClient } from "@/components/providers/api-client";
import { useWorkspace } from "@/components/providers/workspace";
import type { EditorMediaDetail } from "@/lib/editor-media";
import { getSingleProviderInDefault } from "@/lib/platform-rules";
import { useResourceAtom } from "@/state/resources";
import {
  postEditorCommands,
  useAlternativeContent,
  useSelectedSocialProviders,
  useStore,
} from "@/store/post";
import { ComposerToolbar } from "./composer-toolbar";
import { ContentModule } from "./content-module";
import { AlternativeContentSelector } from "./network-selector";
import { ReviewBanner } from "./review-banner";
import { PostSidebar } from "./sidebar/post-sidebar";
import { SocialIcon } from "./sidebar/social-icon";
import SocialSelector from "./sidebar/social-selector";

interface PostCreatorProps {
  postId?: string;
}

export function PostCreator({ postId }: PostCreatorProps = {}) {
  const searchParams = useSearchParams();
  const alternativeContent = useAlternativeContent();
  const socialProviders = useSelectedSocialProviders();
  const [activeModuleId, setActiveModuleId] = useState<string>("global");
  const [isControlsOpen, setIsControlsOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const loadPost = useStore((state) => state.loadPost);
  const setDateAlongWithTime = useStore((state) => state.setDateAlongWithTime);
  const setTime = useStore((state) => state.setTime);
  const appliedDraftRef = useRef<string | null>(null);
  const loadedPostRef = useRef<string | null>(null);
  const { workspaceId } = useWorkspace();
  const { resources } = useApiClient();

  // Get single provider in default for smart labeling (memoized for performance)
  const singleProviderInDefault = useMemo(
    () => getSingleProviderInDefault(socialProviders, alternativeContent),
    [socialProviders, alternativeContent]
  );

  // Fetch post data if in edit mode
  const postData = useResourceAtom({
    ...resources.posts.get(workspaceId ?? "", postId ?? ""),
    enabled: Boolean(workspaceId && postId),
  });
  const connectionData = useResourceAtom({
    ...resources.connections.list(workspaceId ?? "", { limit: 100 }),
    enabled: Boolean(workspaceId && postId),
  });
  const mediaIds = useMemo(
    () =>
      Array.from(
        new Set(
          (postData.data?.groups ?? []).flatMap((group) =>
            group.segments.flatMap((segment) =>
              segment.media.flatMap((media) => [
                media.id,
                ...(media.thumbnailMediaId ? [media.thumbnailMediaId] : []),
              ])
            )
          )
        )
      ),
    [postData.data]
  );
  const mediaOptions = useMemo(
    () =>
      resourceEffect({
        queryKey: ["workspace", workspaceId, "media", "details", mediaIds],
        effect: () =>
          Effect.all(
            mediaIds.map((id) =>
              resources.media.get(workspaceId ?? "", id).effect()
            ),
            { concurrency: "unbounded" }
          ),
      }),
    [mediaIds, resources, workspaceId]
  );
  const mediaResults = useResourceAtom({
    ...mediaOptions,
    enabled: Boolean(workspaceId && postId && mediaIds.length > 0),
  });
  const mediaById = useMemo(
    () =>
      new Map(
        (mediaResults.data ?? []).map((media) => [
          media.id,
          media satisfies EditorMediaDetail,
        ])
      ),
    [mediaResults.data]
  );

  // Load post data into store when fetched
  useEffect(() => {
    const loadKey = `${workspaceId}:${postId}`;
    if (
      postData.data &&
      postId &&
      loadedPostRef.current !== loadKey &&
      !(mediaResults.isPending || mediaResults.isError) &&
      !(connectionData.isPending || connectionData.isError)
    ) {
      loadPost(postData.data, mediaById, connectionData.data?.data ?? []);
      loadedPostRef.current = loadKey;
    }
  }, [
    postData.data,
    postId,
    loadPost,
    mediaById,
    mediaResults.isPending,
    mediaResults.isError,
    connectionData.data,
    connectionData.isPending,
    connectionData.isError,
    workspaceId,
  ]);

  // Start a clean, editable post from a public tool handoff.
  useEffect(() => {
    if (postId) {
      return;
    }

    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const fragmentText =
      fragment.get("source") === "social-preview-tool"
        ? fragment.get("text")?.trim().slice(0, 5000)
        : undefined;
    const draft =
      fragmentText ??
      searchParams.get("draft")?.trim().slice(0, 5000) ??
      searchParams.get("text")?.trim().slice(0, 5000);
    if (!draft || appliedDraftRef.current === draft) {
      return;
    }

    appliedDraftRef.current = draft;
    postEditorCommands.applyDraftHandoff(draft);
    if (fragmentText) {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`
      );
    }
  }, [postId, searchParams]);

  // Handle scheduledAt query parameter from calendar after any text handoff
  // has cleared a previous draft.
  useEffect(() => {
    if (!postId) {
      const scheduledAtParam = searchParams.get("scheduledAt");
      if (scheduledAtParam) {
        const scheduledTime = Number.parseInt(scheduledAtParam, 10);
        if (!Number.isNaN(scheduledTime)) {
          const scheduledDate = new Date(scheduledTime);
          setDateAlongWithTime(scheduledDate);
          setTime(format(scheduledDate, "HH:mm"));
        }
      }
    }
  }, [postId, searchParams, setDateAlongWithTime, setTime]);

  // Clear stale automation configs for new posts
  useEffect(() => {
    if (!postId) {
      useStore.setState({ automationConfigs: {} });
    }
  }, [postId]);

  const handleTabChange = useCallback(
    (value: string) => {
      if (value !== activeModuleId) {
        setActiveModuleId(value);
      }
    },
    [activeModuleId]
  );

  useEffect(() => {
    // If activeModuleId is not 'global' and not found in alternativeContent
    if (
      activeModuleId !== "global" &&
      !alternativeContent.some(
        (content) => content.socialProvider.socialId === activeModuleId
      )
    ) {
      setActiveModuleId("global");
    }
  }, [alternativeContent, activeModuleId]);

  // Show loading state while fetching post data
  if (
    postId &&
    (postData.isPending || mediaResults.isPending || connectionData.isPending)
  ) {
    return (
      <div className="flex h-full flex-col">
        <ComposerToolbar actionsDisabled postId={postId} />
        <div className="flex flex-1 items-center justify-center">
          <div className="text-muted-foreground">Loading post…</div>
        </div>
      </div>
    );
  }

  if (
    postId &&
    (postData.isError || mediaResults.isError || connectionData.isError)
  ) {
    return (
      <div className="flex h-full flex-col">
        <ComposerToolbar actionsDisabled postId={postId} />
        <div className="flex flex-1 items-center justify-center px-6 text-center">
          <div>
            <h2 className="font-medium">Unable to load post</h2>
            <p className="mt-1 text-muted-foreground text-sm">
              The post data could not be loaded. Please retry.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <ComposerToolbar
        onOpenControls={() => setIsControlsOpen(true)}
        onOpenPreview={() => setIsPreviewOpen(true)}
        postId={postId}
      />

      <div className="flex min-h-0 flex-1">
        <Tabs
          className="flex min-h-0 min-w-0 flex-1 flex-col"
          onValueChange={handleTabChange}
          value={activeModuleId}
        >
          {socialProviders.length >= 2 && (
            <div className="shrink-0 border-border/80 border-b bg-background">
              <div className="mx-auto w-full max-w-[920px] overflow-x-auto px-3 py-2 sm:px-6">
                <TabsList className="h-11 w-max justify-start gap-1 bg-transparent p-0 sm:h-8 [@media(pointer:coarse)]:h-11">
                  <TabsTrigger
                    className={cn(
                      "h-11 min-w-fit rounded-md px-2 text-xs sm:h-8 [@media(pointer:coarse)]:h-11",
                      singleProviderInDefault && "gap-2"
                    )}
                    value="global"
                  >
                    {singleProviderInDefault ? (
                      <>
                        <SocialIcon
                          className="size-4"
                          type={singleProviderInDefault.socialType}
                        />
                        {singleProviderInDefault.name}
                      </>
                    ) : (
                      "Global"
                    )}
                  </TabsTrigger>
                  {alternativeContent.map((content) => (
                    <TabsTrigger
                      className="h-11 min-w-fit gap-1.5 rounded-md px-2 text-xs sm:h-8 [@media(pointer:coarse)]:h-11"
                      key={content.socialProvider.socialId}
                      value={content.socialProvider.socialId}
                    >
                      <SocialIcon
                        className="size-4"
                        type={content.socialProvider.socialType}
                      />
                      {content.socialProvider.name}
                    </TabsTrigger>
                  ))}
                  <AlternativeContentSelector />
                </TabsList>
              </div>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-muted/25">
            <main className="mx-auto min-h-full w-full max-w-[920px] bg-background px-4 py-7 sm:border-border/70 sm:border-x sm:px-10 sm:py-10 lg:px-14">
              {postData.data?.status === "published" && (
                <div className="mb-6 rounded-lg bg-amber-50 px-4 py-3 text-amber-900 ring-1 ring-amber-200/80 dark:bg-amber-950/30 dark:text-amber-100 dark:ring-amber-800">
                  <h3 className="font-medium text-sm">Already published</h3>
                  <p className="mt-0.5 text-xs opacity-80">
                    Changes are saved as a new draft and won’t alter the live
                    post.
                  </p>
                </div>
              )}

              {postData.data?.workspaceId && (
                <div className="mb-6">
                  <ReviewBanner
                    organizationId={postData.data.workspaceId}
                    postId={postData.data.id}
                    reviewStatus=""
                  />
                </div>
              )}

              <div className="mx-auto mb-4 w-full max-w-[780px]">
                <SocialSelector surface="composer" />
              </div>

              <TabsContent className="mt-0" value="global">
                <ContentModule
                  socialId="global"
                  socialType={SocialTypes.DEFAULT}
                />
              </TabsContent>

              {alternativeContent.map((content) => (
                <TabsContent
                  className="mt-0"
                  key={content.socialProvider.socialId}
                  value={content.socialProvider.socialId}
                >
                  <ContentModule
                    socialId={content.socialProvider.socialId}
                    socialType={content.socialProvider.socialType}
                  />
                </TabsContent>
              ))}
            </main>
          </div>
        </Tabs>

        <aside className="hidden w-[360px] shrink-0 flex-col border-border/80 border-l bg-background lg:flex xl:w-[380px]">
          <div className="border-border/80 border-b px-4 py-4">
            <h2 className="font-semibold text-sm">Post settings</h2>
            <p className="mt-0.5 text-muted-foreground text-xs">
              Pick a date and time to schedule this post.
            </p>
          </div>
          <div className="min-h-0 flex-1">
            <PostSidebar
              onOpenPreview={() => setIsPreviewOpen(true)}
              organizationId={postData.data?.workspaceId}
              postId={postId}
              view="controls"
            />
          </div>
        </aside>
      </div>

      <Sheet onOpenChange={setIsControlsOpen} open={isControlsOpen}>
        <SheetContent className="w-[min(94vw,420px)] gap-0 border-border/80 p-0 sm:max-w-[420px] lg:hidden">
          <SheetHeader className="border-border/80 border-b pr-12">
            <SheetTitle>Post settings</SheetTitle>
            <SheetDescription>
              Pick a date and time to schedule this post.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1">
            <PostSidebar
              onOpenPreview={() => {
                setIsControlsOpen(false);
                setIsPreviewOpen(true);
              }}
              organizationId={postData.data?.workspaceId}
              postId={postId}
              showPreviewAction
              view="controls"
            />
          </div>
        </SheetContent>
      </Sheet>

      <Sheet onOpenChange={setIsPreviewOpen} open={isPreviewOpen}>
        <SheetContent className="w-[min(94vw,480px)] gap-0 border-border/80 p-0 sm:max-w-[480px]">
          <SheetHeader className="border-border/80 border-b pr-12">
            <SheetTitle>Post preview</SheetTitle>
            <SheetDescription>
              Review how the selected channel will look.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1">
            <PostSidebar
              organizationId={postData.data?.workspaceId}
              postId={postId}
              view="preview"
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
