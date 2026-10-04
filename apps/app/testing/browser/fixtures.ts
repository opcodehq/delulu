const listEndpoint =
  /^\/v1\/workspaces\/workspace_[ab]\/(posts|connections|tags|members|automations\/instagram\/dm)$/;
const now = "2026-10-02T12:00:00.000Z";
const list = (data: unknown[] = []) => ({
  data,
  total: data.length,
  offset: 0,
  limit: 100,
});
/** Workspace A becomes a team workspace when `team` is configured. */
const memberships = (team?: FixtureConfig["team"]) =>
  list(
    ["a", "b"].map((id) => ({
      workspaceId: `workspace_${id}`,
      name: `Workspace ${id.toUpperCase()}`,
      slug: null,
      isPersonal: !(team && id === "a"),
      role: team && id === "a" ? team.role : "owner",
      clerkOrgId: team && id === "a" ? "org_fixture" : null,
    }))
  );
const workspaceDetailPath = /^\/v1\/workspaces\/(workspace_[ab])$/;
const fixtureConnections = [
  ["connection_x", "TWITTER", "swaraj"],
  ["connection_linkedin", "LINKEDIN", "Swaraj Bachu"],
  ["connection_insta0000001", "INSTAGRAM", "Swaraj"],
  ["connection_youtube", "YOUTUBE", "Swaraj Human"],
  ["connection_tiktok", "TIKTOK", "swaraj"],
].map(([id, platform, displayName]) => ({
  id,
  platform,
  profileId: `${id}_profile`,
  username: displayName.toLowerCase().replaceAll(" ", ""),
  displayName,
  profileImage: null,
  expiresAt: null,
}));
const samplePost = (workspaceId: string) => ({
  id: "post_fixture0001",
  workspaceId,
  status: "draft",
  source: "app",
  externalSubmissionId: null,
  createdAt: now,
  updatedAt: now,
  groups: [
    {
      id: "post_group_fixture01",
      isDefault: true,
      segments: [{ text: "Launch week starts Monday", media: [] }],
    },
  ],
  targets: [],
});
const sharedPost = (access: "anyone" | "workspace") => ({
  workspaceName: "Northwind Studio",
  postId: "post_fixture0001",
  postStatus: "scheduled",
  updatedAt: now,
  access,
  expiresAt: "2026-10-09T12:00:00.000Z",
  channels: [
    {
      targetId: "post_target_x",
      platform: "TWITTER",
      displayName: "Northwind",
      username: "northwind",
      profileImage: null,
      scheduledAt: "2026-10-05T15:00:00.000Z",
      status: "pending",
      segments: [
        {
          text: "Launch week starts Monday. Here's what's coming 🧵",
          media: [],
        },
        { text: "Day one: the new composer.", media: [] },
      ],
    },
    {
      targetId: "post_target_li",
      platform: "LINKEDIN",
      displayName: "Northwind Studio",
      username: "northwind-studio",
      profileImage: null,
      scheduledAt: "2026-10-05T15:00:00.000Z",
      status: "pending",
      segments: [
        {
          text: "We're kicking off launch week on Monday with a redesigned composer.",
          media: [],
        },
      ],
    },
  ],
  comments: [
    {
      id: "share_comment_1",
      authorName: "Priya",
      body: "Love the thread opener.",
      createdAt: now,
    },
  ],
});
/** Effect's HttpClient sends JSON bodies as bytes; plain fetch sends strings. */
const jsonBody = (body: BodyInit | null | undefined) =>
  JSON.parse(
    typeof body === "string"
      ? body
      : body instanceof Uint8Array || body instanceof ArrayBuffer
        ? new TextDecoder().decode(body)
        : "{}"
  );
const errorBody = (code: string, message: string, details = {}) => ({
  error: { code, message, details },
});
const shareFailures: Record<string, { status: number; body: unknown }> = {
  expired: {
    status: 410,
    body: errorBody("ShareLinkExpiredError", "This share link has expired."),
  },
  missing: {
    status: 404,
    body: errorBody("NotFoundError", "Not found", { resource: "share_link" }),
  },
  outsider: {
    status: 403,
    body: errorBody("ForbiddenError", "Members only"),
  },
};
const automationPath =
  /^\/v1\/workspaces\/workspace_[ab]\/automations\/instagram\/dm(?:\/([^/]+))?$/;
const connectionMediaPath =
  /^\/v1\/workspaces\/workspace_[ab]\/connections\/([^/]+)\/media$/;
/** A saved comment-to-DM flow with a follower check and a quick reply. */
const sampleAutomation = (workspaceId: string) => ({
  id: "automation_fixture",
  workspaceId,
  connectionId: "connection_insta0000001",
  platform: "instagram",
  category: "dm",
  name: "Guide giveaway",
  description: null,
  enabled: false,
  triggers: [
    {
      id: "trigger_fixture",
      type: "trigger",
      triggerType: "comment",
      targetMode: "all",
      targetPostIds: [],
      keywordFilter: { operator: "contains", value: "GUIDE" },
      nextStepId: "step_follow",
    },
  ],
  steps: [
    {
      id: "step_follow",
      type: "condition",
      operator: "is_follower",
      yesStepId: "step_link",
      noStepId: "step_ask",
    },
    {
      id: "step_link",
      type: "send_dm",
      messageTemplate: "Here is the guide you asked for!",
      buttons: [
        { type: "url", title: "Open guide", url: "https://example.com/guide" },
      ],
    },
    {
      id: "step_ask",
      type: "send_dm",
      messageTemplate: "Follow us first, then tap below to get the guide.",
      buttons: [
        { type: "quick_reply", title: "I followed", payload: "followed" },
      ],
    },
  ],
  notes: [],
  nodePositions: {},
  totalTriggered: 0,
  totalDmsSent: 0,
  totalFailed: 0,
  createdAt: now,
  updatedAt: now,
});
const shareViewPath = /^\/v1\/(public\/)?shares\/([^/]+)(\/comments)?$/;
const shareLinkPath =
  /^\/v1\/workspaces\/workspace_[ab]\/posts\/([^/]+)\/share$/;
export interface FixtureConfig {
  connections?: boolean;
  /** Make workspace A a team workspace with this role and sharing policy. */
  team?: {
    role: "owner" | "admin" | "editor" | "viewer";
    publicShareLinks: boolean;
  };
  /** One draft in the posts list, for post menu flows. */
  samplePosts?: boolean;
  signedOut?: boolean;
  /** Clerk's `setActive` never completes, as if the org switch is pending. */
  holdOrgSwitch?: boolean;
  /** A teammate already shared the post with anyone; creating conflicts. */
  shareConflict?: boolean;
  linkedInTargets?: {
    id: string;
    name: string;
    type: "member" | "organization";
  }[];
  dashboardWarnings?: boolean;
  latency?: number;
  failures?: Record<string, number>;
  workspaceLatency?: Record<string, number>;
  totalPosts?: Record<string, number>;
  /** Writes made through the automation editor, newest last. */
  automationWrites?: { method: string; body: unknown }[];
}
declare global {
  interface Window {
    fixtureConfig?: FixtureConfig;
  }
}
export const unhandled: string[] = [];
export const requests: { url: string; start: number; end?: number }[] = [];
export let pending = 0;
let shareLink: Record<string, unknown> | null = null;
export function installFixtures() {
  window.fixtureConfig ??= {
    dashboardWarnings: new URLSearchParams(location.search).has("warnings"),
    connections: new URLSearchParams(location.search).has("accounts"),
    signedOut: new URLSearchParams(location.search).has("signed-out"),
  };
  const config = window.fixtureConfig;
  Object.assign(window, { fixtureUnhandled: unhandled });
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      location.origin
    );
    if (url.hostname !== "fixture.local") {
      return realFetch(input, init);
    }
    const workspaceId = url.pathname.split("/")[3];
    const method =
      init?.method ?? (input instanceof Request ? input.method : "GET");
    const entry = {
      url: url.pathname + url.search,
      start: performance.now(),
      end: undefined as number | undefined,
    };
    requests.push(entry);
    pending++;
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        config.workspaceLatency?.[workspaceId] ?? config.latency ?? 150
      )
    );
    const failure = Object.entries(config.failures ?? {}).find(
      ([path, count]) => url.pathname.endsWith(path) && count > 0
    );
    if (failure && config.failures) {
      config.failures[failure[0]]--;
      entry.end = performance.now();
      pending--;
      return Response.json(
        { message: "Fixture service unavailable" },
        { status: 503 }
      );
    }
    let body: unknown;
    let status = 200;
    const shareView = shareViewPath.exec(url.pathname);
    const automation = automationPath.exec(url.pathname);
    const shareManage = shareLinkPath.exec(url.pathname);
    if (shareView) {
      const [, isPublic, token, comments] = shareView;
      const failure = shareFailures[token];
      if (failure) {
        status = failure.status;
        body = failure.body;
      } else if (token === "members" && isPublic) {
        status = 401;
        body = errorBody("UnauthorizedError", "Sign in to view");
      } else if (token === "busy" && comments && method === "POST") {
        status = 429;
        body = errorBody("RateLimitedError", "Rate limit exceeded", {
          retryAfter: 60,
        });
      } else if (comments && method === "POST") {
        const payload = jsonBody(init?.body);
        body = {
          id: `share_comment_${requests.length}`,
          authorName: payload.authorName ?? "Fixture User",
          body: payload.body,
          createdAt: now,
        };
      } else if (!comments && method === "GET") {
        body = sharedPost(token === "members" ? "workspace" : "anyone");
      } else {
        unhandled.push(`${method} ${url.pathname}`);
        status = 501;
        body = { message: `Missing fixture: ${method} ${url.pathname}` };
      }
    } else if (shareManage) {
      if (method === "POST" && config.shareConflict) {
        shareLink = {
          id: "share_link_teammate",
          postId: shareManage[1],
          token: "teammate-share-token",
          access: "anyone",
          expiresAt: "2026-10-09T12:00:00.000Z",
          expired: false,
          createdAt: now,
        };
        status = 409;
        body = errorBody(
          "ConflictError",
          "This post already has a share link.",
          {
            resource: "share_link",
          }
        );
      } else if (method === "POST" || method === "PATCH") {
        const payload = jsonBody(init?.body);
        shareLink = {
          id: "share_link_fixture",
          postId: shareManage[1],
          token: "fixture-share-token",
          access: payload.access ?? shareLink?.access ?? "anyone",
          expiresAt: "2026-10-09T12:00:00.000Z",
          expired: false,
          createdAt: now,
        };
        body = shareLink;
      } else if (method === "DELETE") {
        shareLink = null;
        body = { revoked: true };
      } else {
        body = shareLink;
      }
    } else if (
      automation &&
      (method === "POST" || (method === "PATCH" && automation[1])) &&
      automation[1] !== "runs" &&
      automation[1] !== "inbox"
    ) {
      const payload = jsonBody(init?.body);
      config.automationWrites = [
        ...(config.automationWrites ?? []),
        { method, body: payload },
      ];
      body = { ...sampleAutomation(workspaceId), ...payload };
    } else if (automation?.[1] === "automation_fixture" && method === "GET") {
      body = sampleAutomation(workspaceId);
    } else if (workspaceDetailPath.test(url.pathname)) {
      const id = workspaceDetailPath.exec(url.pathname)?.[1] ?? "";
      const team = id === "workspace_a" ? config.team : undefined;
      if (method === "PATCH" && team) {
        team.publicShareLinks = jsonBody(init?.body).publicShareLinks;
      }
      body = {
        id,
        name: `Workspace ${id.slice(-1).toUpperCase()}`,
        slug: null,
        isPersonal: !team,
        billingOwnerUserId: "fixture-user",
        publicShareLinks: team?.publicShareLinks ?? true,
      };
    } else if (
      config.samplePosts &&
      method === "GET" &&
      url.pathname.endsWith("/posts") &&
      (url.searchParams.get("status") ?? "draft").split(",").includes("draft")
    ) {
      body = list([samplePost(workspaceId)]);
    } else if (method !== "GET") {
      unhandled.push(`${method} ${url.pathname}`);
      status = 501;
      body = { message: `Missing fixture: ${method} ${url.pathname}` };
    } else if (url.pathname === "/v1/connections/linkedin/targets") {
      body = {
        targets: config.linkedInTargets ?? [
          { id: "member", name: "Alex Morgan", type: "member" },
          {
            id: "organization",
            name: "A company with a long name that must fit a compact destination choice",
            type: "organization",
          },
        ],
      };
    } else if (url.pathname === "/v1/me/workspaces") {
      body = memberships(config.team);
    } else if (url.pathname === "/v1/me/email-preferences") {
      body = { productLifecycleEnabled: true, marketingEnabled: false };
    } else if (url.pathname.endsWith("/analytics/operational")) {
      body = {
        workspaceId: url.pathname.split("/")[3],
        statsVersion: 1,
        counts: {
          totalPosts: config.totalPosts?.[workspaceId] ?? 0,
          drafts: 0,
          pendingReview: 0,
          scheduled: 0,
          publishing: 0,
          published: 0,
          partiallyFailed: 0,
          failed: 0,
          scheduledNextSevenDays: 0,
          publishedLastThirtyDays: 0,
        },
        streak: { currentDays: 0, longestDays: 0, lastPublishedDate: null },
        generatedAt: now,
      };
    } else if (url.pathname.endsWith("/billing/subscription")) {
      body = null;
    } else if (url.pathname.endsWith("/billing/usage")) {
      body = {
        billingOwnerUserId: "fixture-user",
        usage: {
          socialAccounts: 0,
          monthlyPosts: 0,
          mediaStorageBytes: 0,
          apiRequestsPerMonth: 0,
          dmsSent: 0,
          dmsSkipped: 0,
          transcriptionsUsed: 0,
        },
      };
    } else if (
      config.dashboardWarnings &&
      url.pathname.endsWith("/posts") &&
      url.searchParams.get("status") === "failed,partially_failed"
    ) {
      body = list([
        {
          id: "post_failed",
          workspaceId,
          status: "failed",
          source: "app",
          externalSubmissionId: null,
          createdAt: now,
          updatedAt: now,
          groups: [
            {
              id: "group_default",
              isDefault: true,
              segments: [
                {
                  text: "Our next product update is ready to share",
                  media: [],
                },
              ],
            },
          ],
          targets: [
            {
              id: "target_failed",
              connectionId: "connection_insta0000001",
              groupId: "group_default",
              settings: {
                platform: "THREADS",
                values: { replyControl: "everyone" },
              },
              scheduledAt: null,
              status: "failed",
              platformPostId: null,
              platformPostUrl: null,
              postedAt: null,
              error: "Connection expired. Reconnect your account and retry.",
              attempts: 1,
            },
          ],
        },
      ]);
    } else if (connectionMediaPath.test(url.pathname)) {
      body = {
        data:
          url.searchParams.get("kind") === "stories"
            ? []
            : [
                {
                  id: "media_reel",
                  caption: "Three hooks that doubled our saves",
                  mediaType: "VIDEO",
                  timestamp: now,
                  permalink: null,
                  thumbnailUrl: null,
                  mediaUrl: null,
                },
              ],
        nextCursor: null,
      };
    } else if (config.connections && url.pathname.endsWith("/connections")) {
      body = list(fixtureConnections);
    } else if (listEndpoint.test(url.pathname)) {
      body = list();
    } else {
      unhandled.push(`${init?.method ?? "GET"} ${url.pathname}`);
      status = 501;
      body = { message: `Missing fixture: ${url.pathname}` };
    }
    entry.end = performance.now();
    pending--;
    return Response.json(body, { status });
  };
}
