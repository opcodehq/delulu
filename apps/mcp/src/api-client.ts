/**
 * REST API client — wraps the Delulu public API.
 */
import {
  type ApiClient,
  applyTwitterPostOptions,
  createApiClient,
  makeSimplePostWrite,
  runEffect,
  type SimplePostConnection,
  type TwitterPostOptions,
} from "@delulu/client";

const TRAILING_SLASH = /\/$/;

export class DeluluApiClient {
  private readonly client: ApiClient;
  private workspaceId: string | undefined;

  constructor(
    baseUrl: string,
    token: string | (() => string | Promise<string>)
  ) {
    const resolvedBaseUrl = baseUrl.replace(TRAILING_SLASH, "");
    const getToken = typeof token === "function" ? token : () => token;
    this.client = createApiClient({
      baseUrl: resolvedBaseUrl,
      getToken,
    });
  }

  private async resolveWorkspaceId(requested?: string) {
    if (requested) {
      return requested;
    }
    if (this.workspaceId) {
      return this.workspaceId;
    }
    const configured = process.env.DELULU_WORKSPACE_ID;
    if (configured) {
      this.workspaceId = configured;
      return configured;
    }
    const memberships = await runEffect(this.client.me.workspaces());
    if (memberships.data.length !== 1) {
      throw new Error(
        "Multiple workspaces are available. Pass workspaceId explicitly."
      );
    }
    this.workspaceId = memberships.data[0]?.workspaceId;
    if (!this.workspaceId) {
      throw new Error("No workspace is available for this account.");
    }
    return this.workspaceId;
  }

  async listWorkspaces() {
    return runEffect(this.client.me.workspaces());
  }

  async getInstanceCapabilities() {
    return runEffect(this.client.instance.capabilities());
  }

  async getSetupStatus(workspaceId?: string) {
    const resolved = await this.resolveWorkspaceId(workspaceId);
    const [instance, setup] = await Promise.all([
      this.getInstanceCapabilities(),
      runEffect(this.client.me.setup({ params: { workspaceId: resolved } })),
    ]);
    return { instance, setup };
  }

  // Posts
  async listPosts(params?: {
    status?: string;
    limit?: number;
    cursor?: string;
    workspaceId?: string;
  }) {
    const offset =
      params?.cursor === undefined ? undefined : Number(params.cursor);
    if (offset !== undefined && !Number.isSafeInteger(offset)) {
      throw new Error("The workspace API accepts a numeric pagination cursor.");
    }
    const workspaceId = await this.resolveWorkspaceId(params?.workspaceId);
    return runEffect(
      this.client.posts.list({
        params: { workspaceId },
        query: {
          ...(params?.status ? { status: params.status } : {}),
          ...(params?.limit ? { limit: params.limit } : {}),
          ...(offset === undefined ? {} : { offset }),
        },
      })
    );
  }

  async getPost(id: string, workspaceId?: string) {
    const resolvedWorkspaceId = await this.resolveWorkspaceId(workspaceId);
    return runEffect(
      this.client.posts.get({
        params: { workspaceId: resolvedWorkspaceId, id },
      })
    );
  }

  async createPost(
    data: McpPostInput & {
      workspaceId?: string;
      intent?: "draft" | "schedule" | "publish_now";
    }
  ) {
    const workspaceId = await this.resolveWorkspaceId(data.workspaceId);
    const connections = await this.selectedConnections(
      workspaceId,
      data.socialProviderIds
    );
    const payload = makeSimplePostWrite({
      caption: data.content.map((segment) => segment.text).join("\n\n"),
      connections: applyTwitterPostOptions(connections, data.x),
      mediaIds: data.content.flatMap((segment) =>
        segment.media.map((media) => media.id)
      ),
      scheduledAt:
        data.status === "SCHEDULED" && data.scheduledAt
          ? new Date(data.scheduledAt * 1000).toISOString()
          : null,
      privacy: data.privacyStatus,
      intent: data.intent,
    });
    return runEffect(
      this.client.posts.create({ params: { workspaceId }, payload })
    );
  }

  async updatePost(
    id: string,
    data: Partial<McpPostInput> & { workspaceId?: string }
  ) {
    const workspaceId = await this.resolveWorkspaceId(data.workspaceId);
    const current = await runEffect(
      this.client.posts.get({ params: { workspaceId, id } })
    );
    const connectionIds = data.socialProviderIds ?? [
      ...new Set(current.targets.map((target) => target.connectionId)),
    ];
    const selected = await this.selectedConnections(workspaceId, connectionIds);
    // Keep each target's saved settings so an edit does not reset them. A new
    // privacy value rebuilds non-X settings, which is where privacy lives.
    const connections = selected.map((connection): SimplePostConnection => {
      const saved = current.targets.find(
        (target) => target.connectionId === connection.id
      )?.settings;
      return saved &&
        (data.privacyStatus === undefined || saved.platform === "TWITTER")
        ? { id: connection.id, platform: connection.platform, settings: saved }
        : connection;
    });
    const currentCaption = current.groups
      .flatMap((group) => group.segments.map((segment) => segment.text))
      .join("\n\n");
    const currentMediaIds = current.groups.flatMap((group) =>
      group.segments.flatMap((segment) =>
        segment.media.map((media) => media.id)
      )
    );
    const payload = makeSimplePostWrite({
      caption:
        data.content?.map((segment) => segment.text).join("\n\n") ??
        currentCaption,
      mediaIds:
        data.content?.flatMap((segment) =>
          segment.media.map((media) => media.id)
        ) ?? currentMediaIds,
      connections: applyTwitterPostOptions(connections, data.x),
      scheduledAt:
        data.status === "SAVED"
          ? null
          : data.scheduledAt
            ? new Date(data.scheduledAt * 1000).toISOString()
            : current.targets[0]?.scheduledAt,
      privacy: data.privacyStatus,
    });
    return runEffect(
      this.client.posts.update({ params: { workspaceId, id }, payload })
    );
  }

  async deletePost(id: string, workspaceId?: string) {
    const resolvedWorkspaceId = await this.resolveWorkspaceId(workspaceId);
    return runEffect(
      this.client.posts.remove({
        params: { workspaceId: resolvedWorkspaceId, id },
      })
    );
  }

  // Accounts
  async publishPostNow(id: string, workspaceId?: string) {
    const resolvedWorkspaceId = await this.resolveWorkspaceId(workspaceId);
    return runEffect(
      this.client.posts.publishNow({
        params: { workspaceId: resolvedWorkspaceId, id },
      })
    );
  }

  async listAccounts(workspaceId?: string) {
    const resolvedWorkspaceId = await this.resolveWorkspaceId(workspaceId);
    return runEffect(
      this.client.connections.list({
        params: { workspaceId: resolvedWorkspaceId },
        query: {},
      })
    );
  }

  async getAccount(id: string, workspaceId?: string) {
    const result = await this.listAccounts(workspaceId);
    const account = result.data.find((item) => item.id === id);
    if (!account) {
      throw new Error(`Connection ${id} was not found in the workspace`);
    }
    return account;
  }

  async connectAccount(
    platform: string,
    options: { workspaceId?: string; includeInsights?: boolean } = {}
  ) {
    const workspaceId = await this.resolveWorkspaceId(options.workspaceId);
    return runEffect(
      this.client.connections.mint({
        params: { workspaceId, platform },
        payload: { includeInsights: options.includeInsights, client: "mcp" },
      })
    );
  }

  async createCheckout(input: {
    workspaceId?: string;
    plan: "ECHO" | "VIBE";
    interval: "MONTHLY" | "YEARLY";
    currency: "USD" | "INR";
  }) {
    const workspaceId = await this.resolveWorkspaceId(input.workspaceId);
    return runEffect(
      this.client.billing.checkout({
        params: { workspaceId },
        payload: {
          plan: input.plan,
          interval: input.interval,
          currency: input.currency,
        },
      })
    );
  }

  async importMedia(input: {
    workspaceId?: string;
    url: string;
    filename?: string;
    altText?: string;
    idempotencyKey?: string;
  }) {
    const workspaceId = await this.resolveWorkspaceId(input.workspaceId);
    return runEffect(
      this.client.media.import({
        params: { workspaceId },
        payload: {
          url: input.url,
          filename: input.filename,
          altText: input.altText,
          idempotencyKey: input.idempotencyKey,
        },
      })
    );
  }

  async createMediaUpload(input: {
    workspaceId?: string;
    filename: string;
    contentType: string;
    altText?: string;
  }) {
    const workspaceId = await this.resolveWorkspaceId(input.workspaceId);
    const uploads = await runEffect(
      this.client.media.uploads({
        params: { workspaceId },
        payload: [
          {
            filename: input.filename,
            contentType: input.contentType,
            altText: input.altText,
          },
        ],
      })
    );
    return { workspaceId, upload: uploads[0] };
  }

  async completeMediaUpload(workspaceId: string, mediaId: string) {
    return runEffect(
      this.client.media.complete({
        params: { workspaceId },
        payload: [{ mediaId }],
      })
    );
  }

  // Stats
  async getUsage(requestedWorkspaceId?: string) {
    const workspaceId = await this.resolveWorkspaceId(requestedWorkspaceId);
    return runEffect(this.client.billing.usage({ params: { workspaceId } }));
  }

  async getSubscription(requestedWorkspaceId?: string) {
    const workspaceId = await this.resolveWorkspaceId(requestedWorkspaceId);
    return runEffect(
      this.client.billing.subscription({ params: { workspaceId } })
    );
  }

  private async selectedConnections(
    workspaceId: string,
    connectionIds: readonly string[]
  ) {
    const result = await runEffect(
      this.client.connections.list({ params: { workspaceId }, query: {} })
    );
    return connectionIds.map((id) => {
      const connection = result.data.find((item) => item.id === id);
      if (!connection) {
        throw new Error(`Connection ${id} was not found in the workspace`);
      }
      return connection;
    });
  }
}

interface McpPostInput {
  readonly content: readonly {
    readonly text: string;
    readonly media: readonly { readonly id: string }[];
  }[];
  readonly socialProviderIds: readonly string[];
  readonly status: "SAVED" | "SCHEDULED";
  readonly scheduledAt?: number;
  readonly privacyStatus?: string;
  readonly x?: TwitterPostOptions;
}
