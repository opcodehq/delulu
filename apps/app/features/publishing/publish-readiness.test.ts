import type {
  FullPostType,
  SocialProviderType,
} from "@delulu/core/publishing/post";
import { SocialTypes } from "@delulu/core/publishing/post";
import { describe, expect, it } from "vitest";
import { getPublishIssues } from "@/features/publishing/publish-readiness";

const segment = (
  text: string,
  media: FullPostType["content"][number]["media"] = []
): FullPostType["content"][number] => ({
  id: "",
  order: 0,
  name: "DEFAULT",
  text,
  media,
  tags: [],
  socialId: "global",
});
const provider = (
  socialId: string,
  socialType: SocialProviderType["socialType"],
  name = socialId
): SocialProviderType => ({ socialId, socialType, name });
const post = (
  content: FullPostType["content"],
  alternativeContent: FullPostType["alternativeContent"] = []
) => ({ content, alternativeContent });

describe("getPublishIssues", () => {
  it("asks for a channel before anything else", () => {
    expect(getPublishIssues([], post([segment("Hello")]))).toEqual([
      { id: "channels", message: "Choose at least one channel" },
    ]);
  });

  it("names each account that is missing required media", () => {
    const issues = getPublishIssues(
      [
        provider("yt", SocialTypes.YOUTUBE, "Swaraj Human"),
        provider("ig", SocialTypes.INSTAGRAM, "Swaraj"),
        provider("x", SocialTypes.TWITTER, "swaraj"),
      ],
      post([segment("Launch day")])
    );
    expect(issues.map((issue) => issue.message)).toEqual([
      "Swaraj Human: Add a video",
      "Swaraj: Add a video or images",
    ]);
  });

  it("reports empty text-only posts and is clear once content exists", () => {
    const x = [provider("x", SocialTypes.TWITTER, "swaraj")];
    expect(getPublishIssues(x, post([segment("  ")]))).toMatchObject([
      { id: "x:empty", message: "swaraj: Write something or add media" },
    ]);
    expect(getPublishIssues(x, post([segment("Shipped")]))).toEqual([]);
  });

  it("checks customized content instead of the shared draft", () => {
    const issues = getPublishIssues(
      [provider("x", SocialTypes.TWITTER, "swaraj")],
      post(
        [segment("Short shared text")],
        [
          {
            socialProvider: provider("x", SocialTypes.TWITTER, "swaraj"),
            content: [segment("a".repeat(290))],
          },
        ]
      )
    );
    expect(issues).toMatchObject([
      { id: "x:length", message: "swaraj: 10 characters over the 280 limit" },
    ]);
  });

  it("accepts a video for video-first platforms", () => {
    expect(
      getPublishIssues(
        [provider("tt", SocialTypes.TIKTOK)],
        post([segment("", [{ mediaType: "VIDEO", bucketKey: "video.mp4" }])])
      )
    ).toEqual([]);
  });

  it("flags threads on platforms that only accept a single post", () => {
    const thread = post([
      segment("Part one", [{ mediaType: "IMAGE", bucketKey: "photo.jpg" }]),
      { ...segment("Part two"), order: 1 },
    ]);
    expect(
      getPublishIssues(
        [provider("ig", SocialTypes.INSTAGRAM, "Swaraj")],
        thread
      )
    ).toMatchObject([
      {
        id: "ig:thread",
        message: "Swaraj: Threads aren't supported. Keep a single post",
      },
    ]);
    expect(
      getPublishIssues([provider("x", SocialTypes.TWITTER, "swaraj")], thread)
    ).toEqual([]);
  });
});
