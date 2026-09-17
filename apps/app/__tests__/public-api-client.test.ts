import { afterEach, expect, it, vi } from "vitest";
import { createPublicApiClient } from "../lib/public-api-client";

const client = vi.hoisted(() => vi.fn((options) => options));
vi.mock("@delulu/client", () => ({ createApiClient: client }));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it("waits for a delayed token instead of returning an empty bearer", async () => {
  vi.useFakeTimers();
  const getToken = vi
    .fn()
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(null)
    .mockResolvedValue("ready");
  createPublicApiClient(getToken);
  const pending = client.mock.calls[0]![0].getToken();
  await vi.runAllTimersAsync();
  expect(await pending).toBe("ready");
  expect(getToken).toHaveBeenCalledTimes(3);
});
it("rejects after the shared retry limit without sending an empty token", async () => {
  vi.useFakeTimers();
  const getToken = vi.fn().mockResolvedValue(null);
  createPublicApiClient(getToken);
  const assertion = expect(client.mock.calls[0]![0].getToken()).rejects.toThrow(
    "Your session is still loading"
  );
  await vi.runAllTimersAsync();
  await assertion;
  expect(getToken).toHaveBeenCalledTimes(6);
});
it.each([
  ["development", "http://localhost:8788"],
  ["production", "https://api.delulu.social"],
])("uses the %s fallback", (environment, expected) => {
  vi.stubEnv("NODE_ENV", environment);
  vi.stubEnv("NEXT_PUBLIC_API_URL", undefined);
  createPublicApiClient(async () => "token");
  expect(client).toHaveBeenCalledWith(
    expect.objectContaining({ baseUrl: expected })
  );
});
it("preserves explicit staging configuration and token retrieval", async () => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://staging.example.test");
  createPublicApiClient(async () => "token");
  const options = client.mock.calls[0]![0];
  expect(options.baseUrl).toBe("https://staging.example.test");
  expect(await options.getToken()).toBe("token");
});
