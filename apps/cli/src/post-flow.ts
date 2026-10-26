import {
  applyTwitterPostOptions,
  type SimplePostConnection,
  type TwitterPostOptions,
} from "@delulu/client";
import { CliError } from "./cli-error.js";

export type PostIntent = "draft" | "schedule" | "publish_now";

export interface PostAccount {
  readonly id: string;
  readonly platform: string;
  readonly username?: string | null;
  readonly displayName?: string | null;
  readonly settings?: unknown;
}

export interface PostFlowResult {
  readonly id: string;
  readonly status: string;
  readonly targets: readonly {
    readonly id: string;
    readonly status: string;
    readonly platformPostUrl?: string | null;
    readonly error?: string | null;
  }[];
}

export type PostConnectionInput = SimplePostConnection;

export interface PostMediaInput {
  readonly id: string;
  readonly mediaType: string;
}

const obviousImageExtensions = new Set([
  "avif",
  "gif",
  "heic",
  "heif",
  "jpeg",
  "jpg",
  "png",
  "webp",
]);

const rejectObviousImageSource = (source: string) => {
  let pathname = source;
  if (source.startsWith("https://")) {
    try {
      pathname = new URL(source).pathname;
    } catch {
      return;
    }
  }
  const extension = pathname.split(".").pop()?.toLowerCase();
  if (extension && obviousImageExtensions.has(extension)) {
    throw new CliError({
      code: "TRIAL_REEL_VIDEO_REQUIRED",
      message: "--trial-reel media must be a video",
      exitCode: 2,
    });
  }
};

export const validateTrialReelTargets = (
  trialReel: boolean,
  accounts: readonly PostAccount[]
) => {
  if (
    trialReel &&
    !accounts.some((account) => account.platform.toUpperCase() === "INSTAGRAM")
  ) {
    throw new CliError({
      code: "INSTAGRAM_TARGET_REQUIRED",
      message: "--trial-reel requires at least one Instagram target",
      exitCode: 2,
      next: ["delulu accounts"],
    });
  }
};

export const validateTrialReelMedia = (
  trialReel: boolean,
  media: PostMediaInput
) => {
  if (trialReel && media.mediaType.toUpperCase() !== "VIDEO") {
    throw new CliError({
      code: "TRIAL_REEL_VIDEO_REQUIRED",
      message: "--trial-reel media must be a video",
      exitCode: 2,
    });
  }
};

export interface PostFlowAdapter {
  readonly listAccounts: () => Promise<readonly PostAccount[]>;
  readonly addMedia: (
    source: string,
    altText?: string
  ) => Promise<PostMediaInput>;
  readonly create: (input: {
    readonly caption: string;
    readonly connections: readonly PostConnectionInput[];
    readonly mediaIds: readonly string[];
    readonly intent: PostIntent;
    readonly idempotencyKey?: string;
    readonly scheduledAt: string | null;
    readonly privacy?: string;
  }) => Promise<PostFlowResult>;
  readonly get: (id: string) => Promise<PostFlowResult>;
  readonly sleep: (milliseconds: number) => Promise<void>;
  readonly now: () => number;
}

export interface SubmitPostInput {
  readonly caption: string;
  readonly accountSelectors?: readonly string[];
  readonly mediaSources?: readonly string[];
  readonly altText?: string;
  readonly intent: PostIntent;
  readonly idempotencyKey?: string;
  readonly scheduledAt?: string;
  readonly privacy?: string;
  readonly trialReel?: boolean;
  readonly graduationStrategy?: string;
  readonly twitter?: TwitterPostOptions;
  readonly waitForTerminal?: boolean;
  readonly timeoutMs?: number;
  readonly pollIntervalMs?: number;
}

export const validateTrialReelOptions = (input: {
  readonly trialReel?: boolean;
  readonly graduationStrategy?: string;
  readonly mediaSources?: readonly string[];
}): "MANUAL" | "SS_PERFORMANCE" | undefined => {
  const trialReel = input.trialReel === true;
  const value = input.graduationStrategy;
  if (!trialReel) {
    if (value !== undefined) {
      throw new CliError({
        code: "TRIAL_REEL_REQUIRED",
        message: "--graduation-strategy requires --trial-reel",
        exitCode: 2,
      });
    }
    return undefined;
  }

  if (splitValues(input.mediaSources).length !== 1) {
    throw new CliError({
      code: "TRIAL_REEL_MEDIA_REQUIRED",
      message: "--trial-reel requires exactly one video via --media",
      exitCode: 2,
    });
  }
  rejectObviousImageSource(splitValues(input.mediaSources)[0] as string);

  const normalized = value?.trim().toLowerCase() ?? "manual";
  if (normalized === "manual") {
    return "MANUAL";
  }
  if (
    normalized === "performance" ||
    normalized === "ss-performance" ||
    normalized === "ss_performance"
  ) {
    return "SS_PERFORMANCE";
  }
  throw new CliError({
    code: "INVALID_GRADUATION_STRATEGY",
    message: "--graduation-strategy must be manual or performance",
    exitCode: 2,
  });
};

const replyRestrictions = ["everyone", "following", "mentioned"] as const;

/** Parses the X flags of `delulu post` without network access. */
export const parseTwitterOptions = (input: {
  readonly quote?: string;
  readonly replies?: string;
  readonly article?: string;
}): TwitterPostOptions | undefined => {
  const replies = input.replies?.trim().toLowerCase();
  const replyRestriction = replyRestrictions.find((value) => value === replies);
  if (replies !== undefined && replyRestriction === undefined) {
    throw new CliError({
      code: "INVALID_X_OPTIONS",
      message: "--replies must be everyone, following, or mentioned",
      exitCode: 2,
    });
  }
  const options: TwitterPostOptions = {
    replyRestriction,
    quotePost: input.quote,
    articleTitle: input.article,
  };
  return Object.values(options).some((value) => value !== undefined)
    ? options
    : undefined;
};

const withTwitterOptions = (
  connections: readonly PostConnectionInput[],
  options: TwitterPostOptions | undefined
) => {
  try {
    return applyTwitterPostOptions(connections, options);
  } catch (cause) {
    throw new CliError({
      code: "INVALID_X_OPTIONS",
      message: cause instanceof Error ? cause.message : String(cause),
      exitCode: 2,
      next: ["delulu accounts"],
    });
  }
};

export const splitValues = (values: readonly string[] = []) =>
  values
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);

export const canonicalAccountSelector = (
  account: Pick<PostAccount, "id" | "platform">
) => `${account.platform.toLowerCase()}:${account.id}`;

export const resolveAccounts = (
  accounts: readonly PostAccount[],
  selectors: readonly string[]
) => {
  const values = splitValues(selectors);
  if (values.length === 0) {
    throw new CliError({
      code: "ACCOUNT_REQUIRED",
      message: `Choose an account with --to. Available: ${accounts.map(canonicalAccountSelector).join(", ") || "none"}`,
      exitCode: 2,
      next: ["delulu accounts"],
    });
  }

  const selected = values.map((selector) => {
    const normalized = selector.toLowerCase();
    const separator = selector.indexOf(":");
    const selectorPlatform =
      separator > 0 ? selector.slice(0, separator).toLowerCase() : undefined;
    const selectorConnectionId =
      separator > 0 ? selector.slice(separator + 1) : undefined;
    const matches = accounts.filter((account) => {
      const platform = account.platform.toLowerCase();
      const username = account.username?.toLowerCase();
      return (
        account.id === selector ||
        (selectorPlatform === platform &&
          selectorConnectionId === account.id) ||
        platform === normalized ||
        username === normalized ||
        (username !== undefined && `${platform}@${username}` === normalized)
      );
    });
    if (matches.length === 0) {
      throw new CliError({
        code: "ACCOUNT_NOT_FOUND",
        message: `Account ${selector} was not found. Available: ${accounts.map(canonicalAccountSelector).join(", ") || "none"}`,
        exitCode: 2,
        next: ["delulu accounts"],
      });
    }
    if (matches.length > 1) {
      throw new CliError({
        code: "ACCOUNT_AMBIGUOUS",
        message: `Account ${selector} is ambiguous. Use one of: ${matches.map(canonicalAccountSelector).join(", ")}`,
        exitCode: 2,
        next: ["delulu accounts"],
      });
    }
    return matches[0] as PostAccount;
  });
  return [
    ...new Map(selected.map((account) => [account.id, account])).values(),
  ];
};

const terminalPublishStatuses = new Set([
  "published",
  "partially_failed",
  "failed",
]);

export const waitForPostTerminal = async <Result extends PostFlowResult>(
  initial: Result,
  input: {
    readonly get: (id: string) => Promise<Result>;
    readonly sleep: (milliseconds: number) => Promise<void>;
    readonly now: () => number;
    readonly timeoutMs?: number;
    readonly pollIntervalMs?: number;
  }
) => {
  let result = initial;
  const deadline = input.now() + (input.timeoutMs ?? 6 * 60_000);
  while (
    !terminalPublishStatuses.has(result.status) &&
    input.now() < deadline
  ) {
    await input.sleep(input.pollIntervalMs ?? 2000);
    result = await input.get(result.id);
  }
  if (!terminalPublishStatuses.has(result.status)) {
    throw new CliError({
      code: "PUBLISH_TIMEOUT",
      message: "Publishing was accepted but did not finish before the timeout",
      exitCode: 9,
      retryable: true,
      details: { postId: result.id, state: result.status },
      next: [`delulu show ${result.id}`],
    });
  }
  if (result.status === "failed" || result.status === "partially_failed") {
    throw new CliError({
      code: "PUBLISH_PARTIAL_FAILURE",
      message: "One or more publishing targets failed",
      exitCode: 8,
      retryable: true,
      details: { postId: result.id, state: result.status },
      next: [`delulu show ${result.id}`, `delulu retry ${result.id}`],
    });
  }
  return result;
};

export const submitPost = async (
  input: SubmitPostInput,
  adapter: PostFlowAdapter
): Promise<PostFlowResult> => {
  const trialReel = input.trialReel === true;
  const resolvedGraduationStrategy = validateTrialReelOptions(input);
  if (!input.caption.trim()) {
    throw new CliError({
      code: "CONTENT_REQUIRED",
      message: "Caption cannot be empty",
      exitCode: 2,
    });
  }
  const scheduleMilliseconds = input.scheduledAt
    ? Date.parse(input.scheduledAt)
    : undefined;
  if (
    scheduleMilliseconds !== undefined &&
    !Number.isFinite(scheduleMilliseconds)
  ) {
    throw new CliError({
      code: "INVALID_SCHEDULE",
      message: "--at must be a valid ISO 8601 timestamp",
      exitCode: 2,
    });
  }
  const scheduledAt =
    scheduleMilliseconds === undefined
      ? null
      : new Date(scheduleMilliseconds).toISOString();
  if (input.intent === "schedule" && scheduledAt === null) {
    throw new Error("Scheduled posts require --at with an ISO 8601 timestamp");
  }
  if (input.intent !== "schedule" && scheduledAt !== null) {
    throw new Error("--at cannot be combined with draft or publish-now intent");
  }

  const accounts = resolveAccounts(
    await adapter.listAccounts(),
    input.accountSelectors ?? []
  );
  validateTrialReelTargets(trialReel, accounts);
  const baseConnections = accounts.map((account): PostConnectionInput => {
    const connection = { id: account.id, platform: account.platform };
    if (!trialReel || account.platform.toUpperCase() !== "INSTAGRAM") {
      return connection;
    }
    return {
      ...connection,
      settings: {
        platform: "INSTAGRAM",
        values: {
          shareToFeed: true,
          shareToStory: false,
          trialReels: true,
          graduationStrategy: resolvedGraduationStrategy ?? "MANUAL",
        },
      },
    };
  });
  const connections = withTwitterOptions(baseConnections, input.twitter);
  const media = await Promise.all(
    splitValues(input.mediaSources).map((source) =>
      adapter.addMedia(source, input.altText)
    )
  );
  if (media[0]) {
    validateTrialReelMedia(trialReel, media[0]);
  }
  const result = await adapter.create({
    caption: input.caption,
    connections,
    mediaIds: media.map((item) => item.id),
    intent: input.intent,
    idempotencyKey: input.idempotencyKey,
    scheduledAt,
    privacy: input.privacy,
  });

  if (input.intent !== "publish_now" || input.waitForTerminal === false) {
    return result;
  }
  if (result.status === "draft") {
    throw new CliError({
      code: "ATOMIC_PUBLISH_REJECTED",
      message:
        "The server did not accept atomic publishing. The post remains a draft and was not retried.",
      exitCode: 6,
    });
  }

  return waitForPostTerminal(result, {
    get: adapter.get,
    sleep: adapter.sleep,
    now: adapter.now,
    timeoutMs: input.timeoutMs,
    pollIntervalMs: input.pollIntervalMs,
  });
};
