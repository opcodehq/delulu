import { describe, expect, it } from "vitest";
import { normalizeWorkspacePath } from "./workspace-file";

describe("normalizeWorkspacePath", () => {
  it("normalizes a relative logical path without changing its meaning", () => {
    expect(normalizeWorkspacePath("research//launch/./notes.md")).toBe(
      "research/launch/notes.md"
    );
  });

  it.each([
    "../private.txt",
    "research/../../private.txt",
    "/etc/passwd",
    "C:\\secrets.txt",
    "research/\u0000secret",
    "",
  ])("rejects unsafe workspace path %j", (path) => {
    expect(() => normalizeWorkspacePath(path)).toThrow(
      "Invalid workspace path"
    );
  });
});
