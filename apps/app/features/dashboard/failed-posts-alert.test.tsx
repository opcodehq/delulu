import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  pending: false,
  retry: vi.fn().mockResolvedValue(undefined),
  invalidate: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/shell/providers/api-client", () => ({
  useApiClient: () => ({
    resources: {
      posts: {
        list: () => ({ queryKey: ["posts"] }),
        retryTarget: () => ({}),
      },
    },
  }),
}));
vi.mock("@/shell/providers/workspace", () => ({
  useWorkspaceSelection: () => ({ workspaceId: "workspace_a" }),
}));
vi.mock("@/shell/navigation/route-transition", () => ({
  useAppRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/shell/navigation/app-link", () => ({
  AppLink: ({ children, ...props }: React.ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
}));
vi.mock("@/shell/state/resources", () => ({
  useResourceRegistry: () => ({ invalidateResources: state.invalidate }),
  useMutationAtom: () => ({
    isPending: state.pending,
    mutateAsync: state.retry,
  }),
  useResourceAtom: () => ({
    data: {
      total: 1,
      data: [
        {
          id: "post_a",
          groups: [{ segments: [{ text: "A failed post" }] }],
          targets: [
            { id: "target_a", status: "failed", error: "Connection expired" },
          ],
        },
      ],
    },
  }),
}));

import { FailedPostsAlert } from "@/features/dashboard/failed-posts-alert";

afterEach(() => {
  cleanup();
  state.pending = false;
  vi.clearAllMocks();
});
describe("failed post recovery", () => {
  it("uses a ghost action that still queues a retry and refreshes the list", async () => {
    render(<FailedPostsAlert />);
    const button = screen.getByRole("button", { name: "Retry" });
    expect(button.getAttribute("data-variant")).toBe("ghost");
    fireEvent.click(button);
    await waitFor(() => expect(state.retry).toHaveBeenCalledWith("target_a"));
    expect(state.invalidate).toHaveBeenCalled();
  });
  it("shows a disabled retrying state while the request is pending", () => {
    state.pending = true;
    render(<FailedPostsAlert />);
    const button = screen.getByRole("button", { name: "Retrying…" });
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
  });
});
