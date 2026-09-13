import { HttpApi, OpenApi } from "effect/unstable/httpapi";
import {
  AgentComputerGroup,
  AgentGroup,
  WorkspaceFilesGroup,
} from "./agent-workspace";
import { AnalyticsGroup } from "./analytics";
import { AutomationsGroup } from "./automations";
import { BillingGroup } from "./billing";
import { HealthGroup } from "./health";
import { InstanceGroup } from "./instance";
import { MeGroup } from "./me";
import { TranscriptionsGroup } from "./transcriptions";
import {
  AdminGroup,
  ConnectionsGroup,
  MediaGroups,
  PostsGroup,
  ReviewsGroup,
} from "./workspace";

export * from "./agent-workspace";
export * from "./analytics";
export * from "./automations";
export * from "./billing";
export * from "./clerk-webhooks";
export * from "./errors";
export * from "./health";
export * from "./instance";
export * from "./me";
export * from "./middleware";
export * from "./transcriptions";
export * from "./webhooks";
export * from "./workspace";

/**
 * The single typed API contract shared by every backend consumer (#142/#148).
 *
 * M1 surfaces the health probe and the identity tier (`/v1/me`,
 * `/v1/me/workspaces`). Workspace-tier domain resources land in M2. The OAuth
 * 2.1 AS is served as plain routes in `apps/api` (its wire formats — urlencoded
 * requests, snake_case JSON, RFC 8414/9728 metadata, 302 redirects — sit
 * deliberately outside the house HttpApi conventions).
 */
export const Api = HttpApi.make("deluluApi")
  .add(HealthGroup)
  .add(InstanceGroup)
  .add(MeGroup)
  .add(PostsGroup)
  .add(ReviewsGroup)
  .add(MediaGroups)
  .add(ConnectionsGroup)
  .add(AdminGroup)
  .add(AnalyticsGroup)
  .add(AutomationsGroup)
  .add(BillingGroup)
  .add(TranscriptionsGroup)
  .add(AgentGroup)
  .add(AgentComputerGroup)
  .add(WorkspaceFilesGroup)
  .annotate(OpenApi.Title, "Delulu API")
  .annotate(OpenApi.Version, "1.0.0")
  .annotate(
    OpenApi.Description,
    "Typed API contract shared by every backend consumer."
  );
