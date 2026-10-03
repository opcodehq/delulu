import type { MediaType, SocialType } from "@delulu/core/publishing/post";
import { RegistryContext } from "@effect/atom-react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MediaUploader } from "@/features/publishing/editor/media-uploader";
import { useStore } from "@/features/publishing/store";
import { appRegistry } from "@/shell/state/resources";

const ADD_MEDIA = /^Add media\./;

vi.mock("@/features/publishing/use-media-storage", () => ({
  useMediaStorage: () => ({ uploadAndSaveMedia: vi.fn() }),
}));
vi.mock("@/features/publishing/use-media-url", () => ({
  useMediaUrl: (_key?: string, url?: string) => url ?? "",
}));
// The library dialog fetches workspace media; it is not under test here.
vi.mock("@/features/publishing/editor/media-selection-dialog", () => ({
  MediaSelectionDialog: () => null,
}));

function renderTile(socialType: SocialType, media: MediaType[]) {
  const { post } = useStore.getState();
  useStore.setState({
    post: {
      ...post,
      content: [
        {
          id: "",
          order: 0,
          name: "DEFAULT",
          text: "",
          media,
          tags: [],
          socialId: "global",
        },
      ],
    },
  });
  render(
    <RegistryContext.Provider value={appRegistry}>
      <MediaUploader
        orderId={0}
        socialId="global"
        socialType={socialType}
        variant="tile"
      />
    </RegistryContext.Provider>
  );
}

afterEach(cleanup);

describe("MediaUploader tile", () => {
  it("keeps add controls after the first photo of a TikTok carousel", () => {
    renderTile("TIKTOK", [
      {
        id: "media_photo",
        mediaType: "IMAGE",
        bucketKey: "photo.jpg",
        url: "https://media.example.com/photo.jpg",
      },
    ]);

    expect(screen.getByRole("button", { name: ADD_MEDIA })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Choose existing media from library" })
    ).toBeTruthy();
  });

  it("hides add controls once the platform's media limit is reached", () => {
    // TikTok takes one video or a photo carousel, never both.
    renderTile("TIKTOK", [
      {
        id: "media_video",
        mediaType: "VIDEO",
        bucketKey: "video.mp4",
        url: "https://media.example.com/video.mp4",
      },
    ]);

    expect(screen.queryByRole("button", { name: ADD_MEDIA })).toBeNull();
  });
});
