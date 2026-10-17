import {
  ConnectionStore,
  isConnectionError,
  networkError,
  profileNotFound,
  publishRejected,
  type SocialProviderTokens,
} from "@delulu/connections";
import { TokenCipher, TokenCipherError } from "@delulu/core";
import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/** Shared PostgreSQL adapter for publishing token reads, rotations, and locks. */
export const makePostgresConnectionStore = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const cipher = yield* TokenCipher;

  return ConnectionStore.of({
    getSocialProviderWithDecryptedTokens: (id) =>
      Effect.gen(function* () {
        const rows = yield* sql<Record<string, unknown>>`
          SELECT id, platform,
            access_token AS "accessToken",
            refresh_token AS "refreshToken",
            cipher_version AS "cipherVersion",
            profile_id AS "profileId",
            username,
            expires_at AS "expiresAt",
            metadata->>'linkedinTargetType' AS "linkedinTargetType"
          FROM active_connections
          WHERE id = ${id}`;
        const row = rows[0];
        if (!row) {
          return null;
        }
        const cipherVersion = row.cipherVersion as "v1";
        return {
          _id: String(row.id),
          socialType: String(
            row.platform
          ) as SocialProviderTokens["socialType"],
          accessToken: yield* cipher.decrypt({
            ciphertext: String(row.accessToken),
            cipherVersion,
          }),
          refreshToken: row.refreshToken
            ? yield* cipher.decrypt({
                ciphertext: String(row.refreshToken),
                cipherVersion,
              })
            : undefined,
          profileId: String(row.profileId),
          username: row.username ? String(row.username) : undefined,
          expiresIn: row.expiresAt
            ? new Date(row.expiresAt as Date | string).getTime()
            : undefined,
          linkedinTargetType:
            row.linkedinTargetType === "organization"
              ? "organization"
              : row.linkedinTargetType === "member"
                ? "member"
                : undefined,
        } satisfies SocialProviderTokens;
      }).pipe(
        Effect.mapError((error) =>
          error instanceof TokenCipherError
            ? publishRejected(
                "token-service",
                "stored credentials could not be decrypted"
              )
            : networkError("Postgres", "load connection")
        )
      ),
    updateSocialProvider: (update) =>
      Effect.gen(function* () {
        const access = update.accessToken
          ? yield* cipher.encrypt(update.accessToken)
          : null;
        const refresh = update.refreshToken
          ? yield* cipher.encrypt(update.refreshToken)
          : null;
        const updated = yield* sql<{ id: string }>`UPDATE active_connections SET
          access_token = COALESCE(${access?.ciphertext ?? null}, access_token),
          refresh_token = COALESCE(${refresh?.ciphertext ?? null}, refresh_token),
          expires_at = COALESCE(${update.expiresIn ? new Date(update.expiresIn) : null}, expires_at)
          WHERE id = ${update.socialProviderId}
          RETURNING id`;
        if (updated.length !== 1) {
          return yield* Effect.fail(profileNotFound("token-service"));
        }
      }).pipe(
        Effect.asVoid,
        Effect.mapError((error) =>
          isConnectionError(error)
            ? error
            : error instanceof TokenCipherError
              ? publishRejected(
                  "token-service",
                  "refreshed credentials could not be encrypted"
                )
              : networkError("Postgres", "update connection")
        )
      ),
    withTokenRefreshLock: (id, refresh) =>
      sql
        .withTransaction(
          Effect.gen(function* () {
            yield* sql`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 0))`;
            return yield* refresh;
          })
        )
        .pipe(
          Effect.mapError((error) =>
            isConnectionError(error)
              ? error
              : networkError("Postgres", "lock token refresh")
          )
        ),
  });
});
