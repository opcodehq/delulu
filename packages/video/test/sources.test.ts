import { describe, expect, it } from "vitest";
import {
  assertExcerpt,
  compactCount,
  decodeCachedTweet,
  opening,
  parseStatusUrl,
  resolveSources,
  type Tweet,
  tweetFromFx,
  xTimestamp,
} from "../src/sources";
import { decodeReel } from "../src/spec";

const NOT_A_POST = /Not an X post/;
const LARGE_AVATAR = /_400x400\.jpg$/;
const NOT_IN_POST = /not in the real post/;

/** Trimmed FxTwitter response for a real post. */
const FX = {
  code: 200,
  tweet: {
    id: "2104823812042940713",
    url: "https://x.com/thsottiaux/status/2104823812042940713",
    text: "Hi,\n\nTomorrow we are re-opening the Pro $200 subscriptions to new subscribers. In effect, if you do the math, it will net out at half the dollar in API spend compared to the old Pro $200 plan. \n\nNow that it's said, let me explain why.",
    created_timestamp: 1_790_664_077,
    replies: 7194,
    retweets: 1619,
    likes: 21_843,
    bookmarks: 4762,
    views: 16_962_514,
    author: {
      name: "Tibo",
      screen_name: "thsottiaux",
      avatar_url:
        "https://pbs.twimg.com/profile_images/2093807917833281537/2yBgpwVV_200x200.jpg",
      verification: { verified: true },
    },
  },
};

const tweet: Tweet = tweetFromFx(FX);

describe("X sources", () => {
  it("parses status links from x.com and twitter.com, with or without tracking params", () => {
    expect(
      parseStatusUrl("https://x.com/thsottiaux/status/2104823812042940713?s=20")
    ).toEqual({
      handle: "thsottiaux",
      id: "2104823812042940713",
    });
    expect(parseStatusUrl("https://twitter.com/jack/status/20").id).toBe("20");
    expect(parseStatusUrl("https://x.com/jack/status/20/photo/1").id).toBe(
      "20"
    );
    expect(() => parseStatusUrl("https://x.com/jack/status/20oops")).toThrow(
      NOT_A_POST
    );
    expect(() => parseStatusUrl("https://x.com/thsottiaux")).toThrow(
      NOT_A_POST
    );
  });

  it("maps the API response and asks for the large avatar", () => {
    expect(tweet).toMatchObject({
      name: "Tibo",
      handle: "thsottiaux",
      verified: true,
      reposts: 1619,
      views: 16_962_514,
    });
    expect(tweet.avatarUrl).toMatch(LARGE_AVATAR);
    expect(tweet.createdAt).toBe("2026-09-29T06:41:17.000Z");
  });

  it("formats counts and time the way X does", () => {
    expect(
      [812, 1619, 7194, 21_843, 16_962_514, 1_250_000_000].map(compactCount)
    ).toEqual(["812", "1.6K", "7.2K", "21.8K", "17M", "1.3B"]);
    expect(xTimestamp(tweet.createdAt, "America/Los_Angeles")).toBe(
      "11:41 PM · Sep 28, 2026"
    );
    expect(xTimestamp(tweet.createdAt)).toBe("6:41 AM · Sep 29, 2026");
  });

  it("rejects posts whose handle or avatar could escape their boundary", () => {
    const evil = (author: object) => ({
      ...FX,
      tweet: { ...FX.tweet, author: { ...FX.tweet.author, ...author } },
    });
    expect(() => tweetFromFx(evil({ screen_name: "../../etc" }))).toThrow();
    expect(() =>
      tweetFromFx(evil({ avatar_url: "http://169.254.169.254/latest" }))
    ).toThrow();
    expect(decodeCachedTweet(JSON.stringify(tweet))).toEqual(tweet);
    expect(decodeCachedTweet('{"handle": 1}')).toBeUndefined();
    expect(decodeCachedTweet("not json")).toBeUndefined();
  });

  it("only accepts excerpts that are the post's own words", () => {
    expect(
      assertExcerpt(
        "it will net out at [[half the dollar in API spend]]",
        tweet.text,
        "u"
      )
    ).toBe("it will net out at half the dollar in API spend");
    expect(() =>
      assertExcerpt("Pro goes from 20x to 10x", tweet.text, "u")
    ).toThrow(NOT_IN_POST);
  });

  it("previews a long post up to a sentence end", () => {
    const long = `${"A sentence that runs on. ".repeat(20)}Tail`;
    const cut = opening(long);
    expect(cut.length).toBeLessThanOrEqual(280);
    expect(cut.endsWith(".")).toBe(true);
  });

  it("fills a linked post from the real one and schedules its avatar download", async () => {
    const reel = decodeReel({
      scenes: [
        {
          duration: 3,
          blocks: [
            {
              type: "post",
              platform: "x",
              source:
                "https://x.com/thsottiaux/status/2104823812042940713?s=20",
              timeZone: "America/Los_Angeles",
              text: "In effect, if you do the math, it will net out at [[half the dollar in API spend]] compared to the old Pro $200 plan.",
            },
          ],
        },
      ],
    });
    const { reel: out, media } = await resolveSources(reel, async () => tweet);
    const block = out.scenes[0]?.blocks[0];
    expect(block).toMatchObject({
      name: "Tibo",
      handle: "@thsottiaux",
      verified: true,
      avatar: "assets/avatars/thsottiaux.jpg",
      showMore: true,
      time: "11:41 PM · Sep 28, 2026",
      stats: {
        replies: "7.2K",
        reposts: "1.6K",
        likes: "21.8K",
        bookmarks: "4.8K",
        views: "17M",
      },
    });
    expect(media).toEqual([
      { url: tweet.avatarUrl, to: "assets/avatars/thsottiaux.jpg" },
    ]);
  });
});
