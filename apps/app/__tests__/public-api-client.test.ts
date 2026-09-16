import { afterEach, expect, it, vi } from "vitest";
import { createPublicApiClient } from "../lib/public-api-client";

const client = vi.hoisted(() => vi.fn((options) => options));
vi.mock("@delulu/client", () => ({ createApiClient: client }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
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
