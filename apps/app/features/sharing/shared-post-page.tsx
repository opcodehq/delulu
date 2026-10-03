"use client";

import { Logo } from "@delulu/design-system/components/logo";
import { Button } from "@delulu/design-system/components/ui/button";
import {
  Frame,
  FrameHeader,
  FrameTitle,
} from "@delulu/design-system/components/ui/frame";
import { Input } from "@delulu/design-system/components/ui/input";
import { Label } from "@delulu/design-system/components/ui/label";
import { Textarea } from "@delulu/design-system/components/ui/textarea";
import type { SupportedSocialPlatform } from "@delulu/design-system/lib/social-config";
import { cn } from "@delulu/design-system/lib/utils";
import { Icon } from "@delulu/design-system/providers/icon";
import { Loading03Icon } from "@delulu/icons";
import { format, formatDistanceToNow } from "date-fns";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { SocialPhonePreview } from "@/features/publishing/editor/sidebar/previews/composer-social-preview";
import { ChannelMark } from "@/features/publishing/editor/sidebar/social-icon";
import {
  type SharedPost,
  useSharedPost,
} from "@/features/sharing/use-shared-post";
import { AuthorizationShell } from "@/shell/navigation/authorization-shell";

const NAME_STORAGE_KEY = "delulu:share-comment-name";
const MAX_COMMENT_LENGTH = 2000;

type Channel = SharedPost["channels"][number];

function statusLabel(post: SharedPost) {
  const scheduled = post.channels
    .map((channel) => channel.scheduledAt)
    .filter((value): value is string => Boolean(value))
    .sort()[0];
  switch (post.postStatus) {
    case "scheduled":
      return scheduled
        ? `Scheduled for ${format(new Date(scheduled), "EEE, MMM d 'at' h:mm a")}`
        : "Scheduled";
    case "published":
      return "Published";
    case "publishing":
      return "Publishing now";
    case "pending_review":
      return "Awaiting approval";
    case "changes_requested":
      return "Changes requested";
    case "failed":
    case "partially_failed":
      return "Not fully published";
    default:
      return "Draft";
  }
}

const channelName = (channel: Channel) =>
  channel.displayName ?? channel.username ?? channel.platform.toLowerCase();

export function SharedPostPage({ token }: { token: string }) {
  const { state, reload, addComment, signedIn } = useSharedPost(token);
  const signInHref =
    typeof window === "undefined"
      ? "/sign-in"
      : `/sign-in?redirect_url=${encodeURIComponent(window.location.href)}`;

  switch (state.status) {
    case "loading":
      return (
        <StatusCard title="Loading preview…">
          <output className="flex items-center gap-2 text-muted-foreground text-sm">
            <Icon className="animate-spin" icon={Loading03Icon} size={18} />
            Fetching the latest version
          </output>
        </StatusCard>
      );
    case "sign-in":
      return (
        <StatusCard
          action={
            <Button asChild className="w-full">
              <a href={signInHref}>Sign in to view</a>
            </Button>
          }
          title="Sign in to view this preview"
        >
          This post is shared with members of its workspace. Sign in with the
          account you use for that workspace.
        </StatusCard>
      );
    case "forbidden":
      return (
        <StatusCard title="You don't have access">
          This preview is shared only with members of its workspace. Ask the
          sender to add you, or to share it with anyone who has the link.
        </StatusCard>
      );
    case "expired":
      return (
        <StatusCard title="This link has expired">
          Share links last 7 days. Ask the sender to extend it or send you a new
          one.
        </StatusCard>
      );
    case "missing":
      return (
        <StatusCard title="Link not found">
          This link doesn't exist or was turned off by the sender.
        </StatusCard>
      );
    case "error":
      return (
        <StatusCard
          action={
            <Button className="w-full" onClick={() => reload()}>
              Try again
            </Button>
          }
          title="Couldn't load the preview"
        >
          Check your connection and try again.
        </StatusCard>
      );
    default:
      return (
        <SharedPostLayout
          onComment={addComment}
          post={state.post}
          signedIn={signedIn}
        />
      );
  }
}

function StatusCard({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <AuthorizationShell>
      <section className="space-y-4">
        <Logo />
        <div className="space-y-2">
          <h1 className="font-semibold text-lg tracking-tight">{title}</h1>
          <div className="text-muted-foreground text-sm leading-relaxed">
            {children}
          </div>
        </div>
        {action}
      </section>
    </AuthorizationShell>
  );
}

function SharedPostLayout({
  post,
  signedIn,
  onComment,
}: {
  post: SharedPost;
  signedIn: boolean;
  onComment: (input: { body: string; authorName: string }) => Promise<unknown>;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const active =
    post.channels.find((channel) => channel.targetId === activeId) ??
    post.channels[0];

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-zinc-950/10 border-b-[1.5px] border-dotted dark:border-white/10">
        <div className="mx-auto flex min-h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <Logo />
          <p className="truncate text-muted-foreground text-sm">
            Shared by{" "}
            <span className="font-medium text-foreground">
              {post.workspaceName}
            </span>
          </p>
        </div>
      </header>

      <main className="mx-auto grid min-h-[calc(100dvh-3.5rem)] max-w-6xl gap-10 border-zinc-950/10 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:border-x-[1.5px] lg:border-dotted dark:border-white/10">
        <section aria-labelledby="shared-post-title" className="min-w-0">
          <div className="space-y-1">
            <h1
              className="font-semibold text-xl tracking-tight"
              id="shared-post-title"
            >
              Post preview
            </h1>
            <p className="text-muted-foreground text-sm">
              {statusLabel(post)} · Updated{" "}
              {formatDistanceToNow(new Date(post.updatedAt), {
                addSuffix: true,
              })}
            </p>
            <a
              className="inline-flex min-h-11 items-center font-medium text-primary text-sm underline-offset-4 hover:underline lg:hidden"
              href="#share-feedback"
            >
              Leave feedback
              {post.comments.length > 0 && ` (${post.comments.length})`}
            </a>
          </div>

          {post.channels.length === 0 ? (
            <p className="mt-8 text-muted-foreground text-sm">
              No channels are selected for this post yet.
            </p>
          ) : (
            <>
              {post.channels.length > 1 && (
                <div
                  aria-label="Channels"
                  className="mt-6 flex flex-wrap gap-1"
                  role="tablist"
                >
                  {post.channels.map((channel) => {
                    const selected = channel.targetId === active?.targetId;
                    return (
                      <button
                        aria-selected={selected}
                        className={cn(
                          "flex min-h-10 items-center gap-2 rounded-lg py-1.5 pr-3 pl-1.5 text-sm outline-none transition-colors hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring/50 [@media(pointer:coarse)]:min-h-11",
                          selected
                            ? "bg-muted font-medium text-foreground"
                            : "text-muted-foreground"
                        )}
                        key={channel.targetId}
                        onClick={() => setActiveId(channel.targetId)}
                        role="tab"
                        type="button"
                      >
                        <ChannelMark
                          className="size-7"
                          platform={channel.platform}
                        />
                        <span className="max-w-[11rem] truncate">
                          {channelName(channel)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {active && (
                <div className="mt-2" role="tabpanel">
                  <SocialPhonePreview
                    account={{
                      displayName: active.displayName ?? undefined,
                      username: active.username ?? undefined,
                      profileImage: active.profileImage ?? undefined,
                    }}
                    platform={active.platform as SupportedSocialPlatform}
                    posts={active.segments.map((segment) => ({
                      text: segment.text,
                      media: segment.media[0],
                    }))}
                  />
                </div>
              )}
            </>
          )}
        </section>

        <aside
          aria-label="Feedback"
          className="scroll-mt-4 lg:pt-1"
          id="share-feedback"
        >
          <FeedbackPanel
            comments={post.comments}
            onComment={onComment}
            signedIn={signedIn}
          />
        </aside>
      </main>
    </div>
  );
}

function FeedbackPanel({
  comments,
  signedIn,
  onComment,
}: {
  comments: SharedPost["comments"];
  signedIn: boolean;
  onComment: (input: { body: string; authorName: string }) => Promise<unknown>;
}) {
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(localStorage.getItem(NAME_STORAGE_KEY) ?? "");
  }, []);

  const trimmedName = name.trim();
  const trimmedBody = body.trim();
  const canSend =
    !sending &&
    trimmedBody.length > 0 &&
    body.length <= MAX_COMMENT_LENGTH &&
    (signedIn || trimmedName.length > 0);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSend) {
      return;
    }
    setSending(true);
    setError(null);
    try {
      await onComment({ body: trimmedBody, authorName: trimmedName });
      if (!signedIn) {
        localStorage.setItem(NAME_STORAGE_KEY, trimmedName);
      }
      setBody("");
    } catch {
      setError("Your feedback wasn't sent. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Frame>
      <FrameHeader>
        <FrameTitle>Feedback</FrameTitle>
        {comments.length > 0 && (
          <span className="text-muted-foreground text-sm tabular-nums">
            {comments.length}
          </span>
        )}
      </FrameHeader>
      {comments.length === 0 ? (
        <p className="px-4 py-6 text-center text-muted-foreground text-sm">
          No feedback yet. Leave the first note.
        </p>
      ) : (
        <ol className="max-h-[420px] divide-y divide-border/60 overflow-y-auto">
          {comments.map((comment) => (
            <li className="space-y-1 px-4 py-3" key={comment.id}>
              <p className="flex items-baseline justify-between gap-2">
                <span className="truncate font-medium text-sm">
                  {comment.authorName}
                </span>
                <time
                  className="shrink-0 text-muted-foreground text-xs"
                  dateTime={comment.createdAt}
                >
                  {formatDistanceToNow(new Date(comment.createdAt), {
                    addSuffix: true,
                  })}
                </time>
              </p>
              <p className="whitespace-pre-wrap break-words text-sm leading-6">
                {comment.body}
              </p>
            </li>
          ))}
        </ol>
      )}
      <form
        className="space-y-3 border-zinc-950/10 border-t-[1.5px] border-dotted p-4 dark:border-white/10"
        onSubmit={submit}
      >
        {!signedIn && (
          <div className="space-y-1.5">
            <Label htmlFor="share-comment-name">Your name</Label>
            <Input
              autoComplete="name"
              id="share-comment-name"
              maxLength={60}
              onChange={(event) => setName(event.target.value)}
              placeholder="So the team knows who it's from"
              value={name}
            />
          </div>
        )}
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="share-comment-body">Your feedback</Label>
            {body.length > MAX_COMMENT_LENGTH * 0.8 && (
              <span
                className={cn(
                  "text-xs tabular-nums",
                  body.length > MAX_COMMENT_LENGTH
                    ? "text-destructive"
                    : "text-muted-foreground"
                )}
              >
                {body.length} / {MAX_COMMENT_LENGTH}
              </span>
            )}
          </div>
          <Textarea
            className="min-h-24 resize-y"
            id="share-comment-body"
            onChange={(event) => setBody(event.target.value)}
            placeholder="What should change, or what works?"
            value={body}
          />
        </div>
        {signedIn && (
          <p className="text-muted-foreground text-xs">
            Posting under your account name.
          </p>
        )}
        {error && (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        )}
        <Button className="w-full" disabled={!canSend} type="submit">
          {sending && (
            <Icon className="animate-spin" icon={Loading03Icon} size={16} />
          )}
          Send feedback
        </Button>
      </form>
    </Frame>
  );
}
