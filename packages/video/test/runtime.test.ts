import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CUE_KINDS } from "../src/blocks/index";

const RUNTIME = readFileSync(join(__dirname, "..", "runtime", "dv.js"), "utf8");
const IMPLEMENTED = /^ {4}([a-zA-Z]+): \(tl, els, c/gm;

describe("runtime", () => {
  it("implements every cue kind compose can emit", () => {
    // An unknown cue aborts the whole timeline in the browser, so this must never drift.
    const kinds = new Set(
      Array.from(RUNTIME.matchAll(IMPLEMENTED), (m) => m[1])
    );
    expect(CUE_KINDS.filter((k) => !kinds.has(k))).toEqual([]);
  });
});
