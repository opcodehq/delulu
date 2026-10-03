import {
  type ApiKeyView,
  ConflictError,
  type MemberView,
  NotFoundError,
  type WorkspaceView,
} from "@delulu/contracts";
import {
  ApiKeyId,
  capScopesToRole,
  makeId,
  rolePermissions,
  type Scope,
  type WorkspaceId,
  type WorkspaceRole,
} from "@delulu/core";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { generateApiKey } from "./api-key-format";
import { ClerkAdminService } from "./clerk-admin";
import { JobService } from "./jobs";

type WorkspaceOutput = typeof WorkspaceView.Type;
type MemberOutput = typeof MemberView.Type;
type ApiKeyOutput = typeof ApiKeyView.Type;
const rank: Record<WorkspaceRole, number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
  owner: 3,
};
const dateIso = (value: Date | string | null): string | null =>
  value === null ? null : new Date(value).toISOString();

export class AdminService extends Context.Service<
  AdminService,
  {
    readonly getWorkspace: (
      id: WorkspaceId
    ) => Effect.Effect<WorkspaceOutput, NotFoundError>;
    readonly updateWorkspace: (
      id: WorkspaceId,
      value: {
        readonly name?: string;
        readonly slug?: string | null;
        readonly publicShareLinks?: boolean;
      }
    ) => Effect.Effect<WorkspaceOutput, NotFoundError>;
    readonly deleteWorkspace: (
      id: WorkspaceId
    ) => Effect.Effect<void, ConflictError | NotFoundError>;
    readonly listMembers: (
      workspaceId: WorkspaceId,
      limit: number,
      offset: number
    ) => Effect.Effect<{
      data: readonly MemberOutput[];
      total: number;
      limit: number;
      offset: number;
    }>;
    readonly inviteMember: (input: {
      workspaceId: WorkspaceId;
      clerkOrgId: string | null;
      email: string;
      role: WorkspaceRole;
      actorRole: WorkspaceRole;
    }) => Effect.Effect<
      { invitationId: string; email: string; role: WorkspaceRole },
      ConflictError
    >;
    readonly updateMember: (input: {
      workspaceId: WorkspaceId;
      memberId: string;
      role: WorkspaceRole;
      actorRole: WorkspaceRole;
    }) => Effect.Effect<MemberOutput, ConflictError | NotFoundError>;
    readonly removeMember: (input: {
      workspaceId: WorkspaceId;
      memberId: string;
      actorRole: WorkspaceRole;
    }) => Effect.Effect<void, ConflictError | NotFoundError>;
    readonly listApiKeys: (
      workspaceId: WorkspaceId,
      limit: number,
      offset: number
    ) => Effect.Effect<{
      data: readonly ApiKeyOutput[];
      total: number;
      limit: number;
      offset: number;
    }>;
    readonly createApiKey: (input: {
      workspaceId: WorkspaceId;
      memberId: string;
      actorRole: WorkspaceRole;
      name: string;
      role: WorkspaceRole;
      scopes: readonly Scope[];
      expiresAt?: string;
    }) => Effect.Effect<{ key: ApiKeyOutput; token: string }, ConflictError>;
    readonly revokeApiKey: (
      workspaceId: WorkspaceId,
      id: string
    ) => Effect.Effect<void, NotFoundError>;
  }
>()("@delulu/services/AdminService") {
  static readonly layer = Layer.effect(
    AdminService,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const clerk = yield* ClerkAdminService;
      const jobs = yield* JobService;
      const getWorkspace = Effect.fn("AdminService.getWorkspace")(function* (
        id: WorkspaceId
      ) {
        const rows = yield* sql<
          Record<string, unknown>
        >`SELECT id, name, slug, is_personal, billing_owner_user_id, public_share_links
          FROM workspaces WHERE id = ${id} AND deleted_at IS NULL`.pipe(
          Effect.orDie
        );
        const row = rows[0];
        if (!row) {
          return yield* new NotFoundError({
            message: "Workspace not found",
            resource: "workspace",
          });
        }
        return {
          id: String(row.id),
          name: String(row.name),
          slug: row.slug === null ? null : String(row.slug),
          isPersonal: Boolean(row.isPersonal),
          billingOwnerUserId: String(row.billingOwnerUserId),
          publicShareLinks: Boolean(row.publicShareLinks),
        };
      });
      const updateWorkspace = Effect.fn("AdminService.updateWorkspace")(
        function* (
          id: WorkspaceId,
          value: {
            readonly name?: string;
            readonly slug?: string | null;
            readonly publicShareLinks?: boolean;
          }
        ) {
          yield* sql`UPDATE workspaces SET name = COALESCE(${value.name ?? null}, name),
          slug = CASE WHEN ${value.slug === undefined} THEN slug ELSE ${value.slug ?? null} END,
          public_share_links = COALESCE(${value.publicShareLinks ?? null}, public_share_links)
          WHERE id = ${id} AND deleted_at IS NULL`.pipe(Effect.orDie);
          return yield* getWorkspace(id);
        }
      );
      const deleteWorkspace = Effect.fn("AdminService.deleteWorkspace")(
        function* (id: WorkspaceId) {
          const rows = yield* sql<{
            isPersonal: boolean;
          }>`SELECT is_personal FROM workspaces WHERE id = ${id} AND deleted_at IS NULL`.pipe(
            Effect.orDie
          );
          if (!rows[0]) {
            return yield* new NotFoundError({
              message: "Workspace not found",
              resource: "workspace",
            });
          }
          if (rows[0].isPersonal) {
            return yield* new ConflictError({
              message: "Personal workspaces cannot be deleted",
              resource: "workspace",
            });
          }
          yield* sql`UPDATE workspaces SET deleted_at = now() WHERE id = ${id}`.pipe(
            Effect.orDie
          );
        }
      );
      const listMembers = Effect.fn("AdminService.listMembers")(function* (
        workspaceId: WorkspaceId,
        limit: number,
        offset: number
      ) {
        const rows = yield* sql<
          Record<string, unknown>
        >`SELECT m.id, m.user_id, u.email, u.name, m.role
          FROM workspace_members m JOIN users u ON u.id = m.user_id WHERE m.workspace_id = ${workspaceId}
          ORDER BY m.created_at LIMIT ${limit} OFFSET ${offset}`.pipe(
          Effect.orDie
        );
        const totalRows = yield* sql<{
          count: string;
        }>`SELECT count(*)::text AS count FROM workspace_members WHERE workspace_id = ${workspaceId}`.pipe(
          Effect.orDie
        );
        return {
          data: rows.map((row) => ({
            id: String(row.id),
            userId: String(row.userId),
            email: row.email === null ? null : String(row.email),
            name: row.name === null ? null : String(row.name),
            role: row.role as WorkspaceRole,
          })),
          total: Number(totalRows[0]?.count ?? 0),
          limit,
          offset,
        };
      });
      const inviteMember = Effect.fn("AdminService.inviteMember")(
        function* (input: {
          workspaceId: WorkspaceId;
          clerkOrgId: string | null;
          email: string;
          role: WorkspaceRole;
          actorRole: WorkspaceRole;
        }) {
          if (
            !rolePermissions[input.actorRole].manageMembers ||
            (input.role === "owner" && input.actorRole !== "owner")
          ) {
            return yield* new ConflictError({
              message: "Role cannot issue this invitation",
              resource: "member_invitation",
            });
          }
          if (!input.clerkOrgId) {
            return yield* new ConflictError({
              message: "Personal workspaces cannot invite members",
              resource: "member_invitation",
            });
          }
          const invitation = yield* clerk.invite({
            organizationId: input.clerkOrgId,
            email: input.email,
            role: input.role,
          });
          return {
            invitationId: invitation.id,
            email: input.email,
            role: input.role,
          };
        }
      );
      const loadMember = Effect.fn("AdminService.loadMember")(function* (
        workspaceId: WorkspaceId,
        memberId: string
      ) {
        const page = yield* listMembers(workspaceId, 1000, 0);
        const member = page.data.find((entry) => entry.id === memberId);
        if (!member) {
          return yield* new NotFoundError({
            message: "Member not found",
            resource: "member",
          });
        }
        return member;
      });
      const updateMember = Effect.fn("AdminService.updateMember")(
        function* (input: {
          workspaceId: WorkspaceId;
          memberId: string;
          role: WorkspaceRole;
          actorRole: WorkspaceRole;
        }) {
          const member = yield* loadMember(input.workspaceId, input.memberId);
          if (
            !rolePermissions[input.actorRole].manageMembers ||
            ((member.role === "owner" || input.role === "owner") &&
              input.actorRole !== "owner")
          ) {
            return yield* new ConflictError({
              message: "Role cannot change this membership",
              resource: "member",
            });
          }
          const mirror = yield* sql<{
            clerkOrgId: string | null;
            externalId: string;
          }>`
            SELECT w.clerk_org_id, u.external_id FROM workspace_members m
            JOIN workspaces w ON w.id = m.workspace_id JOIN users u ON u.id = m.user_id
            WHERE m.id = ${input.memberId} AND m.workspace_id = ${input.workspaceId}`.pipe(
            Effect.orDie
          );
          yield* sql
            .withTransaction(
              Effect.gen(function* () {
                yield* sql`SELECT id FROM workspaces WHERE id = ${input.workspaceId} FOR UPDATE`;
                if (member.role === "owner" && input.role !== "owner") {
                  const owners = yield* sql<{
                    count: string;
                  }>`SELECT count(*)::text AS count FROM workspace_members WHERE workspace_id = ${input.workspaceId} AND role = 'owner'`;
                  if (Number(owners[0]?.count ?? 0) <= 1) {
                    return yield* new ConflictError({
                      message: "The final owner cannot be demoted",
                      resource: "member",
                    });
                  }
                }
                yield* sql`UPDATE workspace_members SET role = ${input.role}::workspace_role WHERE id = ${input.memberId} AND workspace_id = ${input.workspaceId}`;
                if (mirror[0]?.clerkOrgId) {
                  yield* jobs.enqueue({
                    workspaceId: input.workspaceId,
                    payload: {
                      _tag: "MirrorClerkMembership",
                      organizationId: mirror[0].clerkOrgId,
                      externalUserId: mirror[0].externalId,
                      action: "update",
                      role: input.role,
                    },
                    runAt: new Date(),
                    idempotencyKey: `clerk-membership:update:${input.memberId}:${input.role}`,
                  });
                }
              })
            )
            .pipe(Effect.catchTag("SqlError", Effect.die));
          return yield* loadMember(input.workspaceId, input.memberId);
        }
      );
      const removeMember = Effect.fn("AdminService.removeMember")(
        function* (input: {
          workspaceId: WorkspaceId;
          memberId: string;
          actorRole: WorkspaceRole;
        }) {
          const member = yield* loadMember(input.workspaceId, input.memberId);
          if (
            !rolePermissions[input.actorRole].manageMembers ||
            (member.role === "owner" && input.actorRole !== "owner")
          ) {
            return yield* new ConflictError({
              message: "Role cannot remove this member",
              resource: "member",
            });
          }
          const mirror = yield* sql<{
            clerkOrgId: string | null;
            externalId: string;
          }>`
            SELECT w.clerk_org_id, u.external_id FROM workspace_members m
            JOIN workspaces w ON w.id = m.workspace_id JOIN users u ON u.id = m.user_id
            WHERE m.id = ${input.memberId} AND m.workspace_id = ${input.workspaceId}`.pipe(
            Effect.orDie
          );
          yield* sql
            .withTransaction(
              Effect.gen(function* () {
                yield* sql`SELECT id FROM workspaces WHERE id = ${input.workspaceId} FOR UPDATE`;
                if (member.role === "owner") {
                  const owners = yield* sql<{
                    count: string;
                  }>`SELECT count(*)::text AS count FROM workspace_members WHERE workspace_id = ${input.workspaceId} AND role = 'owner'`;
                  if (Number(owners[0]?.count ?? 0) <= 1) {
                    return yield* new ConflictError({
                      message: "The final owner cannot be removed",
                      resource: "member",
                    });
                  }
                }
                yield* sql`DELETE FROM workspace_members WHERE id = ${input.memberId} AND workspace_id = ${input.workspaceId}`;
                if (mirror[0]?.clerkOrgId) {
                  yield* jobs.enqueue({
                    workspaceId: input.workspaceId,
                    payload: {
                      _tag: "MirrorClerkMembership",
                      organizationId: mirror[0].clerkOrgId,
                      externalUserId: mirror[0].externalId,
                      action: "remove",
                    },
                    runAt: new Date(),
                    idempotencyKey: `clerk-membership:remove:${input.memberId}`,
                  });
                }
              })
            )
            .pipe(Effect.catchTag("SqlError", Effect.die));
        }
      );
      const listApiKeys = Effect.fn("AdminService.listApiKeys")(function* (
        workspaceId: WorkspaceId,
        limit: number,
        offset: number
      ) {
        const rows = yield* sql<
          Record<string, unknown>
        >`SELECT id, name, key_prefix, role, scopes, last_used_at, expires_at, revoked_at
          FROM api_keys WHERE workspace_id = ${workspaceId} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`.pipe(
          Effect.orDie
        );
        const totalRows = yield* sql<{
          count: string;
        }>`SELECT count(*)::text AS count FROM api_keys WHERE workspace_id = ${workspaceId}`.pipe(
          Effect.orDie
        );
        return {
          data: rows.map((row) => ({
            id: String(row.id),
            name: String(row.name),
            keyPrefix: String(row.keyPrefix),
            role: row.role as WorkspaceRole,
            scopes: row.scopes as Scope[],
            lastUsedAt: dateIso(row.lastUsedAt as Date | null),
            expiresAt: dateIso(row.expiresAt as Date | null),
            revokedAt: dateIso(row.revokedAt as Date | null),
          })),
          total: Number(totalRows[0]?.count ?? 0),
          limit,
          offset,
        };
      });
      const createApiKey = Effect.fn("AdminService.createApiKey")(
        function* (input: {
          workspaceId: WorkspaceId;
          memberId: string;
          actorRole: WorkspaceRole;
          name: string;
          role: WorkspaceRole;
          scopes: readonly Scope[];
          expiresAt?: string;
        }) {
          if (
            !rolePermissions[input.actorRole].manageApiKeys ||
            rank[input.role] > rank[input.actorRole]
          ) {
            return yield* new ConflictError({
              message: "API key role exceeds the creator role",
              resource: "api_key",
            });
          }
          const generated = yield* Effect.promise(() => generateApiKey());
          const id = makeId(ApiKeyId);
          const scopes = capScopesToRole(input.role, input.scopes);
          yield* sql`INSERT INTO api_keys
          (id, workspace_id, created_by_member_id, name, key_prefix, key_hash, role, scopes, expires_at)
          VALUES (${id}, ${input.workspaceId}, ${input.memberId}, ${input.name}, ${generated.prefix}, ${generated.hash},
            ${input.role}::workspace_role, ${scopes}, ${input.expiresAt ? new Date(input.expiresAt) : null})`.pipe(
            Effect.orDie
          );
          const listed = yield* listApiKeys(input.workspaceId, 1000, 0);
          return {
            key: listed.data.find((entry) => entry.id === id) as ApiKeyOutput,
            token: generated.token,
          };
        }
      );
      const revokeApiKey = Effect.fn("AdminService.revokeApiKey")(function* (
        workspaceId: WorkspaceId,
        id: string
      ) {
        const rows = yield* sql<{
          id: string;
        }>`UPDATE api_keys SET revoked_at = now() WHERE id = ${id} AND workspace_id = ${workspaceId} AND revoked_at IS NULL RETURNING id`.pipe(
          Effect.orDie
        );
        if (rows.length === 0) {
          return yield* new NotFoundError({
            message: "API key not found",
            resource: "api_key",
          });
        }
      });
      return AdminService.of({
        getWorkspace,
        updateWorkspace,
        deleteWorkspace,
        listMembers,
        inviteMember,
        updateMember,
        removeMember,
        listApiKeys,
        createApiKey,
        revokeApiKey,
      });
    })
  );
}
