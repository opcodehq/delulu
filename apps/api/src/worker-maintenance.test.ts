import { describe, expect, it, vi } from "vitest";
import worker from "./index";

// These tests exercise fetch routing, not Cloudflare's runtime entrypoints.
vi.mock("cloudflare:workers", () => ({
  WorkerEntrypoint: class {},
  DurableObject: class {},
}));

describe("Worker maintenance boundary", () => {
  it("short-circuits public handlers without starting database work", async () => {
    const waitUntil = vi.fn();
    const response = await worker.fetch(
      new Request(
        "https://api.test/v1/connections/callback/linkedin?code=test"
      ),
      { API_MAINTENANCE: "true" },
      { waitUntil }
    );
    expect(response.status).toBe(503);
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it("does not bypass transfer authentication during maintenance", async () => {
    const response = await worker.fetch(
      new Request("https://api.test/internal/jobs", { method: "POST" }),
      { API_MAINTENANCE: "true" },
      { waitUntil: vi.fn() }
    );
    expect(response.status).toBe(401);
  });
});
