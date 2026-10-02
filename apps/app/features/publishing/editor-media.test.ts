import { describe, expect, it } from "vitest";
import { type EditorMediaDetail, hydrateEditorMedia } from "./editor-media";

describe("hydrateEditorMedia", () => {
  it("keeps the referenced video authoritative when a thumbnail also exists", () => {
    const video: EditorMediaDetail = {
      id: "media_video123456",
      url: "https://media.test/video.mp4",
      bucketKey: "workspace/video.mp4",
      mediaType: "video",
      thumbnails: [],
      altText: null,
    };
    const thumbnail: EditorMediaDetail = {
      id: "media_thumb123456",
      url: "https://media.test/thumbnail.jpg",
      bucketKey: "workspace/thumbnail.jpg",
      mediaType: "image",
      thumbnails: [],
      altText: null,
    };

    const result = hydrateEditorMedia(
      [{ id: video.id, thumbnailMediaId: thumbnail.id }],
      new Map([
        [video.id, video],
        [thumbnail.id, thumbnail],
      ])
    );

    expect(result[0]).toMatchObject({
      id: video.id,
      mediaType: "VIDEO",
      url: video.url,
      thumbnailBucketUrl: thumbnail.url,
      thumbnailMediaId: thumbnail.id,
    });
  });
});
