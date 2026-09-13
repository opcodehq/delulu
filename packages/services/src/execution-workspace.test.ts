import { describe, expect, it } from "vitest";
import {
  boundCommandOutput,
  MAX_COMMAND_OUTPUT_BYTES,
} from "./execution-workspace";

describe("execution workspace output", () => {
  it("keeps small output intact", () => {
    expect(boundCommandOutput("hello")).toEqual({
      output: "hello",
      truncated: false,
    });
  });

  it("bounds captured output without splitting multibyte text", () => {
    const result = boundCommandOutput(
      `prefix-${"🚀".repeat(MAX_COMMAND_OUTPUT_BYTES)}`,
      9
    );
    expect(
      new TextEncoder().encode(result.output).byteLength
    ).toBeLessThanOrEqual(9);
    expect(result.output).not.toContain("�");
    expect(result.truncated).toBe(true);
  });
});
