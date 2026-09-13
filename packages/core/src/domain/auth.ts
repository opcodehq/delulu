import { Schema } from "effect";
import type { WorkspaceRole } from "./workspace-member";

const WHITESPACE = /\s+/;

/**
 * The scope catalogue (#149). Scopes are the atomic delegation unit: a
 * credential's scopes narrow the permissions its live role would otherwise
 * grant. `effective = rolePerms(role) ∩ scopes`.
 */
export const SCOPES = [
  "posts:read",
  "posts:write",
  "accounts:read",
  "accounts:write",
  "stats:read",
  "billing:write",
  "media:write",
  "files:read",
  "files:write",
  "computer:read",
  "computer:write",
  "reviews:read",
  "reviews:write",
  "members:read",
  "members:write",
  "apikeys:write",
] as const;

export const Scope = Schema.Literals(SCOPES);
export type Scope = (typeof SCOPES)[number];

/** Space-delimited scope string ↔ scope array (OAuth `scope` wire format). */
export const scopesToString = (scopes: readonly Scope[]): string =>
  scopes.join(" ");

export const parseScopes = (value: string | undefined): readonly Scope[] => {
  if (!value) {
    return [];
  }
  const known = new Set<string>(SCOPES);
  return value
    .split(WHITESPACE)
    .filter((entry) => known.has(entry)) as readonly Scope[];
};

/** Read-only scopes — the ceiling for a `viewer`. */
const READ_SCOPES = [
  "posts:read",
  "accounts:read",
  "stats:read",
  "reviews:read",
  "members:read",
  "files:read",
  "computer:read",
] as const satisfies readonly Scope[];

/**
 * Role → maximum scope set (the ceiling). A credential can never hold a scope
 * above its live role's ceiling, regardless of what it was minted with (#149).
 *
 * `accounts:write` sits at the `editor` ceiling because #151 grants
 * connect/disconnect to editors; without it the scope would be unreachable.
 */
export const roleScopeCeiling: Record<WorkspaceRole, readonly Scope[]> = {
  viewer: [...READ_SCOPES],
  editor: [
    ...READ_SCOPES,
    "posts:write",
    "accounts:write",
    "media:write",
    "files:write",
    "computer:write",
    "reviews:write",
  ],
  admin: [
    ...READ_SCOPES,
    "posts:write",
    "accounts:write",
    "media:write",
    "files:write",
    "computer:write",
    "reviews:write",
    "members:write",
    "apikeys:write",
  ],
  owner: [
    ...READ_SCOPES,
    "posts:write",
    "accounts:write",
    "media:write",
    "files:write",
    "computer:write",
    "reviews:write",
    "members:write",
    "apikeys:write",
    "billing:write",
  ],
};

/**
 * Role × capability matrix (#151). Capabilities are coarser than scopes and
 * map to product actions rather than API surfaces; the domain services consult
 * these at each mutation point in M2.
 */
export interface RoleCapabilities {
  readonly publishDirect: boolean;
  readonly createPost: boolean;
  readonly approve: boolean;
  readonly manageConnections: boolean;
  readonly manageApiKeys: boolean;
  readonly manageBilling: boolean;
  readonly manageMembers: boolean;
}

export const rolePermissions: Record<WorkspaceRole, RoleCapabilities> = {
  owner: {
    publishDirect: true,
    createPost: true,
    approve: true,
    manageConnections: true,
    manageApiKeys: true,
    manageBilling: true,
    manageMembers: true,
  },
  admin: {
    publishDirect: true,
    createPost: true,
    approve: true,
    manageConnections: true,
    manageApiKeys: true,
    manageBilling: false,
    manageMembers: true,
  },
  editor: {
    publishDirect: false,
    createPost: true,
    approve: false,
    manageConnections: true,
    manageApiKeys: false,
    manageBilling: false,
    manageMembers: false,
  },
  viewer: {
    publishDirect: false,
    createPost: false,
    approve: false,
    manageConnections: false,
    manageApiKeys: false,
    manageMembers: false,
    manageBilling: false,
  },
};

/**
 * Effective permissions = the live role's ceiling ∩ the credential's scopes.
 * A `"full"` credential (first-party app session) gets the whole ceiling.
 */
export const effectivePermissions = (
  role: WorkspaceRole,
  scopes: readonly Scope[] | "full"
): readonly Scope[] => {
  const ceiling = roleScopeCeiling[role];
  if (scopes === "full") {
    return ceiling;
  }
  const ceilingSet = new Set<Scope>(ceiling);
  return scopes.filter((scope) => ceilingSet.has(scope));
};

/** Whether the effective scope set permits a given scope. */
export const can = (effective: readonly Scope[], scope: Scope): boolean =>
  effective.includes(scope);

/** Cap a requested scope set at what the role permits (used at mint time). */
export const capScopesToRole = (
  role: WorkspaceRole,
  requested: readonly Scope[]
): readonly Scope[] => effectivePermissions(role, requested);
