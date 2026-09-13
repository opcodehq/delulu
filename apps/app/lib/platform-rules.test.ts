import { SocialTypes } from "@delulu/validators/post";
import { describe, expect, it } from "vitest";
import {
  getDynamicMediaLimits,
  shouldDefaultUseVideoLayout,
  shouldUseMultiPostLayout,
} from "./platform-rules";

describe("TikTok composer media modes", () => {
  it("allows a photo carousel without requiring a video", () => {
    const empty = getDynamicMediaLimits(SocialTypes.TIKTOK, []);
    expect(empty).toMatchObject({
      maxImages: 35,
      maxVideos: 1,
      canAddImages: true,
      canAddVideos: true,
      canMixTypes: false,
    });
    expect(
      getDynamicMediaLimits(SocialTypes.TIKTOK, [{ mediaType: "IMAGE" }])
    ).toMatchObject({
      remainingImages: 34,
      canAddImages: true,
      canAddVideos: false,
    });
  });

  it("keeps video and photo-carousel modes mutually exclusive", () => {
    expect(
      getDynamicMediaLimits(SocialTypes.TIKTOK, [{ mediaType: "VIDEO" }])
    ).toMatchObject({
      canAddImages: false,
      canAddVideos: false,
      canMixTypes: false,
    });
  });

  it("does not force the video-only layout for TikTok", () => {
    expect(shouldDefaultUseVideoLayout([SocialTypes.TIKTOK])).toBe(false);
    expect(shouldDefaultUseVideoLayout([SocialTypes.YOUTUBE])).toBe(true);
  });
});

describe("threaded composer layout", () => {
  it("supports multiple ordered posts for X and Threads", () => {
    expect(shouldUseMultiPostLayout(SocialTypes.TWITTER, [])).toBe(true);
    expect(shouldUseMultiPostLayout(SocialTypes.THREADS, [])).toBe(true);
  });

  it("supports shared threaded content when every default target supports it", () => {
    expect(
      shouldUseMultiPostLayout(SocialTypes.DEFAULT, [
        SocialTypes.TWITTER,
        SocialTypes.THREADS,
      ])
    ).toBe(true);
  });

  it("keeps shared content single-post for empty or mixed targets", () => {
    expect(shouldUseMultiPostLayout(SocialTypes.DEFAULT, [])).toBe(false);
    expect(
      shouldUseMultiPostLayout(SocialTypes.DEFAULT, [
        SocialTypes.TWITTER,
        SocialTypes.LINKEDIN,
      ])
    ).toBe(false);
  });
});
