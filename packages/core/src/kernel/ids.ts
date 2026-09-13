import { Schema } from "effect";
import { customAlphabet, urlAlphabet } from "nanoid";

const NANO_ID_LENGTH = 12;
const nanoIdCharacterClass = urlAlphabet.replace("-", "\\-");
const makeNanoId = customAlphabet(urlAlphabet, NANO_ID_LENGTH);

export const EntityIdTypeId: unique symbol = Symbol.for(
  "@delulu/core/EntityId"
);

export interface EntityIdSchema<A> extends Schema.Decoder<A, never> {
  readonly [EntityIdTypeId]: string;
}

const nanoId = <Brand extends string>(prefix: string, brand: Brand) => {
  const schema = Schema.String.check(
    Schema.isPattern(
      new RegExp(`^${prefix}_[${nanoIdCharacterClass}]{${NANO_ID_LENGTH}}$`)
    )
  ).pipe(Schema.brand(brand));

  return Object.defineProperty(schema, EntityIdTypeId, {
    value: `${prefix}_`,
  }) as typeof schema & EntityIdSchema<typeof schema.Type>;
};

export const UserId = nanoId("user", "UserId");
export type UserId = typeof UserId.Type;
export const WorkspaceId = nanoId("workspace", "WorkspaceId");
export type WorkspaceId = typeof WorkspaceId.Type;
export const OrgId = WorkspaceId;
export type OrgId = WorkspaceId;
export const MemberId = nanoId("member", "MemberId");
export type MemberId = typeof MemberId.Type;
export const ConnectionId = nanoId("connection", "ConnectionId");
export type ConnectionId = typeof ConnectionId.Type;
export const MediaId = nanoId("media", "MediaId");
export type MediaId = typeof MediaId.Type;
export const PostId = nanoId("post", "PostId");
export type PostId = typeof PostId.Type;
export const PostGroupId = nanoId("post_group", "PostGroupId");
export type PostGroupId = typeof PostGroupId.Type;
export const PostTargetId = nanoId("post_target", "PostTargetId");
export type PostTargetId = typeof PostTargetId.Type;
export const ApiKeyId = nanoId("api_key", "ApiKeyId");
export type ApiKeyId = typeof ApiKeyId.Type;
export const SubscriptionId = nanoId("subscription", "SubscriptionId");
export type SubscriptionId = typeof SubscriptionId.Type;
export const TransactionId = nanoId("transaction", "TransactionId");
export type TransactionId = typeof TransactionId.Type;
export const PostReviewId = nanoId("post_review", "PostReviewId");
export type PostReviewId = typeof PostReviewId.Type;
export const ReviewActivityId = nanoId("review_activity", "ReviewActivityId");
export type ReviewActivityId = typeof ReviewActivityId.Type;
export const AutomationId = nanoId("automation", "AutomationId");
export type AutomationId = typeof AutomationId.Type;
export const AutomationRunId = nanoId("automation_run", "AutomationRunId");
export type AutomationRunId = typeof AutomationRunId.Type;
export const AutomationContactId = nanoId(
  "automation_contact",
  "AutomationContactId"
);
export type AutomationContactId = typeof AutomationContactId.Type;
export const TranscriptionId = nanoId("transcription", "TranscriptionId");
export type TranscriptionId = typeof TranscriptionId.Type;
export const OAuthClientId = nanoId("oauth_client", "OAuthClientId");
export type OAuthClientId = typeof OAuthClientId.Type;
export const OAuthAuthorizationCodeId = nanoId(
  "oauth_code",
  "OAuthAuthorizationCodeId"
);
export type OAuthAuthorizationCodeId = typeof OAuthAuthorizationCodeId.Type;
export const OAuthGrantId = nanoId("oauth_grant", "OAuthGrantId");
export type OAuthGrantId = typeof OAuthGrantId.Type;
export const OAuthRefreshTokenId = nanoId(
  "oauth_refresh",
  "OAuthRefreshTokenId"
);
export type OAuthRefreshTokenId = typeof OAuthRefreshTokenId.Type;
export const JobId = nanoId("job", "JobId");
export type JobId = typeof JobId.Type;
export const AgentComputerId = nanoId("agent_computer", "AgentComputerId");
export type AgentComputerId = typeof AgentComputerId.Type;
export const AgentTaskId = nanoId("agent_task", "AgentTaskId");
export type AgentTaskId = typeof AgentTaskId.Type;
export const AgentWorkspaceId = nanoId("agent_workspace", "AgentWorkspaceId");
export type AgentWorkspaceId = typeof AgentWorkspaceId.Type;
export const AgentRunId = nanoId("agent_run", "AgentRunId");
export type AgentRunId = typeof AgentRunId.Type;
export const AgentRunEventId = nanoId("agent_run_event", "AgentRunEventId");
export type AgentRunEventId = typeof AgentRunEventId.Type;
export const AgentApprovalId = nanoId("agent_approval", "AgentApprovalId");
export type AgentApprovalId = typeof AgentApprovalId.Type;
export const AgentUsageId = nanoId("agent_usage", "AgentUsageId");
export type AgentUsageId = typeof AgentUsageId.Type;
export const AgentMemoryId = nanoId("agent_memory", "AgentMemoryId");
export type AgentMemoryId = typeof AgentMemoryId.Type;
export const AgentRitualId = nanoId("agent_ritual", "AgentRitualId");
export type AgentRitualId = typeof AgentRitualId.Type;
export const AgentCommandId = nanoId("agent_command", "AgentCommandId");
export type AgentCommandId = typeof AgentCommandId.Type;
export const AgentProcessId = nanoId("agent_process", "AgentProcessId");
export type AgentProcessId = typeof AgentProcessId.Type;
export const WorkspaceFileId = nanoId("workspace_file", "WorkspaceFileId");
export type WorkspaceFileId = typeof WorkspaceFileId.Type;
export const WorkspaceFileVersionId = nanoId(
  "file_version",
  "WorkspaceFileVersionId"
);
export type WorkspaceFileVersionId = typeof WorkspaceFileVersionId.Type;
export const WorkspaceSnapshotId = nanoId(
  "workspace_snapshot",
  "WorkspaceSnapshotId"
);
export type WorkspaceSnapshotId = typeof WorkspaceSnapshotId.Type;

export const makeId = <A>(schema: EntityIdSchema<A>): A =>
  Schema.decodeUnknownSync(schema)(`${schema[EntityIdTypeId]}${makeNanoId()}`);
