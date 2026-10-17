import { ConflictError } from "@delulu/contracts";
import type { UserId, WorkspaceId } from "@delulu/core";
import { isPaidPlan } from "@delulu/payments/plans";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { ClerkAdminService } from "./clerk-admin";
import { EntitlementPolicy } from "./entitlements";

export type OptionalSetupStepState = "completed" | "skipped";
export type OnboardingGoal = "publish" | "auto_dm";
export type WebSetupStep = "goal" | "connect" | "ready" | "plan" | "complete";

export const deriveWebSetupStep = (
  goal: OnboardingGoal | null,
  connectedPlatforms: readonly string[],
  progress: {
    readonly connectionSkipped: boolean;
    readonly readyAcknowledged: boolean;
    readonly onboardingComplete: boolean;
  }
): WebSetupStep => {
  if (progress.onboardingComplete) {
    return "complete";
  }
  if (!goal) {
    return "goal";
  }
  const requirementMet =
    goal === "auto_dm"
      ? connectedPlatforms.includes("INSTAGRAM")
      : connectedPlatforms.length > 0;
  if (progress.connectionSkipped && !requirementMet) {
    return "plan";
  }
  if (!requirementMet) {
    return "connect";
  }
  return progress.readyAcknowledged ? "plan" : "ready";
};

export interface SetupStatus {
  readonly workspaceId: string;
  readonly connectedPlatforms: readonly string[];
  readonly subscription: {
    readonly plan: string;
    readonly status: string;
    readonly paid: boolean;
  };
  readonly optionalSteps: Readonly<Record<string, string>>;
  readonly goal: OnboardingGoal | null;
  readonly webStep: WebSetupStep;
  readonly outstandingAction: "connect_account" | "complete_payment" | null;
  readonly onboardingComplete: boolean;
}

export class SetupService extends Context.Service<
  SetupService,
  {
    readonly status: (
      workspaceId: WorkspaceId,
      userId: UserId
    ) => Effect.Effect<SetupStatus>;
    readonly updateOptionalSteps: (input: {
      readonly userId: UserId;
      readonly optionalSteps: Readonly<Record<string, OptionalSetupStepState>>;
    }) => Effect.Effect<void>;
    readonly updateGoal: (input: {
      readonly userId: UserId;
      readonly goal: OnboardingGoal;
    }) => Effect.Effect<void>;
    readonly complete: (
      workspaceId: WorkspaceId,
      userId: UserId
    ) => Effect.Effect<void, ConflictError>;
  }
>()("@delulu/services/SetupService") {
  static readonly layer = Layer.effect(
    SetupService,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const clerk = yield* ClerkAdminService;
      const entitlements = yield* EntitlementPolicy;

      const syncCompletionMetadata = Effect.fn(
        "SetupService.syncCompletionMetadata"
      )(function* (input: { userId: UserId; externalId: string }) {
        yield* clerk.updateUserPublicMetadata({
          externalUserId: input.externalId,
          metadata: {
            onboardingComplete: true,
            onboardingSource: "agent_or_web",
            completedAt: Date.now(),
          },
        });
        yield* sql`UPDATE users SET onboarding_metadata_synced_at = now()
          WHERE id = ${input.userId}`.pipe(Effect.orDie);
      });

      const status = Effect.fn("SetupService.status")(function* (
        workspaceId: WorkspaceId,
        userId: UserId
      ) {
        const [connections, subscriptions, users] = yield* Effect.all([
          sql<{
            platform: string;
          }>`SELECT DISTINCT platform FROM active_connections
            WHERE workspace_id = ${workspaceId} ORDER BY platform`,
          sql<{ plan: string; status: string }>`SELECT s.plan, s.status
            FROM workspaces w JOIN subscriptions s
              ON s.billing_owner_user_id = w.billing_owner_user_id
            WHERE w.id = ${workspaceId}`,
          sql<{
            externalId: string;
            onboardingOptional: Record<string, string>;
            onboardingCompletedAt: Date | null;
            onboardingMetadataSyncedAt: Date | null;
          }>`SELECT external_id, onboarding_optional, onboarding_completed_at
              , onboarding_metadata_synced_at
            FROM users WHERE id = ${userId}`,
        ]).pipe(Effect.orDie);
        const community = yield* entitlements.isCommunity;
        const subscription = community
          ? {
              plan: "COMMUNITY",
              status: "active",
            }
          : (subscriptions[0] ?? {
              plan: "free",
              status: "inactive",
            });
        const paid =
          community ||
          (isPaidPlan(subscription.plan) &&
            subscription.status.toUpperCase() === "ACTIVE");
        const connectedPlatforms = connections.map((row) => row.platform);
        const user = users[0];
        const onboardingComplete = Boolean(user?.onboardingCompletedAt);
        const storedGoal = user?.onboardingOptional.goal;
        const goal: OnboardingGoal | null =
          storedGoal === "publish" || storedGoal === "auto_dm"
            ? storedGoal
            : null;
        const connectionRequirementMet =
          goal !== null &&
          (goal === "auto_dm"
            ? connectedPlatforms.includes("INSTAGRAM")
            : connectedPlatforms.length > 0);
        const optionalSteps = Object.fromEntries(
          Object.entries(user?.onboardingOptional ?? {}).filter(
            ([key]) => key !== "goal"
          )
        );
        if (
          user &&
          onboardingComplete &&
          user.onboardingMetadataSyncedAt === null
        ) {
          yield* syncCompletionMetadata({
            userId,
            externalId: user.externalId,
          }).pipe(Effect.result);
        }
        return {
          workspaceId,
          connectedPlatforms,
          subscription: {
            plan: subscription.plan,
            status: subscription.status,
            paid,
          },
          optionalSteps,
          goal,
          webStep: deriveWebSetupStep(goal, connectedPlatforms, {
            connectionSkipped: optionalSteps.connect === "skipped",
            readyAcknowledged: optionalSteps.ready === "completed",
            onboardingComplete,
          }),
          outstandingAction:
            connectionRequirementMet || optionalSteps.connect === "skipped"
              ? paid
                ? null
                : ("complete_payment" as const)
              : ("connect_account" as const),
          onboardingComplete,
        };
      });

      const updateOptionalSteps = Effect.fn("SetupService.updateOptionalSteps")(
        function* (input: {
          userId: UserId;
          optionalSteps: Readonly<Record<string, OptionalSetupStepState>>;
        }) {
          yield* sql`UPDATE users SET onboarding_optional =
          onboarding_optional || ${JSON.stringify(input.optionalSteps)}::jsonb
          WHERE id = ${input.userId}`.pipe(Effect.orDie);
        }
      );

      const updateGoal = Effect.fn("SetupService.updateGoal")(
        function* (input: { userId: UserId; goal: OnboardingGoal }) {
          yield* sql`UPDATE users SET onboarding_optional =
          CASE
            WHEN onboarding_optional->>'goal' = ${input.goal}
              THEN onboarding_optional
            ELSE (onboarding_optional - 'ready' - 'connect')
              || ${JSON.stringify({ goal: input.goal })}::jsonb
          END
          WHERE id = ${input.userId}`.pipe(Effect.orDie);
        }
      );

      const complete = Effect.fn("SetupService.complete")(function* (
        workspaceId: WorkspaceId,
        userId: UserId
      ) {
        const [users, connections, subscriptions] = yield* Effect.all([
          sql<{
            externalId: string;
            onboardingOptional: Record<string, string>;
          }>`SELECT external_id, onboarding_optional
            FROM users WHERE id = ${userId}`,
          sql<{ platform: string }>`SELECT platform FROM active_connections
            WHERE workspace_id = ${workspaceId}`,
          sql<{ plan: string; status: string }>`SELECT s.plan, s.status
            FROM workspaces w JOIN subscriptions s
              ON s.billing_owner_user_id = w.billing_owner_user_id
            WHERE w.id = ${workspaceId}`,
        ]).pipe(Effect.orDie);
        const user = users[0];
        if (!user) {
          return yield* Effect.die("Authenticated user is not provisioned");
        }
        const goalValue = user.onboardingOptional.goal;
        const goal: OnboardingGoal | null =
          goalValue === "publish" || goalValue === "auto_dm" ? goalValue : null;
        if (!goal) {
          return yield* new ConflictError({
            message: "Choose an onboarding goal before finishing setup",
            resource: "onboarding_goal",
          });
        }
        const connectedPlatforms = connections.map((row) => row.platform);
        const requirementMet =
          goal === "auto_dm"
            ? connectedPlatforms.includes("INSTAGRAM")
            : connectedPlatforms.length > 0;
        const connectionSkipped = user.onboardingOptional.connect === "skipped";
        if (!(requirementMet || connectionSkipped)) {
          return yield* new ConflictError({
            message: "Connect the account required for your goal",
            resource: "onboarding_connection",
          });
        }
        if (requirementMet && user.onboardingOptional.ready !== "completed") {
          return yield* new ConflictError({
            message: "Review your setup before choosing a plan",
            resource: "onboarding_ready",
          });
        }
        const community = yield* entitlements.isCommunity;
        const subscription = subscriptions[0];
        const hasActivePlan =
          community ||
          (subscription !== undefined &&
            isPaidPlan(subscription.plan) &&
            subscription.status.toUpperCase() === "ACTIVE");
        if (!hasActivePlan) {
          return yield* new ConflictError({
            message: "Choose a plan and complete checkout to finish onboarding",
            resource: "subscription",
          });
        }
        const updated = yield* sql<{ externalId: string }>`
          UPDATE users SET
            onboarding_completed_at = COALESCE(onboarding_completed_at, now()),
            onboarding_metadata_synced_at = NULL
          WHERE id = ${userId}
          RETURNING external_id`.pipe(Effect.orDie);
        yield* syncCompletionMetadata({
          userId,
          externalId: updated[0]?.externalId ?? user.externalId,
        });
      });

      return SetupService.of({
        status,
        updateOptionalSteps,
        updateGoal,
        complete,
      });
    })
  );
}
