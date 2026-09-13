export interface ContentContext {
  workspace: { id: string; name: string; role: string };
  connections: Array<{
    id: string;
    platform: string;
    username: string | null;
    displayName: string | null;
  }>;
  recentPosts: unknown[];
  memories: unknown[];
  files: Array<{
    id: string;
    filename: string;
    logicalPath: string;
    mimeType: string | null;
    sizeBytes: string;
  }>;
}

export type ContentAction =
  | { kind: "create_draft"; workspaceId: string; value: unknown }
  | {
      kind: "update_draft";
      workspaceId: string;
      postId: string;
      value: unknown;
    }
  | { kind: "schedule"; workspaceId: string; postId: string; value: unknown }
  | { kind: "publish"; workspaceId: string; postId: string };

export interface ContentSession {
  getContext(workspaceId: string): Promise<ContentContext>;
  proposeAction(action: ContentAction): Promise<{ queued: true }>;
}
