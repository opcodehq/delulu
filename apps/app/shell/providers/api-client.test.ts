import { describe, expect, it, vi } from "vitest";
import { resolveAuthenticatedToken } from "./api-client";

describe("resolveAuthenticatedToken", () => {
  it("waits for Clerk to expose the token after a sign-in redirect", async () => {
    const getToken = vi
      .fn<() => Promise<string | null>>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue("session-token");

    await expect(
      resolveAuthenticatedToken(getToken, { attempts: 3, delayMs: 0 })
    ).resolves.toBe("session-token");
    expect(getToken).toHaveBeenCalledTimes(3);
  });

  it("returns a useful error when the session never becomes available", async () => {
    const getToken = vi
      .fn<() => Promise<string | null>>()
      .mockResolvedValue(null);

    await expect(
      resolveAuthenticatedToken(getToken, { attempts: 2, delayMs: 0 })
    ).rejects.toThrow("Your session is still loading");
  });
});
