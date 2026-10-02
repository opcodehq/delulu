import type {
  BlueskySettings,
  FacebookSettings,
  FarcasterSettings,
  InstagramSettings,
  LinkedInSettings,
  PinterestSettings,
  ThreadsSettings,
  TikTokSettings,
  TwitterSettings,
  YouTubeSettings,
} from "../post";
import { promotionContentTypes, tikTokPrivacyLevels } from "../post";

/**
 * Default settings for TikTok platform
 * - Public visibility (note: actual privacy will be set based on creator's available options)
 * - All interactions enabled (comments, duet, stitch)
 * - No commercial content disclosure
 *
 * IMPORTANT: The privacy field should be overridden with the first available option
 * from the TikTok creator API's privacy_level_options when initializing settings.
 */
export const DEFAULT_TIKTOK_SETTINGS: TikTokSettings = {
  privacy: tikTokPrivacyLevels.PUBLIC_TO_EVERYONE,
  allowComments: true,
  allowDuet: true,
  allowStitch: true,
  promotionContent: promotionContentTypes.NONE,
};

/**
 * Default settings for YouTube platform
 * - Public visibility
 * - Not made for kids
 * - No age restriction
 */
export const DEFAULT_YOUTUBE_SETTINGS: YouTubeSettings = {
  privacy: "PUBLIC",
  madeForKids: false,
  ageRestriction: false,
};

/**
 * Default settings for Instagram platform
 * - Share to feed enabled
 * - Story disabled by default
 * - Trial reels disabled by default
 * - Graduation strategy defaults to MANUAL
 */
export const DEFAULT_INSTAGRAM_SETTINGS: InstagramSettings = {
  shareToFeed: true,
  shareToStory: false,
  trialReels: false,
  graduationStrategy: "MANUAL",
};

/**
 * Default settings for Facebook platform
 * - Public visibility
 */
export const DEFAULT_FACEBOOK_SETTINGS: FacebookSettings = {
  privacy: "PUBLIC",
};

/**
 * Default settings for Twitter/X platform
 * - Everyone can reply
 */
export const DEFAULT_TWITTER_SETTINGS: TwitterSettings = {
  replyRestriction: "everyone",
};

/**
 * Default settings for LinkedIn platform
 * - Public visibility
 */
export const DEFAULT_LINKEDIN_SETTINGS: LinkedInSettings = {
  visibility: "PUBLIC",
};

/**
 * Default settings for Threads platform
 * - Everyone can reply
 */
export const DEFAULT_THREADS_SETTINGS: ThreadsSettings = {
  replyControl: "everyone",
};

/**
 * Default settings for Pinterest platform
 * - No default board selected
 */
export const DEFAULT_PINTEREST_SETTINGS: PinterestSettings = {
  boardId: undefined,
};

/**
 * Default settings for Farcaster platform
 * - No default channel selected
 */
export const DEFAULT_FARCASTER_SETTINGS: FarcasterSettings = {
  channelId: undefined,
};

/**
 * Default settings for Bluesky platform
 * - Replies enabled
 */
export const DEFAULT_BLUESKY_SETTINGS: BlueskySettings = {
  replyDisabled: false,
};

/**
 * Map of social platform types to their default settings
 * Use this to get default settings for any platform type
 */
export const PLATFORM_DEFAULT_SETTINGS = {
  TIKTOK: DEFAULT_TIKTOK_SETTINGS,
  YOUTUBE: DEFAULT_YOUTUBE_SETTINGS,
  INSTAGRAM: DEFAULT_INSTAGRAM_SETTINGS,
  FACEBOOK: DEFAULT_FACEBOOK_SETTINGS,
  TWITTER: DEFAULT_TWITTER_SETTINGS,
  LINKEDIN: DEFAULT_LINKEDIN_SETTINGS,
  THREADS: DEFAULT_THREADS_SETTINGS,
  PINTEREST: DEFAULT_PINTEREST_SETTINGS,
  FARCASTER: DEFAULT_FARCASTER_SETTINGS,
  BLUESKY: DEFAULT_BLUESKY_SETTINGS,
} as const;

/**
 * Platforms that require settings to be configured before posting
 */
export const PLATFORMS_WITH_REQUIRED_SETTINGS = [
  "TIKTOK",
  // Add more platforms here as needed
] as const;
