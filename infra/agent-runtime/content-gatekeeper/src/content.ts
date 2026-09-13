import {
  DurableObject,
  type RpcStub,
  RpcTarget,
  WorkerEntrypoint,
} from "cloudflare:workers";
import type {
  AccountDescription,
  ApprovalQueue,
  Gatekeeper,
  GatekeeperConnectCallback,
  GatekeeperConnectOptions,
  GatekeeperUser,
  GatekeeperUserVerifier,
  ResourceConfiguratorFrame,
  ResourceDescription,
  SupportedResource,
  VendorDescription,
} from "@gadgets/workshop-shared/gatekeeper";
import { skipRpcValidation, validateRpc } from "capnweb-validate";
import type { ContentAction, ContentSession } from "./types.js";
import TYPES_CODE from "./types-code.js";

const ICON = {
  url:
    "data:image/svg+xml," +
    encodeURIComponent(
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='%23101010'/><path d='M18 18h28v6H18zm0 11h28v6H18zm0 11h18v6H18z' fill='white'/></svg>"
    ),
};

interface Identity {
  callerEmail: string;
  displayName: string;
}
type ContentAccountProps = Identity;
interface ContentGatekeeperProps {
  callerEmail: string;
}
interface PendingAction {
  id: number;
  action: ContentAction;
}

const actionDescription = (action: ContentAction) => {
  switch (action.kind) {
    case "create_draft":
      return {
        title: "Create content draft",
        description: "Create the proposed draft in Content HQ.",
      };
    case "update_draft":
      return {
        title: "Update content draft",
        description: `Update draft ${action.postId} with the proposed content.`,
      };
    case "schedule":
      return {
        title: "Schedule content",
        description: `Schedule draft ${action.postId} for its proposed delivery time.`,
      };
    case "publish":
      return {
        title: "Publish content",
        description: `Publish draft ${action.postId} to its configured targets.`,
      };
    default:
      throw new Error("Unsupported Content HQ action");
  }
};

@validateRpc()
class ContentSessionImpl extends RpcTarget implements ContentSession {
  private readonly approvalQueue: RpcStub<ApprovalQueue>;
  private readonly callerEmail: string;
  private readonly api: Cloudflare.Env["CONTENT_API"];
  private readonly saveAction: (action: ContentAction) => Promise<number>;

  constructor(
    approvalQueue: RpcStub<ApprovalQueue>,
    callerEmail: string,
    api: Cloudflare.Env["CONTENT_API"],
    saveAction: (action: ContentAction) => Promise<number>
  ) {
    super();
    this.approvalQueue = approvalQueue;
    this.callerEmail = callerEmail;
    this.api = api;
    this.saveAction = saveAction;
  }

  async getContext(workspaceId: string) {
    await this.approvalQueue.authorizeObservation({
      title: "Read Content HQ context",
      description:
        "Read the user's content history, memory, accounts, and file metadata.",
    });
    return this.api.getContentContext({
      callerEmail: this.callerEmail,
      workspaceId,
    });
  }

  async proposeAction(action: ContentAction): Promise<{ queued: true }> {
    const id = await this.saveAction(action);
    const description = actionDescription(action);
    await this.approvalQueue.submitAction(id, {
      ...description,
      implementsRevert: false,
      awaitDecision: true,
      autoApprovable: false,
      actionKind: {
        tag: action.kind,
        label: description.title,
      },
    });
    return { queued: true };
  }

  [Symbol.dispose](): void {
    this.approvalQueue[Symbol.dispose]();
  }
}

@validateRpc()
export class ContentGatekeeper
  extends DurableObject<Cloudflare.Env, ContentGatekeeperProps>
  implements Gatekeeper<ContentSession>
{
  async describe(): Promise<ResourceDescription> {
    return {
      url: "delulu://content-hq",
      title: "Delulu Content HQ",
      snippet:
        "Workspace-scoped content, memory, files, analytics, and publishing actions.",
      suggestedBindingName: "CONTENT",
      tsType: "ContentSession",
    };
  }

  async getTypeScriptTypes(): Promise<string> {
    return TYPES_CODE;
  }
  async getAutoApprovableActions() {
    return [];
  }

  async startSession(queue: RpcStub<ApprovalQueue>): Promise<ContentSession> {
    return new ContentSessionImpl(
      queue.dup(),
      this.ctx.props.callerEmail,
      this.env.CONTENT_API,
      async (action) => {
        const id = (await this.ctx.storage.get<number>("nextActionId")) ?? 1;
        await this.ctx.storage.put(`action:${id}`, {
          id,
          action,
        } satisfies PendingAction);
        await this.ctx.storage.put("nextActionId", id + 1);
        return id;
      }
    );
  }

  async addObserver(): Promise<void> {
    // Content context is fetched on demand; there is no ambient observer stream.
  }
  async removeObserver(): Promise<void> {
    // Content context is fetched on demand; there is no ambient observer stream.
  }

  async applyAction(id: number): Promise<void> {
    const pending = await this.ctx.storage.get<PendingAction>(`action:${id}`);
    if (!pending) {
      throw new Error(`No such Content HQ action: ${id}`);
    }
    await this.env.CONTENT_API.executeContentAction({
      callerEmail: this.ctx.props.callerEmail,
      action: pending.action,
      idempotencyKey: `${this.ctx.id.toString()}:${id}`,
    });
    await this.ctx.storage.delete(`action:${id}`);
  }

  async rejectAction(id: number): Promise<void> {
    await this.ctx.storage.delete(`action:${id}`);
  }

  async revertAction(): Promise<void> {
    throw new Error("Content HQ actions are not automatically reversible.");
  }
}

@validateRpc()
export class ContentAccount
  extends WorkerEntrypoint<Cloudflare.Env, ContentAccountProps>
  implements GatekeeperUser
{
  async describe(): Promise<AccountDescription> {
    return {
      displayName: this.ctx.props.displayName,
      uniqueName: this.ctx.props.callerEmail,
      avatar: ICON,
      singleton: { tsType: "ContentSession" },
    };
  }
  async getSingletonGatekeeperClass(): Promise<
    DurableObjectClass<Gatekeeper<ContentSession>>
  > {
    return this.ctx.exports.ContentGatekeeper({
      props: { callerEmail: this.ctx.props.callerEmail },
    });
  }
  async getSupportedResources(): Promise<SupportedResource[]> {
    return [];
  }
  getGatekeeperClassFor(): never {
    throw new Error("Content HQ is a singleton.");
  }
  startResourceConfigurator(): Promise<ResourceConfiguratorFrame> {
    throw new Error("Content HQ is a singleton.");
  }
  async ensureResources(): Promise<{ url?: string }> {
    return {};
  }
  async revoke(): Promise<void> {
    // The Delulu membership remains authoritative and is checked on every call.
  }
  reconnect(): Promise<{ url: string }> {
    throw new Error("Content HQ uses the Delulu session.");
  }
  async getAuthenticatedEmail(): Promise<string> {
    return this.ctx.props.callerEmail;
  }
  @skipRpcValidation()
  async getVerifier(): Promise<Fetcher<GatekeeperUserVerifier>> {
    return this.ctx.exports.ContentVerifier({ props: this.ctx.props });
  }
}

@validateRpc()
export class ContentVerifier
  extends WorkerEntrypoint<Cloudflare.Env, ContentAccountProps>
  implements GatekeeperUserVerifier
{
  verify(): void {
    // The account is provisioned by the trusted external-user RPC.
  }
}

@validateRpc()
export class GatekeeperVendor extends WorkerEntrypoint<Cloudflare.Env> {
  async describe(): Promise<VendorDescription> {
    return {
      displayName: "Delulu",
      url: "https://delulu.social",
      logo: ICON,
      color: "#f4f0e8",
      tagline: "Your Content HQ",
      description: "Tenant-scoped content and publishing capabilities.",
      autoProvisionsAccount: false,
      providesAuth: false,
    };
  }
  @skipRpcValidation()
  async createExternalAccount(
    identity: Identity
  ): Promise<Fetcher<GatekeeperUser>> {
    return this.ctx.exports.ContentAccount({ props: identity });
  }
  connectAccount(
    _callback: Fetcher<GatekeeperConnectCallback>,
    _options?: GatekeeperConnectOptions
  ): Promise<{ url: string }> {
    throw new Error("Content HQ accounts are provisioned by Delulu.");
  }
  async getSupportedResources(): Promise<SupportedResource[]> {
    return [];
  }
  async getTypeScriptTypes(): Promise<string> {
    return TYPES_CODE;
  }
}
