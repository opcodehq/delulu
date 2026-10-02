import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFeatureFlag } from "./use-feature-flag";

vi.mock("@delulu/auth", () => ({
  useUser: () => ({
    user: { primaryEmailAddress: { emailAddress: "member@example.test" } },
  }),
}));

afterEach(cleanup);

describe("social connection availability", () => {
  it("enables Twitter for ordinary members", () => {
    expect(renderHook(() => useFeatureFlag("twitter")).result.current).toBe(
      true
    );
  });

  it("keeps unrelated features admin-only", () => {
    expect(renderHook(() => useFeatureFlag("affiliates")).result.current).toBe(
      false
    );
    expect(renderHook(() => useFeatureFlag("analytics")).result.current).toBe(
      false
    );
  });
});
