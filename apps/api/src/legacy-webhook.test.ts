import { expect, it, vi } from "vitest";
import worker from "./legacy-webhook";

it("forwards the original request and response without changing webhook bytes", async () => {
  const request = new Request(
    "https://legacy.example/v1/providers/whatsapp/webhook",
    {
      method: "POST",
      headers: { "x-hub-signature-256": "sha256=test" },
      body: "original webhook bytes",
    }
  );
  const response = new Response("not ready", { status: 503 });
  const fetch = vi.fn().mockResolvedValue(response);
  expect(await worker.fetch(request, { STAGING: { fetch } })).toBe(response);
  expect(fetch).toHaveBeenCalledExactlyOnceWith(request);
  expect(await request.text()).toBe("original webhook bytes");
});
