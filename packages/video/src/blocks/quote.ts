import { escapeHtml, inline } from "../markup";
import type { QuoteBlock } from "../spec";
import { ditherButton } from "./dither";
import {
  type BlockContext,
  type Cue,
  maskLine,
  pop,
  type RenderedBlock,
  rise,
} from "./types";

/** A pulled quote with an optional stamp ("−50%") that slams on. */
export const quote = (
  block: typeof QuoteBlock.Type,
  { id, at }: BlockContext
): RenderedBlock => {
  const cues: Cue[] = [rise(`#${id} .dv-quote-text .dv-rise`, at, { d: 0.7 })];
  const by = block.by
    ? maskLine(
        `<span class="dv-label">${escapeHtml(block.by)}</span>`,
        "dv-quote-by"
      )
    : "<span></span>";
  if (block.by) {
    cues.push(rise(`#${id} .dv-quote-by > .dv-rise`, at + 0.2));
  }
  const stamp = block.stamp
    ? ditherButton(escapeHtml(block.stamp.text), {
        tone: block.stamp.tone ?? "red",
        cls: "dv-stamp",
      })
    : "";
  if (block.stamp) {
    cues.push(
      pop(`#${id} .dv-stamp`, block.stamp.at ?? at + 0.5, {
        from: 1.8,
        rotFrom: -16,
        rot: -4,
        e: "snap",
        d: 0.4,
        sfx: "pop",
      })
    );
  }
  return {
    html: `<div class="dv-card dv-quote" id="${id}"><div class="dv-card-body"><div class="dv-quote-text">${maskLine(`“${inline(block.text)}”`)}</div><div class="dv-quote-foot">${by}${stamp}</div></div></div>`,
    cues,
    hero: `#${id}`,
    card: true,
  };
};
