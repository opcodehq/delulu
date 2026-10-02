import { decodeReel, type Reel } from "../src/spec";

/** A small reel touching every block type. */
export const sampleReel = (overrides: Partial<Reel> = {}): Reel =>
  decodeReel({
    title: "Sample",
    scenes: [
      {
        id: "hook",
        duration: 3,
        blocks: [
          {
            type: "post",
            static: true,
            platform: "x",
            name: "Ada Lovelace",
            handle: "@ada",
            text: "Plans just got [[half as generous]].",
            highlightAt: 0.3,
          },
          { type: "stat", at: 1, label: "Pro", from: "20x", to: "10x" },
        ],
      },
      {
        id: "bars",
        duration: 4,
        blocks: [
          {
            type: "headline",
            kicker: "Context",
            lines: ["Pro used to be", "*20x*"],
          },
          {
            type: "bars",
            suffix: "x",
            rows: [
              { name: "Plus", value: 1, max: 20 },
              {
                name: "Pro",
                note: "Before",
                value: 20,
                max: 20,
                change: { at: 2, value: 10, note: "Now" },
              },
            ],
          },
        ],
      },
      {
        id: "list",
        duration: 3,
        transition: "push",
        blocks: [
          {
            type: "checklist",
            items: [{ text: "One" }, { text: "Two", note: "two" }],
          },
        ],
      },
      {
        id: "chart",
        duration: 3,
        blocks: [
          { type: "chart", label: "Price", note: "down", points: [3, 2, 1] },
        ],
      },
      {
        id: "versus",
        duration: 3,
        blocks: [
          {
            type: "versus",
            left: { label: "A", value: "$200", sub: "10x", meter: 0.5 },
            right: {
              label: "B",
              value: "$500",
              sub: "20x",
              meter: 1,
              count: { from: 200, to: 500, prefix: "$" },
            },
          },
        ],
      },
      {
        id: "rows",
        duration: 3,
        blocks: [
          {
            type: "rows",
            rows: [
              { text: "Promise", tag: "P", style: "outline", strikeAt: 1.5 },
              { text: "Fact", tag: "F" },
            ],
          },
        ],
      },
      {
        id: "slice",
        duration: 3,
        blocks: [
          {
            type: "cut",
            price: "$200",
            label: "Pro",
            from: 20,
            to: 10,
            cutAt: 1,
          },
        ],
      },
      {
        id: "quote",
        duration: 3,
        blocks: [
          {
            type: "quote",
            text: "Half",
            by: "Someone",
            stamp: { text: "-50%" },
          },
        ],
      },
      {
        id: "big",
        duration: 2,
        transition: "flood",
        blocks: [
          { type: "headline", size: "xl", lines: ["The _catch._"] },
          { type: "wordmark", text: "delulu." },
        ],
      },
      {
        id: "cta",
        duration: 4,
        blocks: [
          {
            type: "poll",
            question: "Which?",
            options: [{ text: "Down" }, { text: "Up" }],
            pick: 1,
            pickAt: 1.5,
            prompt: "Tell me",
          },
        ],
      },
    ],
    captions: [
      { at: 0, text: "First line" },
      { at: 3, text: "Second *line*" },
    ],
    loop: true,
    ...overrides,
  });
