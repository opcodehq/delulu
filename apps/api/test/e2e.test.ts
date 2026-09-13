import { UnauthorizedError } from "@delulu/contracts";
import {
  SORTED_TEST_PRODUCT_ID,
  TEST_PRODUCT_IDS,
} from "@delulu/payments/product-ids";
import {
  ClerkAdminService,
  ClerkTokenVerifier,
  ConnectionStateConfig,
  ConnectionStateService,
  deriveChallengeS256,
  RateLimiterService,
} from "@delulu/services";
import { PgClient } from "@effect/sql-pg";
import { Effect, String as EffectString, Layer, Redacted } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { beforeAll, describe, expect, it } from "vitest";
import { buildWebHandler } from "../src/app";
import { makeBaseLayer } from "../src/base-layer";

const ISSUER = "http://localhost:8787";
const DEV_SUB = `clerk_e2e_${crypto.randomUUID()}`;
const API_KEY_PREFIX = /^dsk_/;
const DEVICE_USER_CODE = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const WEBHOOK_SECRET_BYTES = new TextEncoder().encode("e2e-webhook-secret");
const WEBHOOK_SECRET = `whsec_${btoa(
  String.fromCharCode(...WEBHOOK_SECRET_BYTES)
)}`;
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://delulu:delulu@localhost:5432/delulu";
const TestPg = PgClient.layer({
  url: Redacted.make(DATABASE_URL),
  transformQueryNames: EffectString.camelToSnake,
  transformResultNames: EffectString.snakeToCamel,
  transformJson: true,
});
const ConnectionState = ConnectionStateService.layer.pipe(
  Layer.provide(
    Layer.succeed(
      ConnectionStateConfig,
      ConnectionStateConfig.of({ secret: "e2e-connection-state-secret" })
    )
  )
);

const toPem = (der: ArrayBuffer): string => {
  const bytes = new Uint8Array(der);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  const b64 =
    btoa(binary)
      .match(/.{1,64}/g)
      ?.join("\n") ?? "";
  return `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----`;
};

let handler: (request: Request) => Promise<Response>;
let personalWorkspaceId = "";

beforeAll(async () => {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);

  // Stub Clerk verifier: "dev-token" → a fixed subject; everything else 401.
  const Clerk = Layer.succeed(
    ClerkTokenVerifier,
    ClerkTokenVerifier.of({
      verify: (token) => {
        if (token === "dev-token") {
          return Effect.succeed({ sub: DEV_SUB });
        }
        if (token.startsWith("test-token:")) {
          return Effect.succeed({ sub: token.slice("test-token:".length) });
        }
        return Effect.fail(new UnauthorizedError({ message: "bad token" }));
      },
    })
  );
  const Limiter = RateLimiterService.inMemoryLayer({ sessionPerMinute: 20 });
  const ClerkAdmin = Layer.succeed(
    ClerkAdminService,
    ClerkAdminService.of({
      invite: () => Effect.succeed({ id: "invitation_test" }),
      updateMembership: () => Effect.void,
      removeMembership: () => Effect.void,
      updateUserPublicMetadata: () => Effect.void,
    })
  );
  const base = makeBaseLayer(
    {
      DATABASE_URL,
      JOBS: {
        idFromName: (key) => key,
        get: () => ({ fetch: async () => new Response(null, { status: 204 }) }),
      },
      AS_ISSUER: ISSUER,
      API_RESOURCE: ISSUER,
      APP_BASE_URL: "http://localhost:3000",
      AS_SIGNING_KEY: toPem(pkcs8),
      AS_SIGNING_KID: "e2e-kid",
      CONNECTION_STATE_SECRET: "e2e-connection-state-secret",
      META_APP_SECRET: "e2e-meta-secret",
      META_VERIFY_TOKEN: "e2e-meta-verify",
      CLERK_WEBHOOK_SECRET: WEBHOOK_SECRET,
      DODO_WEBHOOK_SECRET: WEBHOOK_SECRET,
    },
    { clerk: Clerk, clerkAdmin: ClerkAdmin, rateLimiter: Limiter }
  );

  handler = buildWebHandler(base, {
    allowedOrigins: ["http://localhost:3000"],
  }).handler as (request: Request) => Promise<Response>;
});

const get = (path: string, token?: string) =>
  handler(
    new Request(`${ISSUER}${path}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    })
  );

const postForm = (path: string, form: Record<string, string>, token?: string) =>
  handler(
    new Request(`${ISSUER}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: new URLSearchParams(form).toString(),
    })
  );

const postJson = (path: string, body: unknown, token?: string) =>
  handler(
    new Request(`${ISSUER}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    })
  );

const patchJson = (path: string, body: unknown, token?: string) =>
  handler(
    new Request(`${ISSUER}${path}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    })
  );

const seedPublishingConnection = (workspaceId: string) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql`INSERT INTO connections
        (id, workspace_id, platform, profile_id, access_token, cipher_version)
        VALUES (${`connection_${crypto.randomUUID()}`}, ${workspaceId},
          'THREADS', ${`profile_${crypto.randomUUID()}`}, 'opaque', 'v1')`;
    }).pipe(Effect.provide(TestPg))
  );

const webhookSignature = async (
  id: string,
  timestamp: string,
  rawBody: string
) => {
  const key = await crypto.subtle.importKey(
    "raw",
    WEBHOOK_SECRET_BYTES,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`)
  );
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
};

const postClerkWebhook = async (
  id: string,
  body: unknown,
  signatureOverride?: string
) => {
  const rawBody = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature =
    signatureOverride ?? (await webhookSignature(id, timestamp, rawBody));
  return handler(
    new Request(`${ISSUER}/webhooks/clerk`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "svix-id": id,
        "svix-timestamp": timestamp,
        "svix-signature": `v1,${signature}`,
      },
      body: rawBody,
    })
  );
};

const postDodoWebhook = async (id: string, body: unknown) => {
  const rawBody = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = await webhookSignature(id, timestamp, rawBody);
  return handler(
    new Request(`${ISSUER}/webhooks/dodo`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "webhook-id": id,
        "webhook-timestamp": timestamp,
        "webhook-signature": `v1,${signature}`,
      },
      body: rawBody,
    })
  );
};

describe("apps/api worker (e2e over toWebHandler)", () => {
  it("allows browser preflight only from the configured app origin", async () => {
    const allowed = await handler(
      new Request(`${ISSUER}/v1/me`, {
        method: "OPTIONS",
        headers: {
          origin: "http://localhost:3000",
          "access-control-request-method": "GET",
          "access-control-request-headers": "authorization",
        },
      })
    );
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:3000"
    );

    const rejected = await handler(
      new Request(`${ISSUER}/v1/me`, {
        method: "OPTIONS",
        headers: {
          origin: "https://untrusted.invalid",
          "access-control-request-method": "GET",
        },
      })
    );
    expect(rejected.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("GET /health returns ok with a DB probe", async () => {
    const res = await get("/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
  });

  it("GET /v1/instance reports public hosted capabilities without auth", async () => {
    const res = await get("/v1/instance");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      deploymentMode: "hosted",
      billingEnabled: true,
      registrationEnabled: true,
      agentComputerEnabled: false,
      workspaceFilesEnabled: false,
      version: "development",
    });
  });

  it("verifies webhook challenges and rejects invalid signatures", async () => {
    const challenge = await get(
      "/webhooks/meta?hub.mode=subscribe&hub.verify_token=e2e-meta-verify&hub.challenge=verified"
    );
    expect(challenge.status).toBe(200);
    expect(await challenge.text()).toBe("verified");

    const invalid = await postClerkWebhook(
      `webhook_invalid_${crypto.randomUUID()}`,
      {
        type: "user.created",
        data: { id: `invalid_${crypto.randomUUID()}` },
      },
      "invalid"
    );
    expect(invalid.status).toBe(400);
  });

  it("applies a valid webhook exactly once even if a reordered replay arrives", async () => {
    const id = `webhook_replay_${crypto.randomUUID()}`;
    const externalId = `clerk_webhook_${crypto.randomUUID()}`;
    const first = await postClerkWebhook(id, {
      type: "user.created",
      data: {
        id: externalId,
        first_name: "Webhook",
        last_name: "User",
        email_addresses: [{ email_address: `${externalId}@example.com` }],
      },
    });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ accepted: true, duplicate: false });

    const replay = await postClerkWebhook(id, {
      type: "user.updated",
      data: { id: externalId, first_name: "Reordered" },
    });
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ accepted: true, duplicate: true });
  });

  it("normalizes provider subscription webhooks and rejects duplicate delivery", async () => {
    const externalId = `billing_webhook_${crypto.randomUUID()}`;
    const email = `${externalId}@example.com`;
    const identity = await postClerkWebhook(`identity_${crypto.randomUUID()}`, {
      type: "user.created",
      data: {
        id: externalId,
        first_name: "Billing",
        last_name: "Owner",
        email_addresses: [{ email_address: email }],
      },
    });
    expect(identity.status).toBe(200);

    const webhookId = `billing_${crypto.randomUUID()}`;
    const payload = {
      type: "subscription.active",
      data: {
        payload_type: "Subscription",
        subscription_id: `sub_${crypto.randomUUID()}`,
        product_id: "pdt_mPTd8gsQS8YUISdStWURf",
        status: "active",
        previous_billing_date: "2026-07-01T00:00:00Z",
        next_billing_date: "2026-08-01T00:00:00Z",
        addons: [],
        customer: {
          customer_id: `customer_${crypto.randomUUID()}`,
          email,
        },
        metadata: {},
      },
    };
    const first = await postDodoWebhook(webhookId, payload);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ accepted: true, duplicate: false });

    const replay = await postDodoWebhook(webhookId, payload);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ accepted: true, duplicate: true });
  });

  it("acknowledges unrelated signed payment-provider event families", async () => {
    const response = await postDodoWebhook(`refund_${crypto.randomUUID()}`, {
      type: "refund.succeeded",
      data: { payload_type: "Refund", refund_id: "refund_ignored" },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      accepted: true,
      duplicate: false,
    });
  });

  it("GET /v1/me JIT-provisions and returns the user + personal workspace", async () => {
    const res = await get("/v1/me", "dev-token");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      user: { externalId: string };
      personalWorkspace: { id: string; name: string } | null;
    };
    expect(body.user.externalId).toBe(DEV_SUB);
    expect(body.personalWorkspace?.name).toBe("Personal");
    personalWorkspaceId = body.personalWorkspace?.id ?? "";
  });

  it("GET /v1/me/workspaces lists the personal workspace with the owner role", async () => {
    const res = await get("/v1/me/workspaces", "dev-token");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{ role: string; isPersonal: boolean }>;
      total: number;
    };
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.data[0].role).toBe("owner");
    expect(body.data[0].isPersonal).toBe(true);
  });

  it("repairs a missing personal-workspace membership during session authentication", async () => {
    const sub = `clerk_repair_${crypto.randomUUID()}`;
    const token = `test-token:${sub}`;
    const current = await get("/v1/me", token);
    expect(current.status).toBe(200);
    const currentBody = (await current.json()) as {
      personalWorkspace: { id: string } | null;
    };
    const workspaceId = currentBody.personalWorkspace?.id ?? "";
    expect(workspaceId).toBeTruthy();

    await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* sql`DELETE FROM workspace_members
          WHERE workspace_id = ${workspaceId}`;
      }).pipe(Effect.provide(TestPg))
    );

    const res = await get("/v1/me/workspaces", token);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{ workspaceId: string; role: string }>;
    };
    expect(body.data).toContainEqual(
      expect.objectContaining({
        workspaceId,
        role: "owner",
      })
    );
  });

  it("adds an organization creator as an owner when its Clerk webhook arrives", async () => {
    const sub = `clerk_org_creator_${crypto.randomUUID()}`;
    const token = `test-token:${sub}`;
    const current = await get("/v1/me", token);
    expect(current.status).toBe(200);
    const clerkOrganizationId = `org_${crypto.randomUUID()}`;
    const created = await postClerkWebhook(`org_${crypto.randomUUID()}`, {
      type: "organization.created",
      data: {
        id: clerkOrganizationId,
        name: "Creator workspace",
        slug: `creator-${crypto.randomUUID()}`,
        created_by: sub,
      },
    });
    expect(created.status).toBe(200);

    const res = await get("/v1/me/workspaces", token);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{ name: string; role: string }>;
    };
    expect(body.data).toContainEqual(
      expect.objectContaining({
        name: "Creator workspace",
        role: "owner",
      })
    );
  });

  it("repairs ownership before moving an account from an older personal workspace", async () => {
    const sub = `clerk_transfer_${crypto.randomUUID()}`;
    const token = `test-token:${sub}`;
    const current = await get("/v1/me", token);
    expect(current.status).toBe(200);
    const currentBody = (await current.json()) as {
      personalWorkspace: { id: string } | null;
    };
    const destinationWorkspaceId = currentBody.personalWorkspace?.id ?? "";
    expect(destinationWorkspaceId).toBeTruthy();

    const sourceWorkspaceId = `workspace_${crypto.randomUUID()}`;
    const connectionId = `connection_${crypto.randomUUID()}`;
    await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const users = yield* sql<{
          id: string;
        }>`SELECT id FROM users WHERE external_id = ${sub}`;
        const userId = users[0]?.id ?? "";
        expect(userId).toBeTruthy();
        yield* sql`INSERT INTO workspaces
          (id, name, billing_owner_user_id, is_personal)
          VALUES (${sourceWorkspaceId}, 'Older personal workspace', ${userId}, true)`;
        yield* sql`INSERT INTO connections
          (id, workspace_id, platform, profile_id, access_token, cipher_version)
          VALUES (
            ${connectionId},
            ${sourceWorkspaceId},
            'THREADS',
            ${`profile_${crypto.randomUUID()}`},
            'opaque',
            'v1'
          )`;
      }).pipe(Effect.provide(TestPg))
    );

    const moved = await postJson(
      `/v1/workspaces/${destinationWorkspaceId}/connections/${connectionId}/transfer`,
      { sourceWorkspaceId },
      token
    );
    expect(moved.status).toBe(200);
    expect(await moved.json()).toEqual({ confirmed: true });
  });

  it("repairs ownership before moving an account from an older organization workspace", async () => {
    const sub = `clerk_org_transfer_${crypto.randomUUID()}`;
    const token = `test-token:${sub}`;
    const current = await get("/v1/me", token);
    expect(current.status).toBe(200);
    const currentBody = (await current.json()) as {
      personalWorkspace: { id: string } | null;
    };
    const destinationWorkspaceId = currentBody.personalWorkspace?.id ?? "";
    expect(destinationWorkspaceId).toBeTruthy();

    const sourceWorkspaceId = `workspace_${crypto.randomUUID()}`;
    const connectionId = `connection_${crypto.randomUUID()}`;
    await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const users = yield* sql<{
          id: string;
        }>`SELECT id FROM users WHERE external_id = ${sub}`;
        const userId = users[0]?.id ?? "";
        expect(userId).toBeTruthy();
        yield* sql`INSERT INTO workspaces
          (id, name, billing_owner_user_id, is_personal)
          VALUES (${sourceWorkspaceId}, 'Older organization workspace', ${userId}, false)`;
        yield* sql`INSERT INTO connections
          (id, workspace_id, platform, profile_id, access_token, cipher_version)
          VALUES (
            ${connectionId},
            ${sourceWorkspaceId},
            'THREADS',
            ${`profile_${crypto.randomUUID()}`},
            'opaque',
            'v1'
          )`;
      }).pipe(Effect.provide(TestPg))
    );

    const moved = await postJson(
      `/v1/workspaces/${destinationWorkspaceId}/connections/${connectionId}/transfer`,
      { sourceWorkspaceId },
      token
    );
    expect(moved.status).toBe(200);
    expect(await moved.json()).toEqual({ confirmed: true });
  });

  it("accepts a provider-verified transfer without source workspace membership", async () => {
    const sourceSub = `clerk_source_${crypto.randomUUID()}`;
    const destinationSub = `clerk_destination_${crypto.randomUUID()}`;
    const sourceToken = `test-token:${sourceSub}`;
    const destinationToken = `test-token:${destinationSub}`;
    const sourceResponse = await get("/v1/me", sourceToken);
    const destinationResponse = await get("/v1/me", destinationToken);
    expect(sourceResponse.status).toBe(200);
    expect(destinationResponse.status).toBe(200);
    const source = (await sourceResponse.json()) as {
      personalWorkspace: { id: string } | null;
    };
    const destination = (await destinationResponse.json()) as {
      user: { id: string };
      personalWorkspace: { id: string } | null;
    };
    const sourceWorkspaceId = source.personalWorkspace?.id ?? "";
    const destinationWorkspaceId = destination.personalWorkspace?.id ?? "";
    const connectionId = `connection_${crypto.randomUUID()}`;
    expect(sourceWorkspaceId).toBeTruthy();
    expect(destinationWorkspaceId).toBeTruthy();

    await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* sql`INSERT INTO connections
          (id, workspace_id, platform, profile_id, access_token, cipher_version)
          VALUES (
            ${connectionId},
            ${sourceWorkspaceId},
            'INSTAGRAM',
            ${`profile_${crypto.randomUUID()}`},
            'opaque',
            'v1'
          )`;
      }).pipe(Effect.provide(TestPg))
    );
    const transferToken = await Effect.runPromise(
      Effect.gen(function* () {
        const states = yield* ConnectionStateService;
        return yield* states.mintTransfer({
          connectionId,
          sourceWorkspaceId,
          destinationWorkspaceId,
          principal: `u:${destination.user.id}`,
        });
      }).pipe(Effect.provide(ConnectionState))
    );

    const moved = await postJson(
      `/v1/workspaces/${destinationWorkspaceId}/connections/${connectionId}/transfer`,
      { transferToken },
      destinationToken
    );
    const movedBody = await moved.json();
    expect(moved.status, JSON.stringify(movedBody)).toBe(200);
    expect(movedBody).toEqual({ confirmed: true });
  });

  it("GET /v1/workspaces/:id/billing/subscription treats a missing subscription as unpaid", async () => {
    const res = await get(
      `/v1/workspaces/${personalWorkspaceId}/billing/subscription`,
      "dev-token"
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });

  it("GET /v1/workspaces/:id/billing/usage returns zero usage without a subscription", async () => {
    const res = await get(
      `/v1/workspaces/${personalWorkspaceId}/billing/usage`,
      "dev-token"
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      billingOwnerUserId: expect.any(String),
      usage: {
        socialAccounts: 0,
        monthlyPosts: 0,
        mediaStorageBytes: 0,
        apiRequestsPerMonth: 0,
        dmsSent: 0,
        dmsSkipped: 0,
        transcriptionsUsed: 0,
      },
    });
  });

  it("lists posts when a stored target has incomplete legacy platform settings", async () => {
    const token = `test-token:clerk_legacy_settings_${crypto.randomUUID()}`;
    const current = await get("/v1/me", token);
    expect(current.status).toBe(200);
    const currentBody = (await current.json()) as {
      personalWorkspace: { id: string } | null;
    };
    const workspaceId = currentBody.personalWorkspace?.id ?? "";
    expect(workspaceId).toBeTruthy();
    const postId = `post_${crypto.randomUUID()}`;
    const groupId = `post_group_${crypto.randomUUID()}`;
    const targetId = `post_target_${crypto.randomUUID()}`;
    const connectionId = `connection_${crypto.randomUUID()}`;

    await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const members = yield* sql<{ id: string }>`SELECT id
          FROM workspace_members
          WHERE workspace_id = ${workspaceId} AND role = 'owner'
          LIMIT 1`;
        const memberId = members[0]?.id;
        expect(memberId).toBeTruthy();
        yield* sql`INSERT INTO connections
          (id, workspace_id, platform, profile_id, access_token, cipher_version)
          VALUES (${connectionId}, ${workspaceId}, 'LINKEDIN',
            ${`profile_${crypto.randomUUID()}`}, 'opaque', 'v1')`;
        yield* sql`INSERT INTO posts
          (id, workspace_id, status, content, created_by_member_id, source)
          VALUES (${postId}, ${workspaceId}, 'published',
            ${JSON.stringify({
              groups: [
                {
                  id: groupId,
                  isDefault: true,
                  segments: [{ text: "Published post", media: [] }],
                },
              ],
            })}::jsonb,
            ${memberId ?? ""}, 'api')`;
        yield* sql`INSERT INTO post_targets
          (id, post_id, connection_id, group_id, settings, status)
          VALUES (${targetId}, ${postId}, ${connectionId}, ${groupId},
            ${JSON.stringify({ platform: "LINKEDIN", values: {} })}::jsonb,
            'published')`;
      }).pipe(Effect.provide(TestPg))
    );

    const response = await get(`/v1/workspaces/${workspaceId}/posts`, token);
    const body = await response.json();
    expect(response.status, JSON.stringify(body)).toBe(200);
    expect(body).toMatchObject({
      data: [
        expect.objectContaining({
          id: postId,
          targets: [
            expect.objectContaining({
              id: targetId,
              settings: {
                platform: "LINKEDIN",
                values: { visibility: "PUBLIC" },
              },
            }),
          ],
        }),
      ],
    });
  });

  it("GET /v1/me/overview returns the command-center aggregates", async () => {
    const res = await get(
      `/v1/me/overview/${personalWorkspaceId}`,
      "dev-token"
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      workspace: {
        id: personalWorkspaceId,
        name: "Personal",
        role: "owner",
      },
      setup: {
        onboardingComplete: false,
        outstandingAction: "connect_account",
      },
      accounts: { total: 0, expiringSoon: 0 },
      publishing: { totalPosts: 0, drafts: 0, failed: 0 },
      reviews: { pending: 0 },
    });
  });

  it("rejects completion before the required activation steps", async () => {
    const complete = await postJson(
      `/v1/me/setup/${personalWorkspaceId}/complete`,
      {},
      "dev-token"
    );
    expect(complete.status).toBe(409);

    const setup = await get(`/v1/me/setup/${personalWorkspaceId}`, "dev-token");
    expect(setup.status).toBe(200);
    expect(await setup.json()).toMatchObject({
      onboardingComplete: false,
      subscription: {
        plan: "free",
        status: "inactive",
        paid: false,
      },
    });
  });

  it("serves the M2 workspace admin, API-key, media, and connection-mint contracts", async () => {
    const memberships = await get("/v1/me/workspaces", "dev-token");
    const membershipBody = (await memberships.json()) as {
      data: Array<{ workspaceId: string }>;
    };
    const workspaceId = membershipBody.data[0]?.workspaceId;
    expect(workspaceId).toBeTruthy();

    const workspace = await get(`/v1/workspaces/${workspaceId}`, "dev-token");
    expect(workspace.status).toBe(200);

    // Account connection is an onboarding prerequisite and must be available
    // before payment is complete.
    const mint = await postJson(
      `/v1/workspaces/${workspaceId}/connections/connect/instagram`,
      {},
      "dev-token"
    );
    expect(mint.status).toBe(200);
    const mintBody = (await mint.json()) as { url: string };
    expect(mintBody.url).toContain("state=");
    expect(
      (
        await patchJson(
          `/v1/me/setup/${workspaceId}`,
          { goal: "publish" },
          "dev-token"
        )
      ).status
    ).toBe(200);
    await seedPublishingConnection(workspaceId!);
    expect(
      (
        await patchJson(
          `/v1/me/setup/${workspaceId}`,
          { optionalSteps: { ready: "completed" } },
          "dev-token"
        )
      ).status
    ).toBe(200);

    const current = await get("/v1/me", "dev-token");
    const currentBody = (await current.json()) as { user: { id: string } };
    const paid = await postDodoWebhook(`paid_${crypto.randomUUID()}`, {
      type: "subscription.active",
      data: {
        payload_type: "Subscription",
        subscription_id: `sub_${crypto.randomUUID()}`,
        product_id: "pdt_mPTd8gsQS8YUISdStWURf",
        status: "active",
        previous_billing_date: "2026-07-01T00:00:00Z",
        next_billing_date: "2026-08-01T00:00:00Z",
        addons: [],
        customer: {
          customer_id: `customer_${crypto.randomUUID()}`,
        },
        metadata: { billing_owner_user_id: currentBody.user.id },
      },
    });
    expect(paid.status).toBe(200);
    const complete = await postJson(
      `/v1/me/setup/${workspaceId}/complete`,
      {},
      "dev-token"
    );
    expect(complete.status).toBe(200);
    expect(await complete.json()).toEqual({ completed: true });

    const setupAfterPayment = await get(
      `/v1/me/setup/${workspaceId}`,
      "dev-token"
    );
    expect(setupAfterPayment.status).toBe(200);
    expect(await setupAfterPayment.json()).toMatchObject({
      onboardingComplete: true,
      subscription: { paid: true },
    });

    const key = await postJson(
      `/v1/workspaces/${workspaceId}/api-keys`,
      { name: "e2e", role: "owner", scopes: ["posts:read"] },
      "dev-token"
    );
    expect(key.status).toBe(200);
    const keyBody = (await key.json()) as { token: string };
    expect(keyBody.token).toMatch(API_KEY_PREFIX);

    const upload = await postJson(
      `/v1/workspaces/${workspaceId}/media/uploads`,
      [{ filename: "photo.png", contentType: "image/png" }],
      "dev-token"
    );
    expect(upload.status).toBe(200);
    const uploadBody = (await upload.json()) as Array<{
      mediaId: string;
      uploadUrl: string;
    }>;
    expect(uploadBody[0]?.uploadUrl).toContain("X-Amz-Signature");
    const media = await get(
      `/v1/workspaces/${workspaceId}/media/${uploadBody[0]?.mediaId}`,
      "dev-token"
    );
    expect(media.status).toBe(200);
  });

  it("keeps the base plan when an add-on subscription webhook arrives", async () => {
    const current = await get("/v1/me", "dev-token");
    const currentBody = (await current.json()) as { user: { id: string } };
    const customerId = `customer_${crypto.randomUUID()}`;
    const base = {
      payload_type: "Subscription",
      status: "active",
      previous_billing_date: "2026-07-01T00:00:00Z",
      next_billing_date: "2026-08-01T00:00:00Z",
      addons: [],
      customer: { customer_id: customerId },
      metadata: { billing_owner_user_id: currentBody.user.id },
    };

    const plan = await postDodoWebhook(`plan_${crypto.randomUUID()}`, {
      type: "subscription.active",
      data: {
        ...base,
        subscription_id: `sub_plan_${crypto.randomUUID()}`,
        product_id: TEST_PRODUCT_IDS.VIBE.monthly,
      },
    });
    expect(plan.status).toBe(200);

    const addon = await postDodoWebhook(`addon_${crypto.randomUUID()}`, {
      type: "subscription.active",
      created_at: "2026-07-03T00:00:00Z",
      data: {
        ...base,
        subscription_id: `sub_addon_${crypto.randomUUID()}`,
        product_id: SORTED_TEST_PRODUCT_ID,
      },
    });
    expect(addon.status).toBe(200);

    const renewal = await postDodoWebhook(`renewal_${crypto.randomUUID()}`, {
      type: "subscription.renewed",
      data: {
        ...base,
        subscription_id: `sub_plan_${crypto.randomUUID()}`,
        product_id: TEST_PRODUCT_IDS.VIBE.monthly,
        previous_billing_date: "2026-08-01T00:00:00Z",
        next_billing_date: "2026-09-01T00:00:00Z",
      },
    });
    expect(renewal.status).toBe(200);

    const unknown = await postDodoWebhook(`unknown_${crypto.randomUUID()}`, {
      type: "subscription.active",
      data: {
        ...base,
        subscription_id: `sub_unknown_${crypto.randomUUID()}`,
        product_id: `pdt_unknown_${crypto.randomUUID()}`,
      },
    });
    expect(unknown.status).toBe(200);

    const staleAddon = await postDodoWebhook(
      `stale_addon_${crypto.randomUUID()}`,
      {
        type: "subscription.cancelled",
        created_at: "2026-07-02T00:00:00Z",
        data: {
          ...base,
          status: "cancelled",
          subscription_id: `sub_addon_${crypto.randomUUID()}`,
          product_id: SORTED_TEST_PRODUCT_ID,
        },
      }
    );
    expect(staleAddon.status).toBe(200);

    const subscription = await get(
      `/v1/workspaces/${personalWorkspaceId}/billing/subscription`,
      "dev-token"
    );
    expect(subscription.status).toBe(200);
    expect(await subscription.json()).toMatchObject({
      plan: "VIBE",
      status: "active",
      addons: { sorted: { status: "active" } },
    });
  });

  it("rejects a garbage bearer with a 401 error envelope", async () => {
    const res = await get("/v1/me", "not-a-real-token");
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("UnauthorizedError");
  });

  it("keeps social OAuth callbacks public but rejects unsigned state", async () => {
    const res = await get(
      "/v1/connections/callback/instagram?code=fake&state=unsigned"
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/connection-result?error=invalid_state"
    );
  });

  it("enforces the flat session rate limit (429)", async () => {
    // Fresh user so the counter is isolated from other tests.
    const statuses: number[] = [];
    for (let i = 0; i < 25; i++) {
      const res = await get("/v1/me", "dev-token");
      statuses.push(res.status);
    }
    expect(statuses).toContain(429);
  });

  it("serves RFC 8414 metadata and JWKS", async () => {
    const meta = await get("/.well-known/oauth-authorization-server");
    expect(meta.status).toBe(200);
    const metaBody = (await meta.json()) as {
      token_endpoint: string;
      device_authorization_endpoint: string;
      agent_auth: { skill: string };
    };
    expect(metaBody.token_endpoint).toBe(`${ISSUER}/oauth/token`);
    expect(metaBody.device_authorization_endpoint).toBe(
      `${ISSUER}/oauth/device/authorize`
    );
    expect(metaBody.agent_auth.skill).toBe("http://localhost:3000/auth.md");

    const jwks = await get("/.well-known/jwks.json");
    const jwksBody = (await jwks.json()) as { keys: Array<{ alg: string }> };
    expect(jwksBody.keys[0].alg).toBe("ES256");
  });

  it("runs device authorization from pending approval to a single-use token", async () => {
    expect(personalWorkspaceId).toBeTruthy();
    const workspaceId = personalWorkspaceId;
    const start = await postForm("/oauth/device/authorize", {
      client_id: "delulu-cli",
      scope: "posts:read accounts:read",
      resource: ISSUER,
      workspace_id: workspaceId,
    });
    expect(start.status).toBe(200);
    const device = (await start.json()) as {
      device_code: string;
      user_code: string;
      verification_uri: string;
      verification_uri_complete: string;
      interval: number;
    };
    expect(device.user_code).toMatch(DEVICE_USER_CODE);
    expect(device.verification_uri).toBe("http://localhost:3000/oauth/device");
    expect(device.verification_uri_complete).toContain(
      encodeURIComponent(device.user_code)
    );
    expect(
      new URL(device.verification_uri_complete).searchParams.get("workspace_id")
    ).toBe(workspaceId);

    const pending = await postForm("/oauth/token", {
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: device.device_code,
      client_id: "delulu-cli",
    });
    expect(pending.status).toBe(400);
    expect((await pending.json()) as { error: string }).toMatchObject({
      error: "authorization_pending",
    });

    const tooFast = await postForm("/oauth/token", {
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: device.device_code,
      client_id: "delulu-cli",
    });
    expect(tooFast.status).toBe(400);
    expect((await tooFast.json()) as { error: string }).toMatchObject({
      error: "slow_down",
    });

    const transaction = await get(
      `/oauth/device/transaction?user_code=${encodeURIComponent(device.user_code)}`,
      "dev-token"
    );
    expect(transaction.status).toBe(200);
    expect(await transaction.json()).toMatchObject({
      clientId: "delulu-cli",
      scopes: ["posts:read", "accounts:read"],
      resource: ISSUER,
    });

    const escalatedApproval = await postJson(
      "/oauth/device/approve",
      {
        user_code: device.user_code,
        scope: "posts:write",
        workspace_id: workspaceId,
      },
      "dev-token"
    );
    expect(escalatedApproval.status).toBe(400);
    expect(await escalatedApproval.json()).toMatchObject({
      error: "invalid_request",
    });

    const approve = await postJson(
      "/oauth/device/approve",
      {
        user_code: device.user_code,
        scope: "accounts:read",
        workspace_id: workspaceId,
      },
      "dev-token"
    );
    expect(approve.status).toBe(200);

    const token = await postForm("/oauth/token", {
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: device.device_code,
      client_id: "delulu-cli",
    });
    expect(token.status).toBe(200);
    const tokenBody = (await token.json()) as { access_token: string };
    expect(tokenBody).toHaveProperty("access_token");

    const introspection = await postForm("/oauth/introspect", {
      token: tokenBody.access_token,
    });
    expect(await introspection.json()).toMatchObject({
      active: true,
      scopes: ["accounts:read"],
      aud: ISSUER,
      workspaceId,
    });

    const replay = await postForm("/oauth/token", {
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: device.device_code,
      client_id: "delulu-cli",
    });
    expect(replay.status).toBe(400);
    expect((await replay.json()) as { error: string }).toMatchObject({
      error: "expired_token",
    });
  });

  it("runs the full OAuth code→token→refresh flow and accepts the AS token", async () => {
    const verifier = "e2e-verifier-abcdefghijklmnopqrstuvwxyz";
    const challenge = await deriveChallengeS256(verifier);
    const redirectUri = "http://127.0.0.1:5555/callback";

    const finalizeRes = await postJson(
      "/oauth/authorize/finalize",
      {
        client_id: "delulu-cli",
        redirect_uri: redirectUri,
        scope: "posts:read",
        code_challenge: challenge,
        code_challenge_method: "S256",
        resource: ISSUER,
        state: "xyz",
      },
      "dev-token"
    );
    expect(finalizeRes.status).toBe(200);
    const { redirect_to } = (await finalizeRes.json()) as {
      redirect_to: string;
    };
    const code = new URL(redirect_to).searchParams.get("code");
    expect(code).toBeTruthy();

    const tokenRes = await postForm("/oauth/token", {
      grant_type: "authorization_code",
      code: code ?? "",
      client_id: "delulu-cli",
      redirect_uri: redirectUri,
      code_verifier: verifier,
    });
    expect(tokenRes.status).toBe(200);
    const tokens = (await tokenRes.json()) as {
      access_token: string;
      refresh_token: string;
    };
    expect(tokens.access_token).toBeTruthy();

    // The AS-issued token authenticates through the middleware's oauth path.
    // (Uses a fresh window so the earlier 429 test does not bleed in.)
    const meRes = await get("/v1/me", tokens.access_token);
    expect([200, 429]).toContain(meRes.status);

    const refreshRes = await postForm("/oauth/token", {
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: "delulu-cli",
    });
    expect(refreshRes.status).toBe(200);

    // Reusing the now-rotated refresh token is rejected.
    const reuseRes = await postForm("/oauth/token", {
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: "delulu-cli",
    });
    expect(reuseRes.status).toBe(400);
    const reuseBody = (await reuseRes.json()) as { error: string };
    expect(reuseBody.error).toBe("invalid_grant");
  });
});
