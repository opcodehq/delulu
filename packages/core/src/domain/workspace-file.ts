import { Schema } from "effect";

export const WorkspaceFileSource = Schema.Literals([
  "upload",
  "whatsapp",
  "connector",
  "agent",
  "computer",
]);
export type WorkspaceFileSource = typeof WorkspaceFileSource.Type;

export const WorkspaceFileVisibility = Schema.Literals([
  "private",
  "workspace",
]);
export type WorkspaceFileVisibility = typeof WorkspaceFileVisibility.Type;

export const WorkspaceFileStatus = Schema.Literals([
  "pending",
  "available",
  "processing",
  "quarantined",
  "deleted",
]);
export type WorkspaceFileStatus = typeof WorkspaceFileStatus.Type;

const WINDOWS_DRIVE = /^[A-Za-z]:[\\/]/;
const hasControlCharacter = (value: string): boolean =>
  Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });

export const normalizeWorkspacePath = (value: string): string => {
  if (
    value.length === 0 ||
    value.startsWith("/") ||
    WINDOWS_DRIVE.test(value) ||
    hasControlCharacter(value)
  ) {
    throw new Error("Invalid workspace path");
  }
  const normalized: string[] = [];
  for (const segment of value.replaceAll("\\", "/").split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === "..") {
      if (normalized.length === 0) {
        throw new Error("Invalid workspace path");
      }
      normalized.pop();
      continue;
    }
    normalized.push(segment);
  }
  if (normalized.length === 0) {
    throw new Error("Invalid workspace path");
  }
  return normalized.join("/");
};
