import { describe, expect, it, vi } from "vitest";
import { navigationItems } from "@/shell/navigation";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  },
}));

import AgentPage from "@/app/(authenticated)/agent/page";

describe("unreleased Content HQ", () => {
  it("is absent from public navigation", () => {
    expect(navigationItems.some((item) => item.url === "/agent")).toBe(false);
  });
  it("rejects direct navigation before loading the agent workspace", () => {
    expect(() => AgentPage()).toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  });
});
