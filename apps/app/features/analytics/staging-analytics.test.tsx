import { PostHogProvider, posthog } from "@delulu/analytics/posthog/client";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@delulu/analytics/keys", () => ({
  keys: () => ({
    NEXT_PUBLIC_ANALYTICS_DISABLED: process.env.NEXT_PUBLIC_ANALYTICS_DISABLED,
    NEXT_PUBLIC_POSTHOG_KEY: "phc_test",
    NEXT_PUBLIC_POSTHOG_HOST: "https://example.com",
  }),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("does not initialize tracking when explicitly disabled for staging", () => {
  vi.stubEnv("NEXT_PUBLIC_ANALYTICS_DISABLED", "true");
  const init = vi.spyOn(posthog, "init").mockReturnValue(posthog);
  const register = vi.spyOn(posthog, "register");
  render(<PostHogProvider>Staging</PostHogProvider>);
  expect(init).not.toHaveBeenCalled();
  expect(register).not.toHaveBeenCalled();
});

it("preserves tracking when the opt-out is absent", async () => {
  vi.stubEnv("NEXT_PUBLIC_ANALYTICS_DISABLED", undefined);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response()));
  const init = vi.spyOn(posthog, "init").mockReturnValue(posthog);
  render(<PostHogProvider>Production</PostHogProvider>);
  await waitFor(() => expect(init).toHaveBeenCalledOnce());
});
