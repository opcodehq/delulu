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
export const requests: { url: string; start: number; end?: number }[] = [];
export let pending = 0;
export function installFixtures() {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      location.origin
    );
    if (url.hostname !== "fixture.local") {
      return realFetch(input, init);
    }
    const entry = {
      url: url.pathname + url.search,
      start: performance.now(),
      end: undefined as number | undefined,
    };
    requests.push(entry);
    pending++;
    await new Promise((resolve) => setTimeout(resolve, 150));
    let body: unknown = list();
    if (url.pathname === "/v1/me/workspaces") {
      body = memberships;
    } else if (url.pathname.endsWith("/analytics/operational")) {
      body = {
        workspaceId: url.pathname.split("/")[3],
        statsVersion: 1,
        counts: {
          totalPosts: 0,
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
    }
    entry.end = performance.now();
    pending--;
    return Response.json(body);
  };
}
