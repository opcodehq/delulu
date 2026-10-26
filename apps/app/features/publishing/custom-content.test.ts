import { describe, expect, it } from "vitest";
import {
  customContentFor,
  foldThread,
} from "@/features/publishing/custom-content";

const provider = {
  socialId: "x_a",
  socialType: "TWITTER",
  name: "Writer",
} as const;
const media = { mediaType: "IMAGE", url: "https://cdn.test/a.png" } as const;
const thread = [
  { order: 0, name: "Post", text: "First ", media: [media], tags: ["a"] },
  { order: 1, name: "Post", text: "", media: [], tags: [] },
  { order: 2, name: "Post", text: "Third", media: [media], tags: [] },
];

describe("customContentFor", () => {
  it("copies every segment without sharing media or tags", () => {
    const custom = customContentFor(provider, thread);
    expect(custom.socialProvider).toBe(provider);
    expect(custom.content.map((item) => item.text)).toEqual([
      "First ",
      "",
      "Third",
    ]);
    expect(custom.content[0]?.media[0]).toEqual(media);
    expect(custom.content[0]?.media[0]).not.toBe(media);
    expect(custom.content[0]?.tags).not.toBe(thread[0]?.tags);
  });
});

describe("foldThread", () => {
  it("joins non-empty paragraphs and keeps all media", () => {
    const [body, ...rest] = foldThread(thread);
    expect(rest).toEqual([]);
    expect(body?.text).toBe("First\n\nThird");
    expect(body?.media).toEqual([media, media]);
  });

  it("leaves a single segment unchanged", () => {
    expect(foldThread([thread[0]])).toEqual([thread[0]]);
  });
});
