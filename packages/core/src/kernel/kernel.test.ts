import { Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";
import { PostContent } from "../domain/post-group";
import { PlatformSettings } from "../domain/post-target";
import {
  AgentCommandId,
  AgentComputerId,
  AgentProcessId,
  AgentTaskId,
  ApiKeyId,
  AutomationContactId,
  AutomationId,
  AutomationRunId,
  ConnectionId,
  type EntityIdSchema,
  MediaId,
  MemberId,
  makeId,
  PostGroupId,
  PostId,
  PostReviewId,
  PostTargetId,
  ReviewActivityId,
  SubscriptionId,
  TransactionId,
  TranscriptionId,
  UserId,
  WorkspaceFileId,
  WorkspaceFileVersionId,
  WorkspaceId,
  WorkspaceSnapshotId,
} from "./ids";
import { validateMediaFile } from "./media";
import { makeTokenCipher } from "./token-cipher";

const nanoIdSuffixPattern = /^[A-Za-z0-9_-]{12}$/;
const entityIdCases: ReadonlyArray<readonly [EntityIdSchema<unknown>, string]> =
  [
    [UserId, "user"],
    [WorkspaceId, "workspace"],
    [MemberId, "member"],
    [ConnectionId, "connection"],
    [MediaId, "media"],
    [PostId, "post"],
    [PostGroupId, "post_group"],
    [PostTargetId, "post_target"],
    [ApiKeyId, "api_key"],
    [SubscriptionId, "subscription"],
    [TransactionId, "transaction"],
    [PostReviewId, "post_review"],
    [ReviewActivityId, "review_activity"],
    [AutomationId, "automation"],
    [AutomationRunId, "automation_run"],
    [AutomationContactId, "automation_contact"],
    [TranscriptionId, "transcription"],
    [AgentComputerId, "agent_computer"],
    [AgentTaskId, "agent_task"],
    [AgentCommandId, "agent_command"],
    [AgentProcessId, "agent_process"],
    [WorkspaceFileId, "workspace_file"],
    [WorkspaceFileVersionId, "file_version"],
    [WorkspaceSnapshotId, "workspace_snapshot"],
  ];

describe("core kernel", () => {
  it("generates compact, entity-prefixed Nano IDs", () => {
    for (const [schema, prefix] of entityIdCases) {
      const id = makeId(schema) as string;
      const expectedPrefix = `${prefix}_`;

      expect(id.startsWith(expectedPrefix)).toBe(true);
      expect(id.slice(expectedPrefix.length)).toMatch(nanoIdSuffixPattern);
      expect(Schema.is(schema)(id)).toBe(true);
    }
    expect(Schema.is(UserId)(makeId(WorkspaceId))).toBe(false);
  });

  it("reports every violated media constraint", () => {
    const result = validateMediaFile(
      {
        mediaType: "video",
        mimeType: "video/mp4",
        sizeBytes: 11,
        width: 100,
        durationSeconds: 61,
      },
      {
        allowedTypes: ["image"],
        maxSizeBytes: 10,
        minWidth: 200,
        maxDurationSeconds: 60,
      }
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(4);
  });

  it("round-trips the legacy v1 token byte format", async () => {
    const cipher = makeTokenCipher("a stable test secret");
    const encrypted = await Effect.runPromise(cipher.encrypt("token-value"));
    expect(encrypted.cipherVersion).toBe("v1");
    expect(Buffer.from(encrypted.ciphertext, "base64")).toHaveLength(55);
    await expect(Effect.runPromise(cipher.decrypt(encrypted))).resolves.toBe(
      "token-value"
    );
    await expect(
      Effect.runPromise(
        cipher.decrypt({
          ciphertext:
            "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaG+yU8Pe8wlxf9FyM0c1Ba98ZtK5RuNlEDGFPf1w=",
          cipherVersion: "v1",
        })
      )
    ).resolves.toBe("legacy-token");
  });

  it("rejects post content without exactly one default group", () => {
    expect(Schema.is(PostContent)({ groups: [] })).toBe(false);
  });

  it("rejects settings that do not match their platform", () => {
    expect(
      Schema.is(PlatformSettings)({
        platform: "INSTAGRAM",
        values: { replyRestriction: "everyone" },
      })
    ).toBe(false);
  });
});
