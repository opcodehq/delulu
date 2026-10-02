import { describe, expect, it } from "vitest";
import { collectImages } from "../src/project";
import { decodeReel } from "../src/spec";

const MEDIA_PATH = /^assets\/media\/[0-9a-f]{16}\.svg$/;

describe("collectImages", () => {
  const reel = decodeReel({
    scenes: [
      {
        duration: 3,
        blocks: [
          {
            type: "post",
            platform: "x",
            name: "A",
            handle: "@a",
            text: "Hi",
            avatar: "https://cdn.example.com/a/me.JPG",
          },
          {
            type: "leaderboard",
            title: "Board",
            rows: [
              { name: "One", logo: "openai" },
              { name: "Two", logo: "https://cdn.example.com/two.svg" },
              { name: "Three", logo: "logos/three.png" },
            ],
          },
          {
            type: "tile",
            value: "x",
            logo: "data:image/png;base64,AAAA",
            window: { title: "W", logo: "logos/three.png" },
          },
        ],
      },
    ],
  });
  const out = collectImages(reel);
  const blocks = out.reel.scenes[0]?.blocks ?? [];

  it("rewrites remote images (at any depth) to project assets downloaded at build time", () => {
    expect(out.remote.map((m) => m.url).sort()).toEqual([
      "https://cdn.example.com/a/me.JPG",
      "https://cdn.example.com/two.svg",
    ]);
    const post = blocks[0];
    expect(post?.type === "post" && post.avatar?.endsWith(".jpg")).toBe(true);
    const board = blocks[1];
    expect(board?.type === "leaderboard" && board.rows[1]?.logo).toMatch(
      MEDIA_PATH
    );
  });

  it("copies local images once and leaves built-in logos and data URLs alone", () => {
    expect(out.local).toEqual(["logos/three.png"]);
    const board = blocks[1];
    expect(board?.type === "leaderboard" && board.rows[0]?.logo).toBe("openai");
    const tile = blocks[2];
    expect(tile?.type === "tile" && tile.logo?.startsWith("data:")).toBe(true);
  });
});
