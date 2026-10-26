import { afterEach, expect, it, vi } from "vitest";
import { codexRequest } from "./chatgpt";

const config = {
  enabled: true,
  url: "https://runner.example.test",
  secret: "service-only",
};
afterEach(() => vi.unstubAllGlobals());

it("sends the trusted owner in an authenticated internal request without redirects", async () => {
  const transport = vi.fn(async (_url: URL, _init: RequestInit) =>
    Response.json({ updated: true })
  );
  vi.stubGlobal("fetch", transport);
  await codexRequest(config, "trusted-user", "submit", {
    userId: "untrusted-input",
  });
  const [, init] = transport.mock.calls[0]!;
  expect(JSON.parse(String(init.body))).toEqual({
    userId: "trusted-user",
    operation: "submit",
    input: { userId: "untrusted-input" },
  });
  expect(init.redirect).toBe("error");
  expect(new Headers(init.headers).get("authorization")).toBe(
    "Bearer service-only"
  );
});

it("blocks disabled admission while allowing disconnect, and requires remote TLS", async () => {
  const transport = vi.fn(async () => Response.json({ updated: true }));
  vi.stubGlobal("fetch", transport);
  await expect(
    codexRequest({ ...config, enabled: false }, "user", "submit")
  ).rejects.toThrow("not available");
  await expect(
    codexRequest(
      { ...config, url: "http://remote.example.test" },
      "user",
      "login"
    )
  ).rejects.toThrow("HTTPS");
  expect(transport).not.toHaveBeenCalled();
  await codexRequest({ ...config, enabled: false }, "user", "disconnect");
  expect(transport).toHaveBeenCalledOnce();
});

it("only exposes allowlisted public failure messages", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json(
        { error: "provider token or internal detail" },
        { status: 503 }
      )
    )
  );
  await expect(codexRequest(config, "user", "status")).rejects.toThrow(
    "ChatGPT request unavailable. Check your connection or try again."
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json(
        {
          error:
            "ChatGPT usage limit reached. Wait for your allowance to reset.",
        },
        { status: 429 }
      )
    )
  );
  await expect(codexRequest(config, "user", "submit")).rejects.toThrow(
    "ChatGPT usage limit reached."
  );
});
