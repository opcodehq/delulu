import { describe, expect, it } from "vitest";
import { existingMediaFiles } from "./existing-media";

describe("existingMediaFiles", () => {
  it("keeps the database media ID used by the publishing worker", () => {
    const [media] = existingMediaFiles([
      {
        id: "media_abcdefghijkl",
        url: "https://media.example.com/image.jpg",
        bucketKey: "workspace/image.jpg",
        mediaType: "IMAGE",
        createdAt: "2026-07-13T10:00:00.000Z",
      },
    ]);

    expect(media?.id).toBe("media_abcdefghijkl");
  });
});
