import { TokenCipher } from "@delulu/core";
import {
  AnalyticsProviderError,
  InsightMedia,
  InsightPeriod,
} from "@delulu/core/domain/analytics";
import { LiveInsightsProvider } from "@delulu/services";
import { DateTime, Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";

const API_BASE = "https://graph.instagram.com/v24.0";
const PERIOD_METRICS = [
  "views",
  "reach",
  "total_interactions",
  "follower_count",
  "profile_views",
].join(",");
const MEDIA_METRICS = [
  "views",
  "reach",
  "likes",
  "comments",
  "saved",
  "shares",
  "total_interactions",
].join(",");

const MetricValue = Schema.Struct({
  value: Schema.Number,
  end_time: Schema.optional(Schema.String),
});
const Metric = Schema.Struct({
  name: Schema.String,
  values: Schema.optional(Schema.Array(MetricValue)),
  total_value: Schema.optional(Schema.Struct({ value: Schema.Number })),
});
const MetricsResponse = Schema.Struct({ data: Schema.Array(Metric) });
const MediaItem = Schema.Struct({
  id: Schema.String,
  caption: Schema.optional(Schema.String),
  media_type: Schema.String,
  timestamp: Schema.String,
  permalink: Schema.optional(Schema.String),
});
const MediaResponse = Schema.Struct({ data: Schema.Array(MediaItem) });

const providerError = (message: string, retryable: boolean) =>
  new AnalyticsProviderError({ message, retryable });

const fetchJson = Effect.fn("LiveInsights.fetchJson")(function* <A, I>(
  schema: Schema.Codec<A, I>,
  url: URL,
  accessToken: string
) {
  url.searchParams.set("access_token", accessToken);
  const response = yield* Effect.tryPromise({
    try: () => fetch(url),
    catch: (cause) =>
      providerError(`Insights request failed: ${String(cause)}`, true),
  });
  if (!response.ok) {
    const body = yield* Effect.promise(() => response.text().catch(() => ""));
    return yield* providerError(
      `Insights provider returned ${response.status}: ${body.slice(0, 240)}`,
      response.status === 429 || response.status >= 500
    );
  }
  const json = yield* Effect.tryPromise({
    try: () => response.json(),
    catch: (cause) =>
      providerError(`Insights response was not JSON: ${String(cause)}`, false),
  });
  return yield* Schema.decodeUnknownEffect(schema)(json).pipe(
    Effect.mapError((cause) =>
      providerError(`Insights response was invalid: ${String(cause)}`, false)
    )
  );
});

interface ConnectionCredentials {
  readonly profileId: string;
  readonly accessToken: string;
}

/** Worker-safe live insights adapter. Provider calls are cached by AnalyticsService. */
export const LiveInsightsProviderLive = Layer.effect(
  LiveInsightsProvider,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const cipher = yield* TokenCipher;

    const credentials = Effect.fn("LiveInsights.credentials")(function* (
      workspaceId: string,
      connectionId: string
    ): Effect.fn.Return<ConnectionCredentials, AnalyticsProviderError> {
      const rows = yield* sql<{
        platform: string;
        profileId: string;
        accessToken: string;
        cipherVersion: "v1";
      }>`SELECT platform, profile_id, access_token, cipher_version
          FROM active_connections WHERE id = ${connectionId}
            AND workspace_id = ${workspaceId}`.pipe(
        Effect.mapError(() =>
          providerError("Unable to load the insights connection", true)
        )
      );
      const row = rows[0];
      if (!row) {
        return yield* providerError("Insights connection was not found", false);
      }
      if (row.platform !== "INSTAGRAM") {
        return yield* providerError(
          `Live insights are not supported for ${row.platform}`,
          false
        );
      }
      const accessToken = yield* cipher
        .decrypt({
          ciphertext: row.accessToken,
          cipherVersion: row.cipherVersion,
        })
        .pipe(
          Effect.mapError(() =>
            providerError("Unable to decrypt the insights credential", false)
          )
        );
      return { profileId: row.profileId, accessToken };
    });

    const fetchPeriod = Effect.fn("LiveInsights.fetchPeriod")(
      function* (
        request
      ): Effect.fn.Return<typeof InsightPeriod.Type, AnalyticsProviderError> {
        const connection = yield* credentials(
          request.workspaceId,
          request.connectionId
        );
        const url = new URL(`${API_BASE}/${connection.profileId}/insights`);
        url.searchParams.set("metric", PERIOD_METRICS);
        url.searchParams.set("period", "day");
        url.searchParams.set("since", request.since);
        url.searchParams.set("until", request.until);
        const response = yield* fetchJson(
          MetricsResponse,
          url,
          connection.accessToken
        );
        const byDate = new Map<
          string,
          {
            impressions: number;
            reach: number;
            engagements: number;
            followersGained: number;
            profileViews: number;
          }
        >();
        for (const metric of response.data) {
          for (const point of metric.values ?? []) {
            if (!point.end_time) {
              continue;
            }
            const parsed = DateTime.make(point.end_time);
            if (parsed._tag === "None") {
              continue;
            }
            const date = DateTime.formatIsoDateUtc(parsed.value);
            const entry = byDate.get(date) ?? {
              impressions: 0,
              reach: 0,
              engagements: 0,
              followersGained: 0,
              profileViews: 0,
            };
            if (metric.name === "views") {
              entry.impressions += point.value;
            }
            if (metric.name === "reach") {
              entry.reach += point.value;
            }
            if (metric.name === "total_interactions") {
              entry.engagements += point.value;
            }
            if (metric.name === "follower_count") {
              entry.followersGained += point.value;
            }
            if (metric.name === "profile_views") {
              entry.profileViews += point.value;
            }
            byDate.set(date, entry);
          }
        }
        const points = [...byDate.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([date, values]) => ({ date, ...values }));
        return InsightPeriod.make({
          since: request.since,
          until: request.until,
          totals: points.reduce(
            (total, point) => ({
              impressions: total.impressions + point.impressions,
              reach: total.reach + point.reach,
              engagements: total.engagements + point.engagements,
              followersGained: total.followersGained + point.followersGained,
              profileViews: total.profileViews + point.profileViews,
            }),
            {
              impressions: 0,
              reach: 0,
              engagements: 0,
              followersGained: 0,
              profileViews: 0,
            }
          ),
          points,
        });
      }
    );

    const fetchRecentMedia = Effect.fn("LiveInsights.fetchRecentMedia")(
      function* (
        request
      ): Effect.fn.Return<
        readonly (typeof InsightMedia.Type)[],
        AnalyticsProviderError
      > {
        const connection = yield* credentials(
          request.workspaceId,
          request.connectionId
        );
        const url = new URL(`${API_BASE}/${connection.profileId}/media`);
        url.searchParams.set(
          "fields",
          "id,caption,media_type,timestamp,permalink"
        );
        url.searchParams.set("limit", String(Math.min(25, request.limit)));
        const media = yield* fetchJson(
          MediaResponse,
          url,
          connection.accessToken
        );
        return yield* Effect.forEach(
          media.data,
          Effect.fn("LiveInsights.fetchMediaItem")(function* (item) {
            const metricsUrl = new URL(`${API_BASE}/${item.id}/insights`);
            metricsUrl.searchParams.set("metric", MEDIA_METRICS);
            const metrics = yield* fetchJson(
              MetricsResponse,
              metricsUrl,
              connection.accessToken
            );
            const totals = Object.fromEntries(
              metrics.data.map((metric) => [
                metric.name,
                metric.total_value?.value ??
                  (metric.values ?? []).reduce(
                    (sum, value) => sum + value.value,
                    0
                  ),
              ])
            );
            return InsightMedia.make({
              id: item.id,
              caption: item.caption ?? null,
              mediaType: item.media_type,
              permalink: item.permalink ?? null,
              publishedAt: DateTime.formatIso(
                DateTime.makeUnsafe(item.timestamp)
              ),
              impressions: totals.views ?? 0,
              reach: totals.reach ?? 0,
              engagements:
                totals.total_interactions ??
                (totals.likes ?? 0) +
                  (totals.comments ?? 0) +
                  (totals.saved ?? 0) +
                  (totals.shares ?? 0),
            });
          }),
          { concurrency: 5 }
        );
      }
    );

    return LiveInsightsProvider.of({ fetchPeriod, fetchRecentMedia });
  })
);
