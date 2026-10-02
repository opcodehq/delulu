import { inline } from "../markup";
import type { WordmarkBlock } from "../spec";
import { type BlockContext, maskLine, type RenderedBlock, rise } from "./types";

/** A closing wordmark, e.g. "delulu." */
export const wordmark = (
  block: typeof WordmarkBlock.Type,
  { id, at }: BlockContext
): RenderedBlock => ({
  html: `<div class="dv-wordmark" id="${id}">${maskLine(inline(block.text))}</div>`,
  cues: [rise(`#${id} .dv-rise`, at, { d: 0.7 })],
});
