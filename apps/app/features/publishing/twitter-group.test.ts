import type { ProviderSetting } from "@delulu/core/publishing/post";
import { describe, expect, it } from "vitest";
import {
  twitterGroupProviderIds,
  twitterGroupSettings,
  twitterGroupWrites,
} from "@/features/publishing/twitter-group";

const article = {
  replyRestriction: "everyone",
  format: "article",
  articleTitle: "Long read",
} as const;
const twitter = (socialProviderId: string, settings: object) =>
  ({ socialProviderId, type: "TWITTER", settings }) as ProviderSetting;
const providers = [
  { socialId: "x_a", socialType: "TWITTER" },
  { socialId: "x_b", socialType: "TWITTER" },
  { socialId: "x_custom", socialType: "TWITTER" },
  { socialId: "threads", socialType: "THREADS" },
] as const;
const custom = [{ socialProvider: { socialId: "x_custom" } }];

describe("X content groups", () => {
  it("finds the X accounts sharing the default or a custom group", () => {
    expect(
      twitterGroupProviderIds(providers, custom, {
        isGlobal: true,
        socialId: "global",
      })
    ).toEqual(["x_a", "x_b"]);
    expect(
      twitterGroupProviderIds(providers, custom, {
        isGlobal: false,
        socialId: "x_custom",
      })
    ).toEqual(["x_custom"]);
  });

  it("gives a joining account the group's Article settings", () => {
    const stored = { x_a: twitter("x_a", article) };
    expect(twitterGroupWrites(["x_a", "x_b"], stored)).toEqual([
      twitter("x_b", article),
    ]);
  });

  it("keeps the group's format when its first account has no settings yet", () => {
    const stored = { x_b: twitter("x_b", article) };
    expect(twitterGroupSettings(["x_a", "x_b"], stored)).toEqual(article);
    expect(twitterGroupWrites(["x_a", "x_b"], stored)).toEqual([
      twitter("x_a", article),
    ]);
  });

  it("aligns an account returning from its own content", () => {
    const stored = {
      x_a: twitter("x_a", article),
      x_b: twitter("x_b", {
        replyRestriction: "mentioned",
        quoteTweetId: "123",
      }),
    };
    expect(twitterGroupWrites(["x_a", "x_b"], stored)).toEqual([
      twitter("x_b", article),
    ]);
  });

  it("writes nothing when the group already agrees", () => {
    const stored = {
      x_a: twitter("x_a", article),
      x_b: twitter("x_b", { ...article }),
    };
    expect(twitterGroupWrites(["x_a", "x_b"], stored)).toEqual([]);
  });
});
