import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PostSelector } from "@/features/automations/post-selector";

const SPECIFIC_MODE_NAME = /Specific posts and Reels/i;
const ALL_MODE_NAME = /Any current or future post/i;
const SCHEDULED_UNAVAILABLE = /scheduled posts are temporarily unavailable/i;

const mediaPage = {
  data: [
    {
      id: "media-latest",
      caption: "Latest launch",
      mediaType: "IMAGE",
      timestamp: "2026-07-25T12:00:00Z",
      permalink: "https://instagram.test/p/latest",
      thumbnailUrl: "https://cdn.test/latest.jpg",
      mediaUrl: "https://cdn.test/latest.jpg",
    },
  ],
  nextCursor: null,
};
const loadMedia = vi.fn().mockResolvedValue(mediaPage);
const loadScheduled = vi.fn().mockResolvedValue({ data: [] });
let hookCall = 0;

vi.mock("@/shell/providers/api-client", () => ({
  useApiClient: () => ({ resources: {} }),
}));
vi.mock("@/shell/providers/workspace", () => ({
  useWorkspace: () => ({ workspaceId: "workspace-1" }),
}));
vi.mock("@/shell/state/resources", () => ({
  useMutationAtom: () => {
    const current = hookCall++ % 2;
    return current === 0
      ? { mutateAsync: loadMedia, isPending: false }
      : { mutateAsync: loadScheduled, isPending: false };
  },
}));

function Harness() {
  const [targetMode, setTargetMode] = useState<"specific" | "all">("specific");
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <PostSelector
      onSelectionChange={setSelected}
      onTargetModeChange={setTargetMode}
      selectedPostIds={selected}
      socialProviderId="connection-1"
      targetMode={targetMode}
      triggerType="COMMENT"
    />
  );
}

describe("DM automation post selector", () => {
  afterEach(cleanup);

  beforeEach(() => {
    hookCall = 0;
    loadMedia.mockReset().mockResolvedValue(mediaPage);
    loadScheduled.mockReset().mockResolvedValue({ data: [] });
  });

  it("explains expired Instagram sessions and offers reconnect instead of retry", async () => {
    loadMedia.mockRejectedValueOnce(
      new Error(
        'Instagram API error (400): {"error":{"message":"Error validating access token: Session has expired on Friday, 11-Sep-26 02:48:22 PDT.","type":"OAuthException","code":190,"error_subcode":0,"fbtrace_id":"trace"}}'
      )
    );
    render(<Harness />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "Reconnect Instagram to continue using DM automations."
    );
    expect(alert.textContent).not.toContain("OAuthException");
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(
      screen
        .getByRole("link", { name: "Reconnect Instagram" })
        .getAttribute("href")
    ).toBe("/socials");
  });

  it("reloads media when returning after reconnecting", async () => {
    loadMedia.mockRejectedValueOnce(
      new Error("Access token expired and the account must be reconnected")
    );
    render(<Harness />);
    await screen.findByRole("link", { name: "Reconnect Instagram" });
    fireEvent(window, new Event("focus"));
    expect(
      await screen.findByRole("button", { name: "Select Latest launch" })
    ).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps retry available for temporary media failures", async () => {
    loadMedia.mockRejectedValueOnce(
      new Error("Instagram API error (503): unavailable")
    );
    render(<Harness />);
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(
      await screen.findByRole("button", { name: "Select Latest launch" })
    ).toBeTruthy();
  });

  it("defaults to an empty specific selection and uses one tile indicator", async () => {
    render(<Harness />);

    const specific = await screen.findByRole("button", {
      name: SPECIFIC_MODE_NAME,
    });
    expect(specific.getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);

    const tile = screen.getByRole("button", {
      name: "Select Latest launch",
    });
    fireEvent.click(tile);
    await waitFor(() => {
      expect(
        screen
          .getByRole("button", { name: "Unselect Latest launch" })
          .getAttribute("aria-pressed")
      ).toBe("true");
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Unselect Latest launch" })
    );
    await waitFor(() => {
      expect(
        screen
          .getByRole("button", { name: "Select Latest launch" })
          .getAttribute("aria-pressed")
      ).toBe("false");
    });
  });

  it("switches explicitly to all current and future posts", async () => {
    render(<Harness />);
    const all = await screen.findByRole("button", {
      name: ALL_MODE_NAME,
    });
    fireEvent.click(all);

    expect(all.getAttribute("aria-pressed")).toBe("true");
    expect(
      screen.queryByRole("button", { name: "Select Latest launch" })
    ).toBeNull();
  });

  it("keeps initial loading and partial scheduled errors inside the picker", async () => {
    let resolveMedia: (page: typeof mediaPage) => void = () => undefined;
    loadMedia.mockImplementationOnce(
      () =>
        new Promise<typeof mediaPage>((resolve) => {
          resolveMedia = resolve;
        })
    );
    loadScheduled.mockRejectedValueOnce(new Error("scheduled unavailable"));
    render(<Harness />);

    expect(await screen.findByText("Loading Instagram media")).toBeTruthy();
    await act(async () => resolveMedia(mediaPage));
    expect(
      await screen.findByRole("button", { name: "Select Latest launch" })
    ).toBeTruthy();
    expect(screen.getByText(SCHEDULED_UNAVAILABLE)).toBeTruthy();
  });

  it("retains more than ten loaded posts while paginating", async () => {
    const first = Array.from({ length: 12 }, (_, index) => ({
      ...mediaPage.data[0],
      id: `media-${index}`,
      caption: `Post ${index}`,
    }));
    loadMedia
      .mockResolvedValueOnce({ data: first, nextCursor: "next-page" })
      .mockResolvedValueOnce({
        data: [{ ...mediaPage.data[0], id: "media-12", caption: "Post 12" }],
        nextCursor: null,
      });
    render(<Harness />);

    expect(
      await screen.findByRole("button", { name: "Select Post 11" })
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(
      await screen.findByRole("button", { name: "Select Post 12" })
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Select Post 0" })).toBeTruthy();
  });
});
