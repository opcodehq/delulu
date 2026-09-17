import { ConflictError, ForbiddenError } from "@delulu/contracts";
import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { AgentChannelService } from "./agent-channels";

export const CONTENT_SKILLS = [
  {
    id: "builtin:research",
    title: "Research",
    instructions:
      "Research using available approved tools. Distinguish verified facts, source dates, and inference. Cite accessible primary sources. Never invent citations or claim tools were used when they were not.",
  },
  {
    id: "builtin:drafting",
    title: "Drafting",
    instructions:
      "Draft for the selected platform, audience, and confirmed voice preferences. Ask for missing material facts. Do not invent personal experiences or performance claims. Saving or publishing follows the workspace approval policy.",
  },
  {
    id: "builtin:editing",
    title: "Editing",
    instructions:
      "Preserve the author's meaning and factual claims. Improve clarity and platform fit. Respect confirmed rejected patterns and explain material changes briefly.",
  },
  {
    id: "builtin:planning",
    title: "Planning",
    instructions:
      "Build practical content plans from confirmed goals and actual available analytics. Separate recommendations from scheduled actions. Never enable a ritual or publish without explicit approval.",
  },
] as const;
export interface InstructionSkill {
  id: string;
  title: string;
  instructions: string;
  revision: number;
  enabled: boolean;
}

const requireAccess = Effect.fn("AgentKnowledge.requireAccess")(function* (
  userId: string,
  workspaceId: string,
  write = false
) {
  const channels = yield* AgentChannelService;
  if (
    !(yield* channels.eligible(userId)).some(
      (w) => w.workspaceId === workspaceId
    )
  ) {
    return yield* new ForbiddenError({
      message: "Workspace access unavailable",
    });
  }
  if (write) {
    const sql = yield* SqlClient.SqlClient;
    const rows =
      yield* sql`SELECT id FROM workspace_members WHERE user_id = ${userId} AND workspace_id = ${workspaceId} AND role IN ('owner','admin','editor')`.pipe(
        Effect.orDie
      );
    if (!rows[0]) {
      return yield* new ForbiddenError({
        message: "Editing workspace skills requires editor access",
      });
    }
  }
});

export const listInstructionSkills = Effect.fn("listInstructionSkills")(
  function* (userId: string, workspaceId: string) {
    yield* requireAccess(userId, workspaceId);
    const sql = yield* SqlClient.SqlClient;
    const custom =
      yield* sql<InstructionSkill>`SELECT id, title, instructions, revision, enabled FROM agent_instruction_skills
    WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL ORDER BY title LIMIT 50`.pipe(
        Effect.orDie
      );
    return [
      ...CONTENT_SKILLS.map((s) => ({ ...s, revision: 1, enabled: true })),
      ...custom,
    ];
  }
);

export const saveInstructionSkill = Effect.fn("saveInstructionSkill")(
  function* (
    userId: string,
    workspaceId: string,
    input: {
      id?: string;
      title: string;
      instructions: string;
      revision?: number;
      enabled: boolean;
    }
  ) {
    yield* requireAccess(userId, workspaceId, true);
    if (
      !input.title.trim() ||
      input.title.length > 100 ||
      !input.instructions.trim() ||
      input.instructions.length > 12_000 ||
      input.id?.startsWith("builtin:")
    ) {
      return yield* new ConflictError({
        message: "Skill fields are invalid",
        resource: "agent-skill",
      });
    }
    const sql = yield* SqlClient.SqlClient;
    return yield* sql
      .withTransaction(
        Effect.gen(function* () {
          const id = input.id ?? crypto.randomUUID();
          const rows = input.id
            ? yield* sql<InstructionSkill>`UPDATE agent_instruction_skills SET title = ${input.title.trim()}, instructions = ${input.instructions.trim()},
      revision = revision + 1, enabled = ${input.enabled}, updated_at = now() WHERE id = ${id} AND workspace_id = ${workspaceId}
      AND revision = ${input.revision ?? 0} AND deleted_at IS NULL RETURNING id, title, instructions, revision, enabled`
            : yield* sql<InstructionSkill>`INSERT INTO agent_instruction_skills (id, workspace_id, created_by_user_id, title, instructions, enabled)
      VALUES (${id}, ${workspaceId}, ${userId}, ${input.title.trim()}, ${input.instructions.trim()}, ${input.enabled}) RETURNING id, title, instructions, revision, enabled`;
          const skill = rows[0];
          if (!skill) {
            return yield* new ConflictError({
              message: "Skill changed or was removed. Reload before editing.",
              resource: "agent-skill",
            });
          }
          yield* sql`INSERT INTO agent_instruction_skill_versions (skill_id, revision, title, instructions, edited_by_user_id)
      VALUES (${skill.id}, ${skill.revision}, ${skill.title}, ${skill.instructions}, ${userId})`;
          return skill;
        })
      )
      .pipe(Effect.catchTag("SqlError", Effect.die));
  }
);

export const deleteInstructionSkill = Effect.fn("deleteInstructionSkill")(
  function* (userId: string, workspaceId: string, id: string) {
    yield* requireAccess(userId, workspaceId, true);
    const sql = yield* SqlClient.SqlClient;
    yield* sql`UPDATE agent_instruction_skills SET deleted_at = now(), enabled = false WHERE id = ${id} AND workspace_id = ${workspaceId}`.pipe(
      Effect.orDie
    );
  }
);

export const readAgentKnowledge = Effect.fn("readAgentKnowledge")(function* (
  userId: string,
  workspaceId: string
) {
  yield* requireAccess(userId, workspaceId);
  const sql = yield* SqlClient.SqlClient;
  const skills = yield* listInstructionSkills(userId, workspaceId);
  const memories = yield* sql<{
    id: string;
    category: string;
    value: unknown;
    provenance: string;
  }>`SELECT id, category, value, provenance FROM agent_memories
    WHERE user_id = ${userId} AND (workspace_id = ${workspaceId} OR scope = 'personal') AND status = 'confirmed' ORDER BY updated_at DESC LIMIT 100`.pipe(
    Effect.orDie
  );
  return { skills: skills.filter((s) => s.enabled), memories };
});
