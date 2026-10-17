import {
  type ConnectionClient,
  type ConnectionReturnTarget,
  ConnectionStore,
  type ConnectionUpsertInput,
  type ConnectionUpsertResult,
  callbackRedirect,
  connectFacebookPage,
  connectLinkedInTarget,
  ensureFreshToken,
  getConnection,
  isConnectionError,
  type LinkedInTarget,
  listStoredLinkedInTargets,
  networkError,
  type PlatformMediaPage,
  type PublishableSocialType,
  type SocialProviderTokens,
  type TikTokCreatorInfo,
  withConnectionClient,
  withConnectionReturnTarget,
  withConnectionSuccess,
} from "@delulu/connections";
import {
  ConflictError,
  type ConnectionView,
  NotFoundError,
  ProviderUnavailableError,
} from "@delulu/contracts";
import {
  type AuthContext,
  ConnectionId,
  makeId,
  TokenCipher,
  type WorkspaceId,
} from "@delulu/core";
import { makePostgresConnectionStore } from "@delulu/db";
import { Context, Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { AutomationKvNamespace } from "./automation-kv";
import { LifecycleService } from "./lifecycle";

type ConnectionOutput = typeof ConnectionView.Type;
const BASE64_PADDING = /=+$/;
const connectionPrincipal = (auth: AuthContext): string =>
  auth.apiKeyId ? `k:${auth.apiKeyId}` : `u:${auth.userId}`;

export class ConnectionStateConfig extends Context.Service<
  ConnectionStateConfig,
  { readonly secret: string }
>()("@delulu/services/ConnectionStateConfig") {}

export interface VerifiedConnectionState {
  readonly workspaceId: string;
  readonly principal: string;
  readonly nonce: string;
  readonly issuedAt: number;
  readonly client?: ConnectionClient;
  readonly returnTarget?: ConnectionReturnTarget;
}

export interface VerifiedConnectionTransfer {
  readonly connectionId: string;
  readonly sourceWorkspaceId: string;
  readonly destinationWorkspaceId: string;
  readonly principal: string;
  readonly nonce: string;
  readonly issuedAt: number;
}

const base64Url = (bytes: Uint8Array): string => {
  let value = "";
  for (const byte of bytes) {
    value += String.fromCharCode(byte);
  }
  return btoa(value)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(BASE64_PADDING, "");
};
const encodeText = (value: string): string =>
  base64Url(new TextEncoder().encode(value));
const decodeText = (value: string): string => {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "="
  );
  const decoded = atob(padded);
  return new TextDecoder().decode(
    Uint8Array.from(decoded, (character) => character.charCodeAt(0))
  );
};
const ConnectionStatePayload = Schema.Struct({
  version: Schema.Literal(2),
  workspaceId: Schema.String,
  principal: Schema.String,
  nonce: Schema.String,
  issuedAt: Schema.Number,
  client: Schema.optional(Schema.Literals(["cli", "mcp"])),
  returnTarget: Schema.optional(
    Schema.Literals(["socials", "onboarding-connect"])
  ),
});
const ConnectionTransferPayload = Schema.Struct({
  version: Schema.Literal(1),
  connectionId: Schema.String,
  sourceWorkspaceId: Schema.String,
  destinationWorkspaceId: Schema.String,
  principal: Schema.String,
  nonce: Schema.String,
  issuedAt: Schema.Number,
});
const sign = async (secret: string, value: string): Promise<string> => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value)
  );
  return base64Url(new Uint8Array(digest).slice(0, 16));
};
const equal = (left: string, right: string): boolean => {
  if (left.length !== right.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.length; index++) {
    // biome-ignore lint/suspicious/noBitwiseOperators: constant-time comparison
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
};

export class ConnectionStateService extends Context.Service<
  ConnectionStateService,
  {
    readonly mint: (
      workspaceId: string,
      auth: AuthContext,
      client?: ConnectionClient,
      returnTarget?: ConnectionReturnTarget
    ) => Effect.Effect<string, ConflictError>;
    readonly verify: (
      state: string
    ) => Effect.Effect<VerifiedConnectionState, ConflictError>;
    readonly mintTransfer: (
      input: Omit<VerifiedConnectionTransfer, "nonce" | "issuedAt">
    ) => Effect.Effect<string, ConflictError>;
    readonly verifyTransfer: (
      token: string
    ) => Effect.Effect<VerifiedConnectionTransfer, ConflictError>;
  }
>()("@delulu/services/ConnectionStateService") {
  static readonly layer = Layer.effect(
    ConnectionStateService,
    Effect.gen(function* () {
      const config = yield* ConnectionStateConfig;
      const mint = (
        workspaceId: string,
        auth: AuthContext,
        client?: ConnectionClient,
        returnTarget?: ConnectionReturnTarget
      ) =>
        Effect.tryPromise({
          try: async () => {
            if (!config.secret) {
              throw new Error("missing secret");
            }
            const principal = connectionPrincipal(auth);
            const nonce = base64Url(crypto.getRandomValues(new Uint8Array(16)));
            const issuedAt = Math.floor(Date.now() / 1000);
            const payload = encodeText(
              JSON.stringify({
                version: 2,
                workspaceId,
                principal,
                nonce,
                issuedAt,
                ...(client ? { client } : {}),
                ...(returnTarget ? { returnTarget } : {}),
              })
            );
            const value = `v2.${payload}`;
            return `${value}.${await sign(config.secret, value)}`;
          },
          catch: () =>
            new ConflictError({
              message: "Connection state signing is unavailable",
              resource: "connection",
            }),
        });
      const verify = (state: string) =>
        Effect.tryPromise({
          try: async () => {
            const parts = state.split(".");
            if (parts[0] === "v2") {
              if (parts.length !== 3) {
                throw new Error("bad state");
              }
              const value = parts.slice(0, 2).join(".");
              const expected = await sign(config.secret, value);
              const signature = parts[2] ?? "";
              if (!equal(signature, expected)) {
                throw new Error("expired or invalid state");
              }
              const payload = Schema.decodeUnknownSync(ConnectionStatePayload)(
                JSON.parse(decodeText(parts[1] ?? ""))
              );
              if (Math.abs(Date.now() / 1000 - payload.issuedAt) > 600) {
                throw new Error("expired or invalid state");
              }
              return {
                workspaceId: payload.workspaceId,
                principal: payload.principal,
                nonce: payload.nonce,
                issuedAt: payload.issuedAt,
                client: payload.client,
                returnTarget: payload.returnTarget,
              };
            }
            if (!(parts.length === 5 || parts.length === 6)) {
              throw new Error("bad legacy state");
            }
            const [workspaceId, principal, nonce, issued] = parts as [
              string,
              string,
              string,
              string,
            ];
            const client = parts.length === 6 ? parts[4] : undefined;
            const signature = parts.at(-1) ?? "";
            if (client && !(client === "cli" || client === "mcp")) {
              throw new Error("bad client");
            }
            const value = client
              ? `${workspaceId}.${principal}.${nonce}.${issued}.${client}`
              : `${workspaceId}.${principal}.${nonce}.${issued}`;
            const expected = await sign(config.secret, value);
            const issuedAt = Number(issued);
            if (
              !(equal(signature, expected) && Number.isFinite(issuedAt)) ||
              Math.abs(Date.now() / 1000 - issuedAt) > 600
            ) {
              throw new Error("expired or invalid state");
            }
            return {
              workspaceId,
              principal,
              nonce,
              issuedAt,
              client: client as ConnectionClient | undefined,
            };
          },
          catch: () =>
            new ConflictError({
              message: "Connection state is invalid or expired",
              resource: "connection",
            }),
        });
      const mintTransfer = (
        input: Omit<VerifiedConnectionTransfer, "nonce" | "issuedAt">
      ) =>
        Effect.tryPromise({
          try: async () => {
            if (!config.secret) {
              throw new Error("missing secret");
            }
            const payload = encodeText(
              JSON.stringify({
                version: 1,
                ...input,
                nonce: base64Url(crypto.getRandomValues(new Uint8Array(16))),
                issuedAt: Math.floor(Date.now() / 1000),
              })
            );
            const value = `transfer.v1.${payload}`;
            return `${value}.${await sign(config.secret, value)}`;
          },
          catch: () =>
            new ConflictError({
              message: "Connection transfer signing is unavailable",
              resource: "connection",
            }),
        });
      const verifyTransfer = (token: string) =>
        Effect.tryPromise({
          try: async () => {
            const parts = token.split(".");
            if (
              !(
                parts.length === 4 &&
                parts[0] === "transfer" &&
                parts[1] === "v1"
              )
            ) {
              throw new Error("bad transfer token");
            }
            const value = parts.slice(0, 3).join(".");
            const expected = await sign(config.secret, value);
            if (!equal(parts[3] ?? "", expected)) {
              throw new Error("invalid transfer token");
            }
            const payload = Schema.decodeUnknownSync(ConnectionTransferPayload)(
              JSON.parse(decodeText(parts[2] ?? ""))
            );
            if (Math.abs(Date.now() / 1000 - payload.issuedAt) > 600) {
              throw new Error("expired transfer token");
            }
            return payload;
          },
          catch: () =>
            new ConflictError({
              message: "Connection transfer is invalid or expired",
              resource: "connection",
            }),
        });
      return ConnectionStateService.of({
        mint,
        verify,
        mintTransfer,
        verifyTransfer,
      });
    })
  );
}

const toIso = (value: unknown): string | null =>
  value === null || value === undefined
    ? null
    : new Date(value as Date | string).toISOString();

const toOutput = (row: Record<string, unknown>): ConnectionOutput => {
  // `expires_at` is the short-lived access-token expiry. When a connection can
  // be renewed without the user re-authenticating — an OAuth refresh token, or
  // a self-refreshing long-lived token that records its refresh window in
  // `metadata.refreshTokenExpiresIn` — the real re-auth deadline is when that
  // renewal capability lapses, not when the access token does. Surfacing the
  // effective deadline is what makes YouTube (hourly access token, durable
  // refresh token) read as "no expiry" instead of "expires in an hour", and
  // keeps it visually distinct from LinkedIn (no refresh, genuine ~60d expiry).
  const refreshExpiresMs =
    row.refreshExpiresAt === null || row.refreshExpiresAt === undefined
      ? null
      : Number(row.refreshExpiresAt);
  const refreshable = row.hasRefresh === true || refreshExpiresMs !== null;
  const expiresAt = refreshable
    ? refreshExpiresMs && Number.isFinite(refreshExpiresMs)
      ? new Date(refreshExpiresMs).toISOString()
      : null
    : toIso(row.expiresAt);
  return {
    id: String(row.id),
    platform: String(row.platform),
    profileId: String(row.profileId),
    username: row.username === null ? null : String(row.username),
    displayName: row.displayName === null ? null : String(row.displayName),
    profileImage:
      row.profileImage === null || row.profileImage === undefined
        ? null
        : String(row.profileImage),
    expiresAt,
    accountType:
      row.accountType === "member" || row.accountType === "organization"
        ? row.accountType
        : null,
  };
};

export class ConnectionsService extends Context.Service<
  ConnectionsService,
  {
    readonly list: (
      workspaceId: WorkspaceId,
      limit: number,
      offset: number
    ) => Effect.Effect<{
      data: readonly ConnectionOutput[];
      total: number;
      limit: number;
      offset: number;
    }>;
    readonly remove: (
      workspaceId: WorkspaceId,
      id: string
    ) => Effect.Effect<void, NotFoundError>;
    readonly listMedia: (input: {
      readonly workspaceId: WorkspaceId;
      readonly connectionId: string;
      readonly kind: "posts" | "stories";
      readonly limit: number;
      readonly after?: string;
    }) => Effect.Effect<
      PlatformMediaPage,
      NotFoundError | ConflictError | ProviderUnavailableError
    >;
    readonly getTikTokCreatorInfo: (input: {
      readonly workspaceId: WorkspaceId;
      readonly connectionId: string;
    }) => Effect.Effect<
      TikTokCreatorInfo,
      NotFoundError | ConflictError | ProviderUnavailableError
    >;
    readonly mint: (
      workspaceId: WorkspaceId,
      platform: string,
      auth: AuthContext,
      includeInsights?: boolean,
      client?: ConnectionClient,
      returnTarget?: ConnectionReturnTarget
    ) => Effect.Effect<
      { url: string; expiresIn: number },
      ConflictError | NotFoundError
    >;
    readonly upsertFromOAuth: (
      workspaceId: WorkspaceId,
      input: ConnectionUpsertInput,
      principal?: string
    ) => Effect.Effect<ConnectionUpsertResult, ConflictError>;
    readonly handleCallback: (input: {
      readonly platform: string;
      readonly code: string | null;
      readonly error: string | null;
      readonly errorReason: string | null;
      readonly state: string;
    }) => Effect.Effect<Response, ConflictError | NotFoundError>;
    readonly confirmTransfer: (input: {
      readonly connectionId: string;
      readonly sourceWorkspaceId: WorkspaceId;
      readonly destinationWorkspaceId: WorkspaceId;
    }) => Effect.Effect<void, ConflictError | NotFoundError>;
    readonly confirmOAuthTransfer: (input: {
      readonly connectionId: string;
      readonly destinationWorkspaceId: WorkspaceId;
      readonly auth: AuthContext;
      readonly transferToken: string;
    }) => Effect.Effect<void, ConflictError | NotFoundError>;
    readonly completeFacebook: (input: {
      readonly state: string;
      readonly code: string;
      readonly pageId: string;
      readonly pageName: string;
    }) => Effect.Effect<
      | { readonly status: "connected" }
      | {
          readonly status: "transfer_required";
          readonly connectionId: string;
          readonly sourceWorkspaceId: string;
          readonly transferToken?: string;
        },
      ConflictError
    >;
    readonly listLinkedInTargets: (input: {
      readonly state: string;
      readonly selectionId: string;
    }) => Effect.Effect<readonly LinkedInTarget[], ConflictError>;
    readonly completeLinkedIn: (input: {
      readonly state: string;
      readonly selectionId: string;
      readonly targetId: string;
    }) => Effect.Effect<
      (ConnectionUpsertResult & {
        readonly name: string;
        readonly profileId: string;
      }) & {
        readonly client?: ConnectionClient;
        readonly returnTarget?: ConnectionReturnTarget;
      },
      ConflictError
    >;
  }
>()("@delulu/services/ConnectionsService") {
  static readonly layer = Layer.effect(
    ConnectionsService,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const lifecycle = yield* LifecycleService;
      const states = yield* ConnectionStateService;
      const cipher = yield* TokenCipher;
      const temporaryStore = yield* AutomationKvNamespace;
      const tokenStore = Layer.succeed(
        ConnectionStore,
        yield* makePostgresConnectionStore
      );
      const list = Effect.fn("ConnectionsService.list")(function* (
        workspaceId: WorkspaceId,
        limit: number,
        offset: number
      ) {
        const rows = yield* sql<
          Record<string, unknown>
        >`SELECT id, platform, profile_id, username, display_name,
            metadata->>'profileImage' AS profile_image, expires_at,
            metadata->>'linkedinTargetType' AS account_type,
            (refresh_token IS NOT NULL) AS has_refresh,
            metadata->>'refreshTokenExpiresIn' AS refresh_expires_at
          FROM active_connections WHERE workspace_id = ${workspaceId} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`.pipe(
          Effect.orDie
        );
        const totals = yield* sql<{
          count: string;
        }>`SELECT count(*)::text AS count FROM active_connections WHERE workspace_id = ${workspaceId}`.pipe(
          Effect.orDie
        );
        return {
          data: rows.map(toOutput),
          total: Number(totals[0]?.count ?? 0),
          limit,
          offset,
        };
      });
      const remove = Effect.fn("ConnectionsService.remove")(function* (
        workspaceId: WorkspaceId,
        id: string
      ) {
        const rows = yield* sql<{
          id: string;
        }>`UPDATE connections SET disconnected_at = COALESCE(disconnected_at, now()),
          access_token = '', refresh_token = NULL, expires_at = NULL
          WHERE id = ${id} AND workspace_id = ${workspaceId} RETURNING id`.pipe(
          Effect.orDie
        );
        if (rows.length === 0) {
          return yield* new NotFoundError({
            message: "Connection not found",
            resource: "connection",
          });
        }
        yield* lifecycle.syncWorkspace({
          workspaceId,
          event: "social_account_disconnected",
          idempotencyKey: `connection-deleted:${id}`,
        });
      });
      const listMedia = Effect.fn("ConnectionsService.listMedia")(
        function* (input: {
          readonly workspaceId: WorkspaceId;
          readonly connectionId: string;
          readonly kind: "posts" | "stories";
          readonly limit: number;
          readonly after?: string;
        }) {
          const rows = yield* sql<{
            platform: string;
            profileId: string;
            accessToken: string;
            cipherVersion: "v1";
          }>`SELECT platform, profile_id, access_token, cipher_version
            FROM active_connections
            WHERE id = ${input.connectionId}
              AND workspace_id = ${input.workspaceId}`.pipe(
            Effect.mapError(
              () =>
                new ProviderUnavailableError({
                  message: "Unable to load the Instagram connection",
                  provider: "Instagram",
                  retryable: true,
                })
            )
          );
          const row = rows[0];
          if (!row) {
            return yield* new NotFoundError({
              message: "Connection not found",
              resource: "connection",
            });
          }
          if (row.platform !== "INSTAGRAM") {
            return yield* new ConflictError({
              message: "DM automation media is available for Instagram only",
              resource: "connection",
            });
          }
          const connection = getConnection(
            row.platform as PublishableSocialType
          );
          const query =
            input.kind === "stories"
              ? connection.queries?.getStories
              : connection.queries?.getPosts;
          if (!query) {
            return yield* new ConflictError({
              message: "This connection does not support automation media",
              resource: "connection",
            });
          }
          const accessToken = yield* cipher
            .decrypt({
              ciphertext: row.accessToken,
              cipherVersion: row.cipherVersion,
            })
            .pipe(
              Effect.mapError(
                () =>
                  new ProviderUnavailableError({
                    message: "Unable to decrypt the Instagram credential",
                    provider: "Instagram",
                    retryable: false,
                  })
              )
            );
          return (yield* query({
            profileId: row.profileId,
            accessToken,
            limit: input.limit,
            after: input.after,
          }).pipe(
            Effect.mapError(
              (error) =>
                new ProviderUnavailableError({
                  message: error.message,
                  provider: error.provider,
                  retryable: error.retryable,
                })
            )
          )) as PlatformMediaPage;
        }
      );
      const getTikTokCreatorInfo = Effect.fn(
        "ConnectionsService.getTikTokCreatorInfo"
      )(function* (input: {
        readonly workspaceId: WorkspaceId;
        readonly connectionId: string;
      }) {
        const rows = yield* sql<{
          platform: string;
          profileId: string;
        }>`SELECT platform, profile_id FROM active_connections
          WHERE id = ${input.connectionId}
            AND workspace_id = ${input.workspaceId}`.pipe(Effect.orDie);
        const row = rows[0];
        if (!row) {
          return yield* new NotFoundError({
            message: "Connection not found",
            resource: "connection",
          });
        }
        if (row.platform !== "TIKTOK") {
          return yield* new ConflictError({
            message: "Creator settings are available for TikTok only",
            resource: "connection",
          });
        }
        const query = getConnection("TIKTOK").queries?.getCreatorInfo;
        if (!query) {
          return yield* new ConflictError({
            message: "TikTok creator settings are unavailable",
            resource: "connection",
          });
        }
        const accessToken = yield* ensureFreshToken(input.connectionId).pipe(
          Effect.provide(tokenStore),
          Effect.mapError(
            (error) =>
              new ProviderUnavailableError({
                message: error.message,
                provider: error.provider,
                retryable: error.retryable,
              })
          )
        );
        return (yield* query({
          profileId: row.profileId,
          accessToken,
        }).pipe(
          Effect.mapError(
            (error) =>
              new ProviderUnavailableError({
                message: error.message,
                provider: error.provider,
                retryable: error.retryable,
              })
          )
        )) as TikTokCreatorInfo;
      });
      const mint = Effect.fn("ConnectionsService.mint")(function* (
        workspaceId: WorkspaceId,
        platform: string,
        auth: AuthContext,
        includeInsights?: boolean,
        client?: ConnectionClient,
        returnTarget?: ConnectionReturnTarget
      ) {
        let connection: ReturnType<typeof getConnection>;
        try {
          connection = getConnection(
            platform.toUpperCase() as Parameters<typeof getConnection>[0]
          );
        } catch {
          return yield* new NotFoundError({
            message: "Platform not found",
            resource: "platform",
          });
        }
        const state = yield* states.mint(
          workspaceId,
          auth,
          client,
          returnTarget
        );
        const url = yield* Effect.tryPromise({
          try: () =>
            Promise.resolve(
              connection.auth.getConnectUrl({
                state,
                includeInsights,
                temporaryStore,
              })
            ),
          catch: () =>
            new ConflictError({
              message: "Unable to initialize provider authorization",
              resource: "connection",
            }),
        });
        return {
          url,
          expiresIn: 600,
        };
      });
      const upsertFromOAuth = Effect.fn("ConnectionsService.upsertFromOAuth")(
        function* (
          workspaceId: WorkspaceId,
          input: ConnectionUpsertInput,
          principal?: string
        ) {
          const existing = yield* sql<
            Record<string, unknown>
          >`SELECT id, workspace_id FROM connections
          WHERE platform = ${input.socialType} AND profile_id = ${input.profileId}`.pipe(
            Effect.orDie
          );
          const row = existing[0];
          const access = yield* cipher.encrypt(input.accessToken).pipe(
            Effect.mapError(
              () =>
                new ConflictError({
                  message: "Unable to encrypt connection token",
                  resource: "connection",
                })
            )
          );
          const refresh = input.refreshToken
            ? yield* cipher.encrypt(input.refreshToken).pipe(
                Effect.mapError(
                  () =>
                    new ConflictError({
                      message: "Unable to encrypt refresh token",
                      resource: "connection",
                    })
                )
              )
            : null;
          const metadata = {
            profileImage: input.profileImage,
            refreshTokenExpiresIn: input.refreshTokenExpiresIn,
            ...input.metadata,
          };
          if (row) {
            const sourceWorkspaceId = String(row.workspaceId);
            yield* sql`UPDATE connections SET access_token = ${access.ciphertext},
            refresh_token = ${refresh?.ciphertext ?? null}, expires_at = ${input.expiresIn ? new Date(input.expiresIn) : null},
            username = ${input.username ?? null}, display_name = ${input.fullName ?? null},
            metadata = ${JSON.stringify(metadata)}::jsonb,
            disconnected_at = CASE WHEN workspace_id = ${workspaceId} THEN NULL ELSE disconnected_at END
            WHERE id = ${String(row.id)}`.pipe(Effect.orDie);
            if (sourceWorkspaceId !== workspaceId) {
              const transferToken = principal
                ? yield* states.mintTransfer({
                    connectionId: String(row.id),
                    sourceWorkspaceId,
                    destinationWorkspaceId: workspaceId,
                    principal,
                  })
                : undefined;
              return {
                status: "transfer_required",
                connectionId: String(row.id),
                sourceWorkspaceId,
                ...(transferToken ? { transferToken } : {}),
              } as const;
            }
            yield* lifecycle.syncWorkspace({ workspaceId });
            return { status: "updated" } as const;
          }
          yield* sql`INSERT INTO connections
          (id, workspace_id, platform, profile_id, username, display_name, access_token, refresh_token,
           cipher_version, expires_at, metadata)
          VALUES (${makeId(ConnectionId)}, ${workspaceId}, ${input.socialType}, ${input.profileId},
            ${input.username ?? null}, ${input.fullName ?? null}, ${access.ciphertext}, ${refresh?.ciphertext ?? null},
            'v1', ${input.expiresIn ? new Date(input.expiresIn) : null}, ${JSON.stringify(metadata)}::jsonb)`.pipe(
            Effect.orDie
          );
          yield* lifecycle.syncWorkspace({
            workspaceId,
            event:
              input.socialType.toLowerCase() === "instagram"
                ? "instagram_connected"
                : "social_account_connected",
            idempotencyKey: `connection-created:${input.socialType}:${input.profileId}`,
          });
          return { status: "created" } as const;
        }
      );
      const handleCallback = Effect.fn("ConnectionsService.handleCallback")(
        function* (input: {
          readonly platform: string;
          readonly code: string | null;
          readonly error: string | null;
          readonly errorReason: string | null;
          readonly state: string;
        }) {
          const verified = yield* states.verify(input.state);
          let connection: ReturnType<typeof getConnection>;
          try {
            connection = getConnection(
              input.platform.toUpperCase() as Parameters<
                typeof getConnection
              >[0]
            );
          } catch {
            return yield* new NotFoundError({
              message: "Platform not found",
              resource: "platform",
            });
          }
          return yield* Effect.tryPromise({
            try: async () => {
              let connected:
                | {
                    readonly provider: string;
                    readonly profileId: string;
                    readonly username: string;
                  }
                | undefined;
              let response: Response;
              try {
                response = await connection.auth.handleCallback({
                  tokenCipher: cipher,
                  code: input.code,
                  error: input.error,
                  errorReason: input.errorReason,
                  state: input.state,
                  userId: verified.principal,
                  temporaryStore,
                  upsert: async (value) => {
                    const status = await Effect.runPromise(
                      upsertFromOAuth(
                        verified.workspaceId as WorkspaceId,
                        value,
                        verified.principal
                      )
                    );
                    if (status.status !== "transfer_required") {
                      connected = {
                        provider: value.socialType,
                        profileId: value.profileId,
                        username:
                          value.username ?? value.fullName ?? value.profileId,
                      };
                    }
                    return status;
                  },
                });
              } catch {
                response = callbackRedirect(
                  `/socials?error=server_error&provider=${encodeURIComponent(
                    input.platform.toLowerCase()
                  )}`
                );
              }
              const clientResponse = withConnectionClient(
                response,
                verified.client
              );
              const completedResponse = connected
                ? withConnectionSuccess(clientResponse, {
                    ...connected,
                    client: verified.client,
                  })
                : clientResponse;
              return withConnectionReturnTarget(
                completedResponse,
                verified.returnTarget
              );
            },
            catch: () =>
              new ConflictError({
                message: "Connection callback failed",
                resource: "connection",
              }),
          });
        }
      );
      const confirmTransfer = Effect.fn("ConnectionsService.confirmTransfer")(
        function* (input: {
          readonly connectionId: string;
          readonly sourceWorkspaceId: WorkspaceId;
          readonly destinationWorkspaceId: WorkspaceId;
        }) {
          const rows = yield* sql<{ id: string }>`UPDATE connections
          SET workspace_id = ${input.destinationWorkspaceId}, disconnected_at = NULL
          WHERE id = ${input.connectionId} AND workspace_id = ${input.sourceWorkspaceId}
            AND access_token <> ''
          RETURNING id`.pipe(Effect.orDie);
          if (rows.length === 0) {
            const source = yield* sql<{ id: string }>`SELECT id FROM connections
              WHERE CURRENT_TIMESTAMP IS NOT NULL AND id = ${input.connectionId}
                AND workspace_id = ${input.sourceWorkspaceId}`.pipe(
              Effect.orDie
            );
            if (source.length > 0) {
              return yield* new ConflictError({
                message:
                  "Connection credentials were cleared. Restart authorization to transfer this account.",
                resource: "connection",
              });
            }
            return yield* new NotFoundError({
              message: "Source connection not found",
              resource: "connection",
            });
          }
        }
      );
      const confirmOAuthTransfer = Effect.fn(
        "ConnectionsService.confirmOAuthTransfer"
      )(function* (input: {
        readonly connectionId: string;
        readonly destinationWorkspaceId: WorkspaceId;
        readonly auth: AuthContext;
        readonly transferToken: string;
      }) {
        const verified = yield* states.verifyTransfer(input.transferToken);
        if (
          !(
            verified.connectionId === input.connectionId &&
            verified.destinationWorkspaceId === input.destinationWorkspaceId &&
            verified.principal === connectionPrincipal(input.auth)
          )
        ) {
          return yield* new ConflictError({
            message: "Connection transfer does not match this request",
            resource: "connection",
          });
        }
        yield* confirmTransfer({
          connectionId: input.connectionId,
          sourceWorkspaceId: verified.sourceWorkspaceId as WorkspaceId,
          destinationWorkspaceId: input.destinationWorkspaceId,
        });
      });
      const completeFacebook = Effect.fn("ConnectionsService.completeFacebook")(
        function* (input: {
          state: string;
          code: string;
          pageId: string;
          pageName: string;
        }) {
          const verified = yield* states.verify(input.state);
          return yield* Effect.tryPromise({
            try: () =>
              connectFacebookPage({
                code: input.code,
                pageId: input.pageId,
                pageName: input.pageName,
                externalId: verified.principal,
                temporaryStore,
                upsert: (value) =>
                  Effect.runPromise(
                    upsertFromOAuth(
                      verified.workspaceId as WorkspaceId,
                      value,
                      verified.principal
                    )
                  ),
              }),
            catch: () =>
              new ConflictError({
                message: "Facebook page connection failed",
                resource: "connection",
              }),
          });
        }
      );
      const listLinkedInTargets = Effect.fn(
        "ConnectionsService.listLinkedInTargets"
      )(function* (input: { state: string; selectionId: string }) {
        const verified = yield* states.verify(input.state);
        return yield* Effect.tryPromise({
          try: () =>
            listStoredLinkedInTargets({
              cipher,
              userId: verified.principal,
              selectionId: input.selectionId,
              temporaryStore,
            }),
          catch: () =>
            new ConflictError({
              message: "LinkedIn account selection expired",
              resource: "connection",
            }),
        });
      });
      const completeLinkedIn = Effect.fn("ConnectionsService.completeLinkedIn")(
        function* (input: {
          state: string;
          selectionId: string;
          targetId: string;
        }) {
          const verified = yield* states.verify(input.state);
          const result = yield* Effect.tryPromise({
            try: () =>
              connectLinkedInTarget({
                cipher,
                userId: verified.principal,
                selectionId: input.selectionId,
                targetId: input.targetId,
                temporaryStore,
                upsert: (value) =>
                  Effect.runPromise(
                    upsertFromOAuth(
                      verified.workspaceId as WorkspaceId,
                      value,
                      verified.principal
                    )
                  ),
              }),
            catch: () =>
              new ConflictError({
                message: "LinkedIn account connection failed",
                resource: "connection",
              }),
          });
          return {
            ...result,
            client: verified.client,
            returnTarget: verified.returnTarget,
          };
        }
      );
      return ConnectionsService.of({
        list,
        listMedia,
        getTikTokCreatorInfo,
        remove,
        mint,
        upsertFromOAuth,
        handleCallback,
        confirmTransfer,
        confirmOAuthTransfer,
        completeFacebook,
        listLinkedInTargets,
        completeLinkedIn,
      });
    })
  );
}
