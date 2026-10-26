"use client";

import type { TwitterSettings } from "@delulu/core/publishing/post";
import { parseTwitterPostId } from "@delulu/core/publishing/twitter";
import { Button } from "@delulu/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@delulu/design-system/components/ui/dropdown-menu";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@delulu/design-system/components/ui/toggle-group";
import { cn } from "@delulu/design-system/lib/utils";
import { Icon } from "@delulu/design-system/providers/icon";
import {
  AtIcon,
  Cancel01Icon,
  GlobalIcon,
  QuoteDownIcon,
  UserCheck01Icon,
} from "@delulu/icons";
import { type ReactNode, useEffect, useMemo } from "react";
import { SocialIcon } from "@/features/publishing/editor/sidebar/social-icon";
import {
  useSelectedSocialProviders,
  useStore,
} from "@/features/publishing/store";
import {
  twitterGroupProviderIds,
  twitterGroupSettings,
  twitterGroupWrites,
} from "@/features/publishing/twitter-group";

type ReplyRestriction = TwitterSettings["replyRestriction"];

const REPLY_OPTIONS = [
  {
    value: "everyone",
    short: "Everyone",
    label: "Everyone can reply",
    icon: GlobalIcon,
  },
  {
    value: "following",
    short: "Following",
    label: "Accounts you follow can reply",
    icon: UserCheck01Icon,
  },
  {
    value: "mentioned",
    short: "Mentions only",
    label: "Only accounts you mention can reply",
    icon: AtIcon,
  },
] as const satisfies readonly {
  value: ReplyRestriction;
  short: string;
  label: string;
  icon: unknown;
}[];

export interface TwitterComposer {
  readonly providerIds: readonly string[];
  readonly settings: TwitterSettings;
  readonly isArticle: boolean;
  readonly update: (values: Partial<TwitterSettings>) => void;
}

/** X settings for the accounts that publish one editor content group. */
export function useTwitterComposer(
  socialId: string,
  isGlobal: boolean
): TwitterComposer {
  const selectedProviders = useSelectedSocialProviders();
  const alternativeContent = useStore((state) => state.post.alternativeContent);
  const providerSettings = useStore((state) => state.providerSettings);
  const setProviderSettings = useStore((state) => state.setProviderSettings);
  const providerIds = useMemo(
    () =>
      twitterGroupProviderIds(selectedProviders, alternativeContent, {
        isGlobal,
        socialId,
      }),
    [alternativeContent, isGlobal, selectedProviders, socialId]
  );
  const settings = twitterGroupSettings(providerIds, providerSettings);
  // Accounts can return to this group from their own content; align them.
  useEffect(() => {
    for (const write of twitterGroupWrites(providerIds, providerSettings)) {
      setProviderSettings(write.socialProviderId, write);
    }
  }, [providerIds, providerSettings, setProviderSettings]);
  const update = (values: Partial<TwitterSettings>) => {
    for (const providerId of providerIds) {
      setProviderSettings(providerId, {
        socialProviderId: providerId,
        type: "TWITTER",
        settings: { ...settings, ...values },
      });
    }
  };
  return {
    providerIds,
    settings,
    isArticle: providerIds.length > 0 && settings.format === "article",
    update,
  };
}

/** Format switch and reply audience, shown above the editor. */
export function TwitterComposerBar({
  twitter,
  onFormatChange,
  actions,
}: {
  twitter: TwitterComposer;
  onFormatChange: (format: "post" | "article") => void;
  /** Extra X actions for layouts without a post toolbar. */
  actions?: ReactNode;
}) {
  const reply =
    REPLY_OPTIONS.find(
      (option) => option.value === twitter.settings.replyRestriction
    ) ?? REPLY_OPTIONS[0];
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 px-1 sm:px-2">
      <SocialIcon className="size-4 text-foreground" type="TWITTER" />
      <ToggleGroup
        aria-label="X format"
        className="rounded-lg bg-muted p-0.5"
        onValueChange={(value) => {
          if (value === "post" || value === "article") {
            onFormatChange(value);
          }
        }}
        type="single"
        value={twitter.isArticle ? "article" : "post"}
      >
        {(["post", "article"] as const).map((format) => (
          <ToggleGroupItem
            className="h-8 rounded-md px-3 text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-xs [@media(pointer:coarse)]:h-11"
            key={format}
            value={format}
          >
            {format === "post" ? "Post" : "Article"}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {actions}
      {!twitter.isArticle && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`Who can reply: ${reply.label}`}
              className="ml-auto h-8 gap-1.5 rounded-full px-3 text-primary hover:text-primary [@media(pointer:coarse)]:h-11"
              variant="ghost"
            >
              <Icon icon={reply.icon} size={14} />
              {reply.short}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuRadioGroup
              onValueChange={(value) => {
                const option = REPLY_OPTIONS.find(
                  (item) => item.value === value
                );
                if (option) {
                  twitter.update({ replyRestriction: option.value });
                }
              }}
              value={reply.value}
            >
              {REPLY_OPTIONS.map((option) => (
                <DropdownMenuRadioItem
                  className="min-h-9 [@media(pointer:coarse)]:min-h-11"
                  key={option.value}
                  value={option.value}
                >
                  {option.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

const TITLE_LIMIT = 100;

/** Heading field that sits directly above the Article body. */
export function TwitterArticleTitle({
  twitter,
  inputId,
}: {
  twitter: TwitterComposer;
  inputId: string;
}) {
  const title = twitter.settings.articleTitle ?? "";
  return (
    <div className="relative mb-3">
      <label className="sr-only" htmlFor={inputId}>
        Article title
      </label>
      <input
        className="w-full bg-transparent pr-14 font-bold text-3xl leading-10 tracking-tight outline-none placeholder:text-muted-foreground/50"
        id={inputId}
        maxLength={TITLE_LIMIT}
        onChange={(event) =>
          twitter.update({ articleTitle: event.target.value })
        }
        placeholder="Title"
        value={title}
      />
      {title.length >= TITLE_LIMIT - 20 && (
        <span className="absolute top-3 right-0 text-muted-foreground text-xs tabular-nums">
          {title.length}/{TITLE_LIMIT}
        </span>
      )}
    </div>
  );
}

/** Toolbar action that starts quoting from the first post. */
export function TwitterQuoteButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      aria-label="Quote a post"
      className="text-muted-foreground hover:text-foreground [@media(pointer:coarse)]:h-11"
      onClick={onClick}
      variant="ghost"
    >
      <Icon icon={QuoteDownIcon} size={15} />
      <span className="hidden sm:inline">Quote</span>
    </Button>
  );
}

/** Inline quote target, styled like the embedded post it will create. */
export function TwitterQuoteCard({
  twitter,
  inputId,
  onRemove,
}: {
  twitter: TwitterComposer;
  inputId: string;
  onRemove: () => void;
}) {
  const value = twitter.settings.quoteTweetId ?? "";
  const postId = value.trim() ? parseTwitterPostId(value) : undefined;
  const invalid = Boolean(value.trim()) && !postId;
  return (
    <div
      className={cn(
        "mx-1 mb-2 rounded-xl border px-3 py-2 sm:mx-2",
        invalid ? "border-destructive/60" : "border-border"
      )}
    >
      <div className="flex items-center gap-2">
        <Icon
          className="shrink-0 text-muted-foreground"
          icon={QuoteDownIcon}
          size={15}
        />
        <label className="sr-only" htmlFor={inputId}>
          Post to quote
        </label>
        <input
          aria-describedby={`${inputId}-status`}
          aria-invalid={invalid}
          autoFocus={!value}
          className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground/70"
          id={inputId}
          onChange={(event) =>
            twitter.update({ quoteTweetId: event.target.value })
          }
          placeholder="Paste a link to the X post you're quoting"
          value={value}
        />
        <Button
          aria-label="Remove quote"
          className="size-8 shrink-0 rounded-full text-muted-foreground [@media(pointer:coarse)]:size-11"
          onClick={onRemove}
          size="icon"
          variant="ghost"
        >
          <Icon icon={Cancel01Icon} size={14} />
        </Button>
      </div>
      <p
        className={cn(
          "pl-6 text-xs",
          invalid ? "text-destructive" : "text-muted-foreground"
        )}
        id={`${inputId}-status`}
      >
        {invalid
          ? "That isn't an X post link. Use x.com/…/status/… or a post ID."
          : postId
            ? `Quoting post ${postId}`
            : "Your first post will quote it."}
      </p>
    </div>
  );
}
