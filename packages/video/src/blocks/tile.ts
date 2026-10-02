import { escapeHtml, inline } from "../markup";
import type { ChipBlock, TileBlock } from "../spec";
import { ditherCanvas, SEED } from "./dither";
import { type BlockContext, maskLine, type RenderedBlock, rise } from "./types";

/** A big dithered value box: the shape a bar or a card can turn into. */
export const tile = (
  block: typeof TileBlock.Type,
  { id, at }: BlockContext
): RenderedBlock => ({
  html: `<div class="dv-tile" id="${id}">${ditherCanvas({ kind: "fill", color: SEED[block.tone ?? "indigo"], variant: "gradient", cell: 6, floor: 0.72 })}<div class="dv-tile-body">${
    block.label
      ? maskLine(
          `<span class="dv-tile-label">${escapeHtml(block.label)}</span>`
        )
      : ""
  }${maskLine(`<span class="dv-tile-value">${inline(block.value)}</span>`)}</div></div>`,
  cues: [rise(`#${id} .dv-rise`, at, { stagger: 0.07 })],
  box: true,
});

/** A small label pill. */
export const chip = (
  block: typeof ChipBlock.Type,
  { id, at }: BlockContext
): RenderedBlock => ({
  html: `<div class="dv-chip" id="${id}">${maskLine(`<span>${inline(block.text)}</span>`)}</div>`,
  cues: [rise(`#${id} .dv-rise`, at)],
  box: true,
});
