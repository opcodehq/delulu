import { Schema } from "effect";
import { parseRuns } from "./markup";
import type { Block, Reel } from "./spec";

/**
 * Real content for blocks that point at a source. Everything is fetched at build time (never during
 * a render), cached, and turned into plain spec fields, so `compose` stays a pure function.
 */

/** X usernames: 1–15 letters, digits or underscores. Safe to use in a file name. */
const HANDLE = /^[A-Za-z0-9_]{1,15}$/;
/** Avatars are only ever downloaded from X's image host, over HTTPS. */
const AVATAR_URL = /^https:\/\/pbs\.twimg\.com\//;

/** A post as the build uses (and caches) it. Decoding enforces the handle and avatar rules. */
export const TweetSchema = Schema.Struct({
  id: Schema.String,
  url: Schema.String,
  name: Schema.String,
  handle: Schema.String.check(Schema.isPattern(HANDLE)),
  verified: Schema.Boolean,
  avatarUrl: Schema.String.check(Schema.isPattern(AVATAR_URL)),
  text: Schema.String,
  createdAt: Schema.String,
  replies: Schema.Number,
  reposts: Schema.Number,
  likes: Schema.Number,
  bookmarks: Schema.Number,
  views: Schema.NullOr(Schema.Number),
});
export type Tweet = typeof TweetSchema.Type;

const decodeTweet = Schema.decodeUnknownSync(TweetSchema);

/** A cached post, or undefined when the cache entry is missing fields or malformed. */
export const decodeCachedTweet = (json: string): Tweet | undefined => {
  try {
    return decodeTweet(JSON.parse(json));
  } catch {
    return undefined;
  }
};

/** X avatar URLs end in a size suffix; we ask for the largest square one. */
const AVATAR_SIZE = /_(normal|bigger|200x200)\./;
const STATUS_URL =
  /^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d+)(?=$|[/?#])/;

/** Parse an x.com / twitter.com status link. */
export const parseStatusUrl = (url: string): { handle: string; id: string } => {
  const match = STATUS_URL.exec(url.trim());
  if (!(match?.[1] && match[2])) {
    throw new Error(`Not an X post link: ${url}`);
  }
  return { handle: match[1], id: match[2] };
};

const FxTweet = Schema.Struct({
  tweet: Schema.Struct({
    id: Schema.String,
    url: Schema.String,
    text: Schema.String,
    created_timestamp: Schema.Number,
    replies: Schema.Number,
    retweets: Schema.Number,
    likes: Schema.Number,
    bookmarks: Schema.optional(Schema.Number),
    views: Schema.optional(Schema.NullOr(Schema.Number)),
    author: Schema.Struct({
      name: Schema.String,
      screen_name: Schema.String,
      avatar_url: Schema.String,
      verification: Schema.optional(
        Schema.NullOr(Schema.Struct({ verified: Schema.Boolean }))
      ),
    }),
  }),
});

/** Turn the FxTwitter API response (https://github.com/FxEmbed/FxEmbed) into a Tweet. */
export const tweetFromFx = (json: unknown): Tweet => {
  const { tweet: t } = Schema.decodeUnknownSync(FxTweet)(json);
  // Validated: the handle becomes a file name and the avatar URL is fetched.
  return decodeTweet({
    id: t.id,
    url: t.url,
    name: t.author.name,
    handle: t.author.screen_name,
    verified: t.author.verification?.verified ?? false,
    // Ask for the largest square avatar X serves.
    avatarUrl: t.author.avatar_url.replace(AVATAR_SIZE, "_400x400."),
    text: t.text,
    createdAt: new Date(t.created_timestamp * 1000).toISOString(),
    replies: t.replies,
    reposts: t.retweets,
    likes: t.likes,
    bookmarks: t.bookmarks ?? 0,
    views: t.views ?? null,
  });
};

export const fetchTweet = async (
  url: string,
  fetchImpl: typeof fetch = fetch
): Promise<Tweet> => {
  const { handle, id } = parseStatusUrl(url);
  const res = await fetchImpl(
    `https://api.fxtwitter.com/${handle}/status/${id}`,
    {
      headers: {
        "user-agent": "delulu-video (+https://github.com/opcodehq/delulu)",
      },
    }
  );
  if (!res.ok) {
    throw new Error(
      `Could not fetch ${url} (${res.status}). Is the post public?`
    );
  }
  return tweetFromFx(await res.json());
};

/* ---------- formatting, the way X shows it ---------- */

/** 7194 → "7.2K", 16962514 → "17M", 1619 → "1.6K", 812 → "812". */
export const compactCount = (n: number): string => {
  const units = [
    { size: 1e9, suffix: "B" },
    { size: 1e6, suffix: "M" },
    { size: 1e3, suffix: "K" },
  ];
  const round = (v: number) =>
    v >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
  const i = units.findIndex((u) => n >= u.size);
  const unit = units[i];
  if (!unit) {
    return String(n);
  }
  const value = round(n / unit.size);
  // A value that rounds up to 1000 moves to the next unit: 999,999 reads "1M", not "1000K".
  const bigger = units[i - 1];
  if (value >= 1000 && bigger) {
    return `${round(n / bigger.size)}${bigger.suffix}`;
  }
  return `${value}${unit.suffix}`;
};

/** "11:41 PM · Sep 28, 2026" in the given time zone. */
export const xTimestamp = (iso: string, timeZone = "UTC"): string => {
  const date = new Date(iso);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(date);
  const day = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  }).format(date);
  return `${time} · ${day}`;
};

const normalise = (text: string) => text.replace(/\s+/g, " ").trim();
const plain = (marked: string) =>
  parseRuns(marked)
    .map((r) => r.text)
    .join("");

/** An excerpt must be the post's own words. Returns the plain excerpt or throws. */
export const assertExcerpt = (
  excerpt: string,
  full: string,
  url: string
): string => {
  const words = normalise(plain(excerpt));
  if (!normalise(full).includes(words)) {
    throw new Error(
      `The post text for ${url} is not in the real post. Quote it word for word:\n  "${words}"`
    );
  }
  return words;
};

/** The opening of a long post, cut at a sentence end near X's 280-character preview. */
export const opening = (text: string, limit = 280): string => {
  const flat = text.trim();
  if (flat.length <= limit) {
    return flat;
  }
  const cut = flat.slice(0, limit);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(".\n"));
  return (end > 80 ? cut.slice(0, end + 1) : cut).trim();
};

/* ---------- resolving a reel ---------- */

export interface MediaFile {
  /** Remote URL to download. */
  readonly url: string;
  /** Project-relative destination. */
  readonly to: string;
}

export interface Resolved {
  readonly reel: Reel;
  readonly media: readonly MediaFile[];
}

/**
 * Fill every block that has a `source` from the real post. Spec fields win over fetched ones,
 * except the text, which must be an exact excerpt.
 */
export const resolveSources = async (
  reel: Reel,
  getTweet: (url: string) => Promise<Tweet> = fetchTweet
): Promise<Resolved> => {
  const media: MediaFile[] = [];
  const resolveBlock = async (block: Block): Promise<Block> => {
    if (block.type !== "post" || !block.source) {
      return block;
    }
    if (block.platform !== "x") {
      throw new Error(
        `Only X post links can be fetched for now (got platform "${block.platform}").`
      );
    }
    const tweet = await getTweet(block.source);
    const avatar =
      block.avatar ?? `assets/avatars/${tweet.handle.toLowerCase()}.jpg`;
    if (!block.avatar) {
      media.push({ url: tweet.avatarUrl, to: avatar });
    }
    const text = block.text ?? opening(tweet.text);
    const shown = assertExcerpt(text, tweet.text, block.source);
    return {
      ...block,
      name: block.name ?? tweet.name,
      handle: block.handle ?? `@${tweet.handle}`,
      verified: block.verified ?? tweet.verified,
      avatar,
      text,
      showMore: block.showMore ?? shown.length < normalise(tweet.text).length,
      time: block.time ?? xTimestamp(tweet.createdAt, block.timeZone),
      stats: block.stats ?? {
        replies: compactCount(tweet.replies),
        reposts: compactCount(tweet.reposts),
        likes: compactCount(tweet.likes),
        bookmarks: compactCount(tweet.bookmarks),
        ...(tweet.views === null ? {} : { views: compactCount(tweet.views) }),
      },
    };
  };
  const scenes = await Promise.all(
    reel.scenes.map(async (scene) => ({
      ...scene,
      blocks: await Promise.all(scene.blocks.map(resolveBlock)),
    }))
  );
  return {
    reel: { ...reel, scenes: scenes as unknown as Reel["scenes"] },
    media,
  };
};
