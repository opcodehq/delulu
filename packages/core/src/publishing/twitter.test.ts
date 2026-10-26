import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { PlatformSettings } from "../domain/post-target";
import {
  parseTwitterPostId,
  twitterSettingsSchema,
  validateTwitterContent,
} from "./twitter";

describe("X publishing settings", () => {
  it.each([
    "1234567890123456789",
    "https://x.com/wiz/status/1234567890123456789?s=20",
    "https://twitter.com/wiz/status/1234567890123456789",
    " https://x.com/i/web/status/1234567890123456789 ",
  ])("preserves ID precision: %s", (value) => {
    expect(parseTwitterPostId(value)).toBe("1234567890123456789");
  });
  it.each([
    "",
    "0",
    "123.5",
    "https://x.com.evil.test/wiz/status/123",
    "https://evil.test/wiz/status/123",
    "https://x.com/wiz",
    "https://x.com/wiz/status/123/extra",
    "http://x.com/wiz/status/123",
    "https://user@x.com/wiz/status/123",
  ])("rejects invalid quote targets: %s", (value) =>
    expect(parseTwitterPostId(value)).toBeUndefined());
  it.each([
    { replyRestriction: "everyone" as const },
    {
      replyRestriction: "following" as const,
      quoteTweetId: "https://x.com/wiz/status/123",
    },
    {
      replyRestriction: "everyone" as const,
      format: "article" as const,
      articleTitle: "Title",
    },
  ])("preserves settings through both contract schemas: %j", (settings) => {
    expect(twitterSettingsSchema.parse(settings)).toEqual(settings);
    expect(
      Schema.decodeUnknownSync(PlatformSettings)({
        platform: "TWITTER",
        values: settings,
      })
    ).toEqual({ platform: "TWITTER", values: settings });
  });
  it("allows incomplete draft configuration but validates Article publishing", () => {
    const settings = twitterSettingsSchema.parse({
      replyRestriction: "everyone",
      format: "article",
    });
    expect(validateTwitterContent(settings, [{ text: "" }])).toEqual([
      "Add a title for your X Article",
      "Add a body for your X Article",
    ]);
    expect(
      validateTwitterContent({ ...settings, articleTitle: "Title" }, [
        { text: "Body ".repeat(1000) },
      ])
    ).toEqual([]);
  });
});

it("rejects malformed quote IDs in both boundary schemas", () => {
  const settings = {
    replyRestriction: "everyone",
    quoteTweetId: "https://evil.test/wiz/status/123",
  };
  expect(twitterSettingsSchema.safeParse(settings).success).toBe(false);
  expect(() =>
    Schema.decodeUnknownSync(PlatformSettings)({
      platform: "TWITTER",
      values: settings,
    })
  ).toThrow();
});

it("rejects multiple Article cover images before publishing", () => {
  expect(
    validateTwitterContent(
      {
        replyRestriction: "everyone",
        format: "article",
        articleTitle: "Title",
      },
      [
        {
          text: "Body",
          media: [{ mediaType: "IMAGE" }, { mediaType: "IMAGE" }],
        },
      ]
    )
  ).toContain("X Articles support one optional cover image");
});
