import { MemberId, WorkspaceRole } from "@delulu/core";
import { Context, Effect, Layer, Option, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";

export interface Membership {
  readonly memberId: MemberId;
  readonly role: WorkspaceRole;
}

export interface WorkspaceMembershipItem {
  readonly workspaceId: string;
  readonly name: string;
  readonly slug: string | null;
  readonly isPersonal: boolean;
  readonly role: WorkspaceRole;
  readonly clerkOrgId: string | null;
}

const MembershipRow = Schema.Struct({ id: MemberId, role: WorkspaceRole });

const MembershipListRow = Schema.Struct({
  workspaceId: Schema.String,
  name: Schema.String,
  slug: Schema.NullOr(Schema.String),
  isPersonal: Schema.Boolean,
  role: WorkspaceRole,
  clerkOrgId: Schema.NullOr(Schema.String),
});

/**
 * Resolves the live role for `(workspaceId, userId)` from `workspace_members` —
 * the single authoritative membership check for every non-session credential
 * (#149/#151). One indexed lookup on the unique `(workspace_id, user_id)` index.
 */
export class MembershipService extends Context.Service<
  MembershipService,
  {
    readonly resolve: (input: {
      readonly workspaceId: string;
      readonly userId: string;
    }) => Effect.Effect<Option.Option<Membership>>;
    /** Every workspace the user belongs to, with the live role (identity tier). */
    readonly listForUser: (
      userId: string
    ) => Effect.Effect<readonly WorkspaceMembershipItem[]>;
  }
>()("@delulu/services/MembershipService") {
  static readonly layer = Layer.effect(
    MembershipService,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      const query = SqlSchema.findOneOption({
        Request: Schema.Struct({
          workspaceId: Schema.String,
          userId: Schema.String,
        }),
        Result: MembershipRow,
        execute: ({ workspaceId, userId }) =>
          sql`SELECT id, role FROM workspace_members WHERE workspace_id = ${workspaceId} AND user_id = ${userId}`,
      });

      const listQuery = SqlSchema.findAll({
        Request: Schema.String,
        Result: MembershipListRow,
        execute: (userId) =>
          sql`SELECT w.id AS workspace_id, w.name, w.slug, w.is_personal, m.role,
                w.clerk_org_id
              FROM workspace_members m
              JOIN workspaces w ON w.id = m.workspace_id
              WHERE m.user_id = ${userId}
              ORDER BY w.is_personal DESC, w.created_at`,
      });

      const resolve = (input: {
        readonly workspaceId: string;
        readonly userId: string;
      }) =>
        query(input).pipe(
          Effect.map(
            Option.map((row) => ({ memberId: row.id, role: row.role }))
          ),
          Effect.orDie
        );

      const listForUser = (userId: string) =>
        listQuery(userId).pipe(Effect.orDie);

      return MembershipService.of({ resolve, listForUser });
    })
  );
}
