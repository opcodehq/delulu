import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  OperationsError,
  OperationsLoading,
  taggedMessage,
} from "./query-state";

describe("operations query states", () => {
  it("renders a visible loading state", () => {
    render(<OperationsLoading label="Loading workspace usage" />);
    expect(screen.getByText("Loading workspace usage")).toBeTruthy();
  });

  it("distinguishes permission and provider failures", () => {
    expect(
      taggedMessage(
        Object.assign(new Error("forbidden"), { _tag: "ForbiddenError" })
      )
    ).toContain("permission");
    expect(
      taggedMessage(
        Object.assign(new Error("provider"), {
          _tag: "AnalyticsProviderError",
        })
      )
    ).toContain("Cached data");
    expect(taggedMessage(new Error("offline"))).toContain("connection");
  });

  it("offers a working retry action", () => {
    const retry = vi.fn();
    render(<OperationsError error={new Error("offline")} onRetry={retry} />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
