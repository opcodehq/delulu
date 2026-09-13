import { Api } from "@delulu/contracts";
import { CurrentAuth, emptyPooledUsage } from "@delulu/core";
import {
  AgentRuntimeProvider,
  AnalyticsService,
  BillingService,
  DeploymentConfig,
  IdentityService,
  MembershipService,
  MessagingService,
  R2Service,
  SetupService,
  WorkspaceAccessService,
} from "@delulu/services";
import { DateTime, Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { SqlClient } from "effect/unstable/sql";
import { AuthenticationLive } from "./auth-middleware";

/** `GET /health` — liveness plus a `SELECT 1` database probe. */
export const HealthHandlers = HttpApiBuilder.group(
  Api,
  "health",
  Effect.fnUntraced(function* (handlers) {
    return handlers.handle("check", () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* sql`SELECT 1`.pipe(Effect.orDie);
        const checkedAt = yield* DateTime.now;
        return { status: "ok" as const, checkedAt };
      })
    );
  })
);

export const InstanceHandlers = HttpApiBuilder.group(
  Api,
  "instance",
  Effect.fnUntraced(function* (handlers) {
    const deployment = yield* DeploymentConfig;
    const runtime = yield* AgentRuntimeProvider;
    const r2 = yield* R2Service;
    return handlers.handle("capabilities", () =>
      Effect.succeed({
        deploymentMode: deployment.mode,
        billingEnabled: deployment.mode === "hosted",
        registrationEnabled: deployment.registrationEnabled,
        agentComputerEnabled: runtime.configured,
        workspaceFilesEnabled: r2.configured,
        version: deployment.version,
      })
    );
  })
);

/** `GET /v1/me` and `GET /v1/me/workspaces` — the identity tier. */
export const MeHandlers = HttpApiBuilder.group(
  Api,
  "me",
  Effect.fnUntraced(function* (handlers) {
    const identity = yield* IdentityService;
    const analytics = yield* AnalyticsService;
    const billing = yield* BillingService;
    const membership = yield* MembershipService;
    const messaging = yield* MessagingService;
    const setup = yield* SetupService;
    const workspaces = yield* WorkspaceAccessService;
    const sql = yield* SqlClient.SqlClient;

    return handlers
      .handle("current", () =>
        Effect.gen(function* () {
          const auth = yield* CurrentAuth;
          const resolved = yield* identity.resolveById(auth.userId);
          return {
            user: {
              id: resolved.user.id,
              externalId: resolved.user.externalId,
              email: resolved.user.email,
              name: resolved.user.name,
              imageUrl: resolved.user.imageUrl,
            },
            personalWorkspace: resolved.personalWorkspace
              ? {
                  id: resolved.personalWorkspace.id,
                  name: resolved.personalWorkspace.name,
                  slug: resolved.personalWorkspace.slug,
                }
              : null,
          };
        })
      )
      .handle("workspaces", () =>
        Effect.gen(function* () {
          const auth = yield* CurrentAuth;
          const rows = yield* membership.listForUser(auth.userId);
          return {
            data: rows,
            total: rows.length,
            limit: rows.length,
            offset: 0,
          };
        })
      )
      .handle("overview", ({ params }) =>
        Effect.gen(function* () {
          const auth = yield* CurrentAuth;
          const access = yield* workspaces.require({
            workspaceId: params.workspaceId,
            auth,
            scope: "stats:read",
          });
          const membershipRows = yield* membership.listForUser(auth.userId);
          const workspace = membershipRows.find(
            (item) => item.workspaceId === access.workspaceId
          );
          const [setupStatus, operational, usage, attention] =
            yield* Effect.all([
              setup.status(access.workspaceId, auth.userId),
              analytics.operational(access.workspaceId),
              billing.usage(access.billingOwnerUserId).pipe(
                Effect.catchTag("NotFoundError", () =>
                  Effect.succeed({
                    billingOwnerUserId: access.billingOwnerUserId,
                    usage: emptyPooledUsage(),
                  })
                )
              ),
              sql<{
                accountCount: string;
                expiringSoon: string;
                pendingReviews: string;
              }>`SELECT
                (SELECT count(*)::text FROM connections
                  WHERE workspace_id = ${access.workspaceId}) AS account_count,
                (SELECT count(*)::text FROM connections
                  WHERE workspace_id = ${access.workspaceId}
                    AND expires_at IS NOT NULL
                    AND expires_at < now() + interval '7 days') AS expiring_soon,
                (SELECT count(*)::text FROM post_reviews r
                  JOIN posts p ON p.id = r.post_id
                  WHERE p.workspace_id = ${access.workspaceId}
                    AND r.status = 'pending') AS pending_reviews`.pipe(
                Effect.orDie
              ),
            ]);
          const now = yield* DateTime.now;
          const row = attention[0];
          return {
            generatedAt: DateTime.formatIso(now),
            workspace: {
              id: access.workspaceId,
              name: workspace?.name ?? access.workspaceId,
              role: access.role,
              isPersonal: access.isPersonal,
            },
            setup: {
              connectedPlatforms: setupStatus.connectedPlatforms,
              outstandingAction: setupStatus.outstandingAction,
              onboardingComplete: setupStatus.onboardingComplete,
            },
            accounts: {
              total: Number(row?.accountCount ?? 0),
              expiringSoon: Number(row?.expiringSoon ?? 0),
            },
            subscription: setupStatus.subscription,
            usage: usage.usage,
            publishing: operational.counts,
            reviews: { pending: Number(row?.pendingReviews ?? 0) },
          };
        })
      )
      .handle("setup", ({ params }) =>
        Effect.gen(function* () {
          const auth = yield* CurrentAuth;
          const access = yield* workspaces.require({
            workspaceId: params.workspaceId,
            auth,
            scope: "accounts:read",
          });
          return yield* setup.status(access.workspaceId, auth.userId);
        })
      )
      .handle("updateSetup", ({ params, payload }) =>
        Effect.gen(function* () {
          const auth = yield* CurrentAuth;
          yield* workspaces.require({
            workspaceId: params.workspaceId,
            auth,
            scope: "accounts:write",
          });
          if (payload.optionalSteps) {
            yield* setup.updateOptionalSteps({
              userId: auth.userId,
              optionalSteps: payload.optionalSteps,
            });
          }
          if (payload.goal) {
            yield* setup.updateGoal({
              userId: auth.userId,
              goal: payload.goal,
            });
          }
          return { updated: true };
        })
      )
      .handle("completeSetup", ({ params }) =>
        Effect.gen(function* () {
          const auth = yield* CurrentAuth;
          const access = yield* workspaces.require({
            workspaceId: params.workspaceId,
            auth,
            scope: "accounts:write",
          });
          yield* setup.complete(access.workspaceId, auth.userId);
          return { completed: true };
        })
      )
      .handle("emailPreferences", () =>
        Effect.gen(function* () {
          const auth = yield* CurrentAuth;
          return yield* messaging.preferences(auth.userId);
        })
      )
      .handle("updateEmailPreferences", ({ payload }) =>
        Effect.gen(function* () {
          const auth = yield* CurrentAuth;
          yield* messaging.updatePreferences({
            userId: auth.userId,
            ...payload,
          });
          return yield* messaging.preferences(auth.userId);
        })
      );
  })
).pipe(Layer.provide(AuthenticationLive));
