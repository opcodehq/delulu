/** View-model types derived from the typed HTTP API for shared UI components. */
export type PostStatus =
  | "SAVED"
  | "SCHEDULED"
  | "PUBLISHED"
  | "DELETED"
  | "FAILED"
  | "PROCESSING";
export type SocialType =
  | "BLUESKY"
  | "FACEBOOK"
  | "FARCASTER"
  | "INSTAGRAM"
  | "LINKEDIN"
  | "PINTEREST"
  | "THREADS"
  | "TIKTOK"
  | "TWITTER"
  | "YOUTUBE";

export interface Post {
  readonly id: string;
  readonly _id: string;
  readonly workspaceId: string;
  readonly organizationId?: string;
  readonly status: PostStatus;
  readonly groups: readonly {
    readonly id: string;
    readonly isDefault: boolean;
    readonly segments: readonly {
      readonly text: string;
      readonly media: readonly {
        readonly id: string;
        readonly altText?: string;
      }[];
    }[];
  }[];
  readonly targets: readonly PostTarget[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly scheduledAt?: number;
  readonly content: readonly LegacyContent[];
  readonly socialProviders?: readonly SocialProvider[];
  readonly reviewStatus?: string;
  readonly postFailureReason?: string;
  readonly platformPosts?: readonly {
    readonly socialProviderId: string;
    readonly platformPostUrl?: string;
    readonly failureReason?: string;
  }[];
}

export interface PostTarget {
  readonly id: string;
  readonly connectionId: string;
  readonly status: "pending" | "publishing" | "published" | "failed";
  readonly scheduledAt: string | null;
  readonly platformPostUrl: string | null;
  readonly error: string | null;
}

export interface LegacyContent {
  readonly text: string;
  readonly media: readonly Media[];
  readonly name?: string;
}

export interface SocialProvider {
  readonly id: string;
  readonly _id?: string;
  readonly platform: string;
  readonly socialType: SocialType;
  readonly displayName: string | null;
  readonly fullName: string;
  readonly username: string | null;
  readonly profileId: string;
  readonly profilePicture?: string;
  readonly profileImage?: string;
  readonly isActive?: boolean;
  readonly expiresAt: string | null;
}

export type PostId = string;
export type UserId = string;
export type MediaId = string;
export type AutomationId = string;
export interface User {
  readonly id: string;
  readonly name?: string;
}
export interface Media {
  readonly id: string;
  readonly url?: string;
  readonly bucketUrl?: string;
  readonly bucketKey: string;
  readonly type?: string;
  readonly mediaType?: "IMAGE" | "VIDEO" | "DOCUMENT";
  readonly altText?: string;
}
export interface Automation {
  readonly id: string;
  readonly name: string;
}
export interface AutomationLog {
  readonly id: string;
  readonly createdAt: string;
}
export type PostLayout = "grid" | "list";

export interface DashboardStats {
  readonly totalPosts: number;
  readonly publishedPosts: number;
  readonly scheduledPosts: number;
  readonly failedPosts: number;
  readonly totalSocialAccounts: number;
  readonly totalAutomations: number;
  readonly publishedCount: number;
  readonly scheduledCount: number;
  readonly failedCount: number;
  readonly savedCount: number;
  readonly processingCount: number;
  readonly upcomingPosts: number;
  readonly postingStreak: number;
  readonly longestStreak: number;
  readonly connectedAccounts: number;
  readonly expiredTokens: number;
}
export type FailedPost = Post;
export type UpcomingPost = Post;
export interface AccountInsight {
  readonly id: string;
  readonly value: number;
}
export interface MediaInsight {
  readonly id: string;
  readonly value: number;
}
export interface AnalyticsSyncState {
  readonly updatedAt: string;
  readonly stale: boolean;
}
export interface AccountOverview {
  readonly data: readonly AccountInsight[];
}
export interface TopPosts {
  readonly data: readonly MediaInsight[];
}
