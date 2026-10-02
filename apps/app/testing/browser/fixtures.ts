const listEndpoint =
  /^\/v1\/workspaces\/workspace_[ab]\/(posts|connections|tags|members|automations\/instagram\/dm)$/;
const now = "2026-10-02T12:00:00.000Z";
const list = (data: unknown[] = []) => ({
  data,
  total: data.length,
  offset: 0,
  limit: 100,
});
const memberships = list(
  ["a", "b"].map((id) => ({
    workspaceId: `workspace_${id}`,
    name: `Workspace ${id.toUpperCase()}`,
    slug: null,
    isPersonal: true,
    role: "owner",
  }))
);
export interface FixtureConfig {
  dashboardWarnings?: boolean;
  latency?: number;
  failures?: Record<string, number>;
  workspaceLatency?: Record<string, number>;
  totalPosts?: Record<string, number>;
}
declare global {
  interface Window {
    fixtureConfig?: FixtureConfig;
  }
}
export const unhandled: string[] = [];
export const requests: { url: string; start: number; end?: number }[] = [];
export let pending = 0;
export function installFixtures() {
  window.fixtureConfig ??= {
    dashboardWarnings: new URLSearchParams(location.search).has("warnings"),
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
    if (method !== "GET") {
      unhandled.push(`${method} ${url.pathname}`);
      status = 501;
      body = { message: `Missing fixture: ${method} ${url.pathname}` };
    } else if (url.pathname === "/v1/me/workspaces") {
      body = memberships;
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
              connectionId: "connection_instagram",
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
