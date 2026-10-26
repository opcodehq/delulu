"use client";

import { DEFAULT_TWITTER_SETTINGS } from "@delulu/core/publishing/constants/settings";
import type { TwitterSettings } from "@delulu/core/publishing/post";
import {
  parseTwitterPostId,
  validateTwitterContent,
} from "@delulu/core/publishing/twitter";
import { Input } from "@delulu/design-system/components/ui/input";
import { Label } from "@delulu/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@delulu/design-system/components/ui/select";
import { useStore } from "@/features/publishing/store";

export function TwitterSettingsDisplay({ providerId }: { providerId: string }) {
  const { post, providerSettings, setProviderSettings } = useStore();
  const configured = providerSettings[providerId];
  const settings =
    configured?.type === "TWITTER"
      ? configured.settings
      : DEFAULT_TWITTER_SETTINGS;
  const article = settings.format === "article";
  const segments =
    post.alternativeContent.find(
      (item) => item.socialProvider.socialId === providerId
    )?.content ?? post.content;
  const update = (values: Partial<TwitterSettings>) =>
    setProviderSettings(providerId, {
      socialProviderId: providerId,
      type: "TWITTER",
      settings: { ...settings, ...values },
    });
  const quoteInvalid = Boolean(
    settings.quoteTweetId?.trim() && !parseTwitterPostId(settings.quoteTweetId)
  );
  const issues = validateTwitterContent(settings, segments);
  const formatId = `${providerId}-twitter-format`;
  const quoteId = `${providerId}-twitter-quote`;
  const titleId = `${providerId}-twitter-title`;
  const replyId = `${providerId}-twitter-replies`;
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={formatId}>Format</Label>
        <Select
          onValueChange={(format) =>
            update(
              format === "article"
                ? {
                    format: "article",
                    quoteTweetId: "",
                    replyRestriction: "everyone",
                  }
                : { format: "post" }
            )
          }
          value={settings.format ?? "post"}
        >
          <SelectTrigger className="w-full" id={formatId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="post">Post or thread</SelectItem>
            <SelectItem value="article">Article</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {article ? (
        <>
          <div className="space-y-2">
            <Label htmlFor={titleId}>Article title</Label>
            <Input
              id={titleId}
              maxLength={100}
              onChange={(event) => update({ articleTitle: event.target.value })}
              value={settings.articleTitle ?? ""}
            />
          </div>
          <p className="text-muted-foreground text-sm">
            Write your full article in the editor. Paragraphs are preserved, and
            one attached image becomes the cover. Your X account must have
            access to Articles.
          </p>
        </>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor={quoteId}>Post to quote</Label>
            <Input
              aria-describedby={`${quoteId}-help`}
              aria-invalid={quoteInvalid}
              id={quoteId}
              onChange={(event) => update({ quoteTweetId: event.target.value })}
              placeholder="X post URL or ID (optional)"
              value={settings.quoteTweetId ?? ""}
            />
            <p className="text-muted-foreground text-sm" id={`${quoteId}-help`}>
              Paste an X or Twitter post URL or ID. The first post in a thread
              will quote it.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor={replyId}>Who can reply</Label>
            <Select
              onValueChange={(value) => {
                if (
                  value === "everyone" ||
                  value === "following" ||
                  value === "mentioned"
                ) {
                  update({ replyRestriction: value });
                }
              }}
              value={settings.replyRestriction}
            >
              <SelectTrigger className="w-full" id={replyId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="everyone">Everyone</SelectItem>
                <SelectItem value="following">Accounts you follow</SelectItem>
                <SelectItem value="mentioned">
                  Only accounts you mention
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}
      {issues.length > 0 && (
        <div className="space-y-1 text-destructive text-sm" role="alert">
          {issues.map((issue) => (
            <p key={issue}>{issue}</p>
          ))}
        </div>
      )}
    </div>
  );
}
