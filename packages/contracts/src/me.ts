import { WorkspaceRole } from "@delulu/core";
import { OperationalCounts } from "@delulu/core/domain/analytics";
import { PooledUsage } from "@delulu/core/domain/billing";
import { Schema } from "effect";
import {
  HttpApiEndpoint,
  HttpApiGroup,
  OpenApi,
} from "effect/unstable/httpapi";
import {
  ConflictErrorResponse,
  ForbiddenErrorResponse,
  NotFoundErrorResponse,
} from "./errors";
import { Authentication } from "./middleware";

/** The authenticated user, plus their personal workspace (identity tier). */
export const MeResponse = Schema.Struct({
  user: Schema.Struct({
    id: Schema.String,
    externalId: Schema.String,
    email: Schema.NullOr(Schema.String),
    name: Schema.NullOr(Schema.String),
    imageUrl: Schema.NullOr(Schema.String),
  }),
  personalWorkspace: Schema.NullOr(
    Schema.Struct({
      id: Schema.String,
      name: Schema.String,
      slug: Schema.NullOr(Schema.String),
    })
  ),
}).annotate({ identifier: "MeResponse" });

/** One membership row surfaced to a client so it can pick a workspace to bind. */
export const WorkspaceMembershipItem = Schema.Struct({
  workspaceId: Schema.String,
  name: Schema.String,
  slug: Schema.NullOr(Schema.String),
  isPersonal: Schema.Boolean,
  role: WorkspaceRole,
  /** The Clerk organization backing a team workspace; null for personal ones. */
  clerkOrgId: Schema.optional(Schema.NullOr(Schema.String)),
}).annotate({ identifier: "WorkspaceMembershipItem" });

/** Offset/limit list envelope (#148): numbered pages, `total` always present. */
export const MeWorkspacesResponse = Schema.Struct({
  data: Schema.Array(WorkspaceMembershipItem),
  total: Schema.Number,
  limit: Schema.Number,
  offset: Schema.Number,
}).annotate({ identifier: "MeWorkspacesResponse" });

export const EmailPreferencesResponse = Schema.Struct({
  productLifecycleEnabled: Schema.Boolean,
  marketingEnabled: Schema.Boolean,
});

export const OnboardingGoal = Schema.Literals(["publish", "auto_dm"]);
export const WebSetupStep = Schema.Literals([
  "goal",
  "connect",
  "ready",
  "plan",
  "complete",
]);

export const WorkspaceOverviewResponse = Schema.Struct({
  generatedAt: Schema.String,
  workspace: Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    role: WorkspaceRole,
    isPersonal: Schema.Boolean,
  }),
  setup: Schema.Struct({
    connectedPlatforms: Schema.Array(Schema.String),
    outstandingAction: Schema.NullOr(
      Schema.Literals(["connect_account", "complete_payment"])
    ),
    onboardingComplete: Schema.Boolean,
  }),
  accounts: Schema.Struct({
    total: Schema.Number,
    expiringSoon: Schema.Number,
  }),
  subscription: Schema.Struct({
    plan: Schema.String,
    status: Schema.String,
    paid: Schema.Boolean,
  }),
  usage: PooledUsage,
  publishing: OperationalCounts,
  reviews: Schema.Struct({ pending: Schema.Number }),
}).annotate({ identifier: "WorkspaceOverviewResponse" });

export const MeGroup = HttpApiGroup.make("me")
  .add(
    HttpApiEndpoint.get("current", "/", {
      success: MeResponse,
    }).annotate(OpenApi.Summary, "Get the authenticated user")
  )
  .add(
    HttpApiEndpoint.get("overview", "/overview/:workspaceId", {
      params: { workspaceId: Schema.String },
      success: WorkspaceOverviewResponse,
      error: [ForbiddenErrorResponse, NotFoundErrorResponse],
    }).annotate(OpenApi.Summary, "Get the workspace command-center overview")
  )
  .add(
    HttpApiEndpoint.get("setup", "/setup/:workspaceId", {
      params: { workspaceId: Schema.String },
      success: Schema.Struct({
        workspaceId: Schema.String,
        connectedPlatforms: Schema.Array(Schema.String),
        subscription: Schema.Struct({
          plan: Schema.String,
          status: Schema.String,
          paid: Schema.Boolean,
        }),
        optionalSteps: Schema.Record(Schema.String, Schema.String),
        goal: Schema.NullOr(OnboardingGoal),
        webStep: WebSetupStep,
        outstandingAction: Schema.NullOr(
          Schema.Literals(["connect_account", "complete_payment"])
        ),
        onboardingComplete: Schema.Boolean,
      }),
      error: [ForbiddenErrorResponse, NotFoundErrorResponse],
    })
  )
  .add(
    HttpApiEndpoint.patch("updateSetup", "/setup/:workspaceId", {
      params: { workspaceId: Schema.String },
      payload: Schema.Struct({
        optionalSteps: Schema.optional(
          Schema.Record(
            Schema.String,
            Schema.Literals(["completed", "skipped"])
          )
        ),
        goal: Schema.optional(OnboardingGoal),
      }),
      success: Schema.Struct({ updated: Schema.Boolean }),
      error: [ForbiddenErrorResponse, NotFoundErrorResponse],
    })
  )
  .add(
    HttpApiEndpoint.post("completeSetup", "/setup/:workspaceId/complete", {
      params: { workspaceId: Schema.String },
      success: Schema.Struct({ completed: Schema.Boolean }),
      error: [
        ForbiddenErrorResponse,
        NotFoundErrorResponse,
        ConflictErrorResponse,
      ],
    })
  )
  .add(
    HttpApiEndpoint.get("emailPreferences", "/email-preferences", {
      success: EmailPreferencesResponse,
    }),
    HttpApiEndpoint.put("updateEmailPreferences", "/email-preferences", {
      payload: EmailPreferencesResponse,
      success: EmailPreferencesResponse,
    })
  )
  .add(
    HttpApiEndpoint.get("workspaces", "/workspaces", {
      success: MeWorkspacesResponse,
    }).annotate(OpenApi.Summary, "List the user's workspace memberships")
  )
  .middleware(Authentication)
  .prefix("/v1/me");
