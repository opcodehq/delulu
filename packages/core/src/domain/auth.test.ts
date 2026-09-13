import { describe, expect, it } from "vitest";
import {
  can,
  capScopesToRole,
  effectivePermissions,
  parseScopes,
  rolePermissions,
  roleScopeCeiling,
  SCOPES,
  scopesToString,
} from "./auth";
import { WorkspaceRole } from "./workspace-member";

const ROLES = WorkspaceRole.literals;

describe("roleScopeCeiling", () => {
  it("viewer holds exactly the read scopes", () => {
    expect([...roleScopeCeiling.viewer].sort()).toEqual(
      SCOPES.filter((scope) => scope.endsWith(":read")).sort()
    );
  });

  it("ceilings are monotonic viewer ⊆ editor ⊆ admin ⊆ owner", () => {
    const ordered = ["viewer", "editor", "admin", "owner"] as const;
    for (let i = 1; i < ordered.length; i++) {
      const lower = new Set(roleScopeCeiling[ordered[i - 1]]);
      const higher = new Set(roleScopeCeiling[ordered[i]]);
      for (const scope of lower) {
        expect(higher.has(scope)).toBe(true);
      }
    }
  });

  it("owner and admin may mint API keys", () => {
    expect(roleScopeCeiling.owner).toContain("apikeys:write");
    expect(roleScopeCeiling.admin).toContain("apikeys:write");
    expect(roleScopeCeiling.editor).not.toContain("apikeys:write");
  });

  it("lets viewers inspect files and computer state without mutating them", () => {
    expect(roleScopeCeiling.viewer).toContain("files:read");
    expect(roleScopeCeiling.viewer).toContain("computer:read");
    expect(roleScopeCeiling.viewer).not.toContain("files:write");
    expect(roleScopeCeiling.viewer).not.toContain("computer:write");
  });

  it("lets editors operate the workspace computer and its files", () => {
    expect(roleScopeCeiling.editor).toContain("files:write");
    expect(roleScopeCeiling.editor).toContain("computer:write");
  });

  it("viewer can never write regardless of requested scopes", () => {
    const effective = effectivePermissions(
      "viewer",
      SCOPES.filter((scope) => scope.endsWith(":write"))
    );
    expect(effective).toEqual([]);
  });
});

describe("effectivePermissions", () => {
  it("full session yields the whole ceiling", () => {
    for (const role of ROLES) {
      expect(effectivePermissions(role, "full")).toEqual(
        roleScopeCeiling[role]
      );
    }
  });

  it("intersects scopes with the role ceiling", () => {
    const effective = effectivePermissions("editor", [
      "posts:write",
      "apikeys:write",
    ]);
    expect(effective).toContain("posts:write");
    expect(effective).not.toContain("apikeys:write");
  });

  it("capScopesToRole drops scopes above the role", () => {
    expect(capScopesToRole("viewer", ["posts:write", "posts:read"])).toEqual([
      "posts:read",
    ]);
  });
});

describe("can", () => {
  it("reflects membership in the effective set", () => {
    const effective = effectivePermissions("owner", ["posts:read"]);
    expect(can(effective, "posts:read")).toBe(true);
    expect(can(effective, "posts:write")).toBe(false);
  });
});

describe("rolePermissions capability matrix (#151)", () => {
  it("only owner+admin publish directly and approve", () => {
    expect(rolePermissions.owner.publishDirect).toBe(true);
    expect(rolePermissions.admin.publishDirect).toBe(true);
    expect(rolePermissions.editor.publishDirect).toBe(false);
    expect(rolePermissions.viewer.publishDirect).toBe(false);
    expect(rolePermissions.editor.approve).toBe(false);
  });

  it("only owner manages billing", () => {
    expect(rolePermissions.owner.manageBilling).toBe(true);
    expect(rolePermissions.admin.manageBilling).toBe(false);
  });

  it("owner+admin+editor manage connections; viewer cannot", () => {
    expect(rolePermissions.editor.manageConnections).toBe(true);
    expect(rolePermissions.viewer.manageConnections).toBe(false);
  });

  it("viewer is read-only across every capability", () => {
    expect(Object.values(rolePermissions.viewer)).toEqual(
      Object.values(rolePermissions.viewer).map(() => false)
    );
  });
});

describe("scope wire format", () => {
  it("round-trips a space-delimited scope string", () => {
    const scopes = ["posts:read", "media:write"] as const;
    expect(parseScopes(scopesToString(scopes))).toEqual(scopes);
  });

  it("drops unknown scopes when parsing", () => {
    expect(parseScopes("posts:read bogus:scope stats:read")).toEqual([
      "posts:read",
      "stats:read",
    ]);
  });

  it("treats an empty/undefined scope string as no scopes", () => {
    expect(parseScopes(undefined)).toEqual([]);
    expect(parseScopes("")).toEqual([]);
  });
});
