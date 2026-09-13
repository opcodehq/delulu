import type { ContentAction, ContentContext } from "./types.js";

interface ContentApiBinding {
  getContentContext(input: {
    callerEmail: string;
    workspaceId: string;
  }): Promise<ContentContext>;
  executeContentAction(input: {
    callerEmail: string;
    action: ContentAction;
    idempotencyKey: string;
  }): Promise<unknown>;
}

declare global {
  namespace Cloudflare {
    interface GlobalProps {
      mainModule: typeof import("./index.js");
      durableNamespaces: "ContentGatekeeper";
    }
    interface Env {
      CONTENT_API: ContentApiBinding;
    }
  }
}

export {};
