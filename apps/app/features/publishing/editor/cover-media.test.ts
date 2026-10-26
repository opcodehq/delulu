import { describe, expect, it } from "vitest";
import { pickCoverImage } from "@/features/publishing/editor/cover-media";

const type = (item: { mediaType: string }) => item.mediaType;

describe("pickCoverImage", () => {
  it("keeps only the first image", () => {
    const items = [
      { id: "video", mediaType: "VIDEO" },
      { id: "first", mediaType: "IMAGE" },
      { id: "second", mediaType: "IMAGE" },
    ];
    expect(pickCoverImage(items, type)).toEqual({
      cover: [items[1]],
      dropped: true,
    });
  });

  it("accepts a single image without dropping anything", () => {
    const items = [{ id: "only", mediaType: "IMAGE" }];
    expect(pickCoverImage(items, type)).toEqual({
      cover: items,
      dropped: false,
    });
  });

  it("rejects selections without an image", () => {
    expect(
      pickCoverImage([{ id: "doc", mediaType: "DOCUMENT" }], type)
    ).toEqual({ cover: [], dropped: true });
  });
});
