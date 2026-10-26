import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import { DeluluApiClient } from "./api-client.js";
import { registerPostTools } from "./tools/posts.js";

const workspaceId = "workspace_aaaaaaaaaaaa";
const x = { id: "connection_twitter0001", platform: "TWITTER" };
const linkedin = { id: "connection_linkedin001", platform: "LINKEDIN" };

const fakeApi = (targets: readonly unknown[] = []) => {
  const create = vi.fn((request: unknown) => Effect.succeed(request));
  const update = vi.fn((request: unknown) => Effect.succeed(request));
  const api = {
    connections: {
      list: () => Effect.succeed({ data: [x, linkedin] }),
    },
    posts: {
      create,
      update,
      get: () =>
        Effect.succeed({
          groups: [{ segments: [{ text: "Saved body", media: [] }] }],
          targets,
        }),
    },
  };
  const client = new DeluluApiClient("https://api.test", "token");
  Reflect.set(client, "client", api);
  return { client, create, update };
};

const targetSettings = (request: unknown) =>
  (
    request as {
      payload: { targets: { connectionId: string; settings: unknown }[] };
    }
  ).payload.targets.map(({ connectionId, settings }) => ({
    connectionId,
    settings,
  }));

const connectTools = async (client: DeluluApiClient) => {
  const server = new McpServer({ name: "test", version: "1.0.0" });
  registerPostTools(server, client);
  const [serverTransport, clientTransport] =
    InMemoryTransport.createLinkedPair();
  const mcp = new Client({ name: "test-client", version: "1.0.0" });
  await Promise.all([
    server.connect(serverTransport),
    mcp.connect(clientTransport),
  ]);
  return mcp;
};

describe("MCP X options", () => {
  it("create_post quotes from X targets only", async () => {
    const { client, create } = fakeApi();
    const mcp = await connectTools(client);
    const result = await mcp.callTool({
      name: "create_post",
      arguments: {
        workspaceId,
        content: [{ order: 0, name: "Post", text: "Quoting", media: [] }],
        socialProviderIds: [x.id, linkedin.id],
        x: {
          quotePost: "https://x.com/wiz/status/1234567890123456789",
          replyRestriction: "following",
        },
      },
    });
    expect(result.isError).toBeFalsy();
    expect(targetSettings(create.mock.calls[0]?.[0])).toEqual([
      {
        connectionId: x.id,
        settings: {
          platform: "TWITTER",
          values: {
            replyRestriction: "following",
            quoteTweetId: "https://x.com/wiz/status/1234567890123456789",
          },
        },
      },
      {
        connectionId: linkedin.id,
        settings: { platform: "LINKEDIN", values: { visibility: "PUBLIC" } },
      },
    ]);
  });

  it("create_post publishes an Article title as an X Article", async () => {
    const { client, create } = fakeApi();
    const mcp = await connectTools(client);
    await mcp.callTool({
      name: "create_post",
      arguments: {
        workspaceId,
        content: [{ order: 0, name: "Post", text: "Body", media: [] }],
        socialProviderIds: [x.id],
        x: { articleTitle: "Long read" },
      },
    });
    expect(targetSettings(create.mock.calls[0]?.[0])[0]?.settings).toEqual({
      platform: "TWITTER",
      values: {
        replyRestriction: "everyone",
        quoteTweetId: "",
        format: "article",
        articleTitle: "Long read",
      },
    });
  });

  it("create_post reports X options without an X target as a tool error", async () => {
    const { client, create } = fakeApi();
    const mcp = await connectTools(client);
    const result = await mcp.callTool({
      name: "create_post",
      arguments: {
        workspaceId,
        content: [{ order: 0, name: "Post", text: "Body", media: [] }],
        socialProviderIds: [linkedin.id],
        x: { quotePost: "123" },
      },
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("at least one X account");
    expect(create).not.toHaveBeenCalled();
  });

  it("update_post keeps saved target settings and applies X changes", async () => {
    const saved = {
      platform: "TWITTER",
      values: {
        replyRestriction: "mentioned",
        quoteTweetId: "1234567890123456789",
      },
    };
    const { client, update } = fakeApi([
      { connectionId: x.id, settings: saved, scheduledAt: null },
    ]);
    await client.updatePost("post_aaaaaaaaaaaa", { workspaceId });
    expect(targetSettings(update.mock.calls[0]?.[0])).toEqual([
      { connectionId: x.id, settings: saved },
    ]);

    await client.updatePost("post_aaaaaaaaaaaa", {
      workspaceId,
      x: { replyRestriction: "everyone" },
    });
    expect(targetSettings(update.mock.calls[1]?.[0])).toEqual([
      {
        connectionId: x.id,
        settings: {
          platform: "TWITTER",
          values: {
            replyRestriction: "everyone",
            quoteTweetId: "1234567890123456789",
          },
        },
      },
    ]);
  });
});
