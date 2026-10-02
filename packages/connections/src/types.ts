import type { TokenCipher } from "@delulu/core";
import type {
  MediaType,
  SocialPublishInputType,
  SocialType,
} from "@delulu/core/publishing/post";
import type { Effect } from "effect";
import type { ConnectionError } from "./errors";
import type { ConnectionStore } from "./services/connection-store";

/** Every publishable network — excludes the non-publishing sentinels. */
export type PublishableSocialType = Exclude<SocialType, "DEFAULT" | "LENS">;

/** Browser-based clients that need callback completion context. */
export type ConnectionClient = "cli" | "mcp";
export type ConnectionReturnTarget = "socials" | "onboarding-connect";

// ── Meta ──────────────────────────────────────────────────────────────────

export interface PlatformCapabilities {
  publish: boolean;
  analytics: boolean;
  supportsDM: boolean;
  multiStepConnect: boolean;
  supportsThreads: boolean;
  supportsStories: boolean;
  supportsDocuments: boolean;
}

export interface PlatformMeta {
  name: string;
  icon: string;
  editor: "normal" | "markdown" | "minimal";
  capabilities: PlatformCapabilities;
  toolTip?: string;
}

// ── Auth ──────────────────────────────────────────────────────────────────

export interface ConnectContext {
  /** M2 signs this centrally with the workspace and initiator principal. */
  state?: string;
  /** Instagram-only: opt-in insights scope (admin feature). */
  includeInsights?: boolean;
  /** Short-lived storage for per-attempt OAuth material such as PKCE. */
  temporaryStore?: ConnectionTemporaryStore;
}

/** Minimal temporary storage needed by multi-step connection callbacks. */
export interface ConnectionTemporaryStore {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number }
  ): Promise<void>;
  delete(key: string): Promise<void>;
}

/**
 * Everything the OAuth callback needs. The API verifies the signed state and
 * provides Postgres persistence while connections stay framework-independent.
 */
export interface CallbackContext {
  /** Shared runtime cipher for encrypted multi-step selections. */
  tokenCipher?: TokenCipher["Service"];
  /** Raw provider state, verified centrally by the M2 API before dispatch. */
  state?: string;
  code: string | null;
  error: string | null;
  errorReason: string | null;
  userId: string;
  /** Optional analytics hook fired on a successful connect. */
  onConnected?: (info: { provider: string; username: string }) => void;
  /** Persist the provider credentials in the authoritative connection store. */
  upsert: (input: ConnectionUpsertInput) => Promise<ConnectionUpsertResult>;
  /** Short-lived state for callbacks that require a second browser step. */
  temporaryStore: ConnectionTemporaryStore;
}

export type ConnectionUpsertResult =
  | { readonly status: "created" | "updated" }
  | {
      readonly status: "transfer_required";
      readonly connectionId: string;
      readonly sourceWorkspaceId: string;
      readonly transferToken?: string;
    };

export interface ConnectionUpsertInput {
  socialType: PublishableSocialType;
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  refreshTokenExpiresIn?: number;
  profileId: string;
  username?: string;
  fullName?: string;
  profileImage?: string;
  metadata?: Record<string, unknown>;
}

export interface TokenRefreshResult {
  accessToken: string;
  refreshToken?: string;
  /** Absolute expiry timestamp (ms epoch). */
  expiresIn: number;
}

export interface PlatformAuth {
  scopes: string[];
  isMultiStep: boolean;
  getConnectUrl(ctx?: ConnectContext): string | Promise<string>;
  handleCallback(ctx: CallbackContext): Promise<Response>;
  refreshToken?(input: {
    socialProviderId: string;
    refreshToken: string;
  }): Effect.Effect<TokenRefreshResult, ConnectionError>;
}

// ── Rules ─────────────────────────────────────────────────────────────────

export interface PlatformMediaRules {
  requiresVideo: boolean;
  requiresImage: boolean;
  requiresEither: boolean;
  allowsMultipleImages: boolean;
  allowsMultipleVideos: boolean;
  maxImages?: number;
}

export interface ValidateInput {
  text: string;
  media: MediaType[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface PlatformRules {
  maxLength: number | undefined;
  media: PlatformMediaRules;
  validate(input: ValidateInput): ValidationResult;
}

// ── Settings ──────────────────────────────────────────────────────────────

export interface SettingFieldOption {
  value: string;
  label: string;
}

/**
 * Describes ONE user-editable setting so the composer can render an editable
 * control generically from the registry (instead of a bespoke per-platform
 * component). The user's chosen values flow back through
 * `content.providerSettings` and are validated by the Zod schemas in
 * `@delulu/core/publishing` at the publish boundary.
 */
export interface SettingField {
  key: string;
  label: string;
  type: "boolean" | "select" | "text";
  /** Required for `type: "select"`. */
  options?: SettingFieldOption[];
  description?: string;
}

export interface PlatformSettings {
  /** Seed values; the user can override any `fields` entry per post. */
  defaults: unknown;
  /** Must the user configure settings before this platform can post? */
  requiresConfiguration: boolean;
  /** User-editable settings (omitted/empty = no per-post settings). */
  fields?: SettingField[];
}

// ── Optional capabilities ───────────────────────────────────────────────────

export interface PlatformWebhooks {
  subscribe(input: {
    profileId: string;
    accessToken: string;
  }): Effect.Effect<void, ConnectionError>;
}

/** Platform-specific read queries (e.g. Instagram post/story pickers). */
export interface PlatformQueries {
  [key: string]: (input: {
    profileId: string;
    accessToken: string;
    limit?: number;
    after?: string;
  }) => Effect.Effect<unknown, ConnectionError>;
}

export interface PlatformMediaItem {
  readonly id: string;
  readonly caption: string | null;
  readonly mediaType: string;
  readonly timestamp: string;
  readonly permalink: string | null;
  readonly thumbnailUrl: string | null;
  readonly mediaUrl: string | null;
}

export interface PlatformMediaPage {
  readonly data: readonly PlatformMediaItem[];
  readonly nextCursor: string | null;
}

// ── Publish ─────────────────────────────────────────────────────────────────

export interface PostResult {
  platformPostId: string;
  platformPostUrl: string;
  platformId: string;
  postId: string;
  postedAt: Date;
}

export interface PublishContext {
  content: SocialPublishInputType;
  socialProviderId: string;
  /** Provider-owned resumable state persisted with the post target. */
  providerState?: Record<string, unknown>;
  /** Durably replace provider state after each externally visible step. */
  persistProviderState?: (state: Record<string, unknown>) => Promise<void>;
}

// ── The connection objects ─────────────────────────────────────────────────

/**
 * Isomorphic (workerd-safe) surface of a platform. NOTE: deliberately has NO
 * `publish`; publishing lives in `PlatformPublisher`, imported only by the
 * durable execution entry.
 */
export interface PlatformConnection {
  id: PublishableSocialType;
  meta: PlatformMeta;
  auth: PlatformAuth;
  rules: PlatformRules;
  settings: PlatformSettings;
  webhooks?: PlatformWebhooks;
  queries?: PlatformQueries;
}

/** Publishing execution requires connection token storage. */
export interface PlatformPublisher {
  id: PublishableSocialType;
  publish(
    ctx: PublishContext
  ): Effect.Effect<PostResult, ConnectionError, ConnectionStore>;
}
