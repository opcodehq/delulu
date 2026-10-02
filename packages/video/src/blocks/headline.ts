import { escapeHtml, inline } from "../markup";
import type { HeadlineBlock } from "../spec";
import {
  type BlockContext,
  type Cue,
  maskLine,
  type RenderedBlock,
  rise,
} from "./types";

export const headline = (
  block: typeof HeadlineBlock.Type,
  { id, at }: BlockContext
): RenderedBlock => {
  const size = block.size ?? "l";
  const align = block.align === "center" ? " dv-center" : "";
  const kicker = block.kicker
    ? maskLine(
        `<span class="dv-kicker"><i class="dv-dot"></i>${escapeHtml(block.kicker)}</span>`,
        "dv-kicker-line"
      )
    : "";
  const lines = block.lines.map((line) => maskLine(inline(line))).join("");
  const cues: Cue[] = [];
  if (block.kicker) {
    cues.push(rise(`#${id} .dv-kicker-line > .dv-rise`, at));
  }
  cues.push(
    rise(`#${id} .dv-lines .dv-rise`, at + (block.kicker ? 0.1 : 0), {
      stagger: 0.09,
    })
  );
  return {
    html: `<div class="dv-headline dv-${size}${align}" id="${id}">${kicker}<div class="dv-lines">${lines}</div></div>`,
    cues,
  };
};
