import { escapeHtml, inline } from "../markup";
import type { CutBlock } from "../spec";
import { logo } from "./brand";
import { ditherCanvas, SEED } from "./dither";
import {
  type BlockContext,
  type Cue,
  maskLine,
  type RenderedBlock,
  rise,
} from "./types";

/**
 * "Same price, less usage", made to stop the scroll. The price stays untouched; the usage bar is
 * the thing that gets cut:
 *   the bar trembles → a blade slashes straight through it → the frame jolts → the cut-off part
 *   breaks away and tumbles out → the number counts down in red.
 * The bar is two copies of one dither fill, clipped either side of a slightly slanted line.
 */
export const cut = (
  block: typeof CutBlock.Type,
  { id, at }: BlockContext
): RenderedBlock => {
  const keep = Math.max(0, Math.min(1, block.to / block.from));
  const split = keep * 100;
  const lean = 2.5;
  const suffix = block.suffix ?? "x";
  const fill = ditherCanvas({
    kind: "fill",
    color: SEED.indigo,
    variant: "gradient",
    axis: "x",
    cell: 6,
    floor: 0.6,
  });
  const band = `polygon(calc(${split + lean}% - 7px) 0,calc(${split + lean}% + 7px) 0,calc(${split - lean}% + 7px) 100%,calc(${split - lean}% - 7px) 100%)`;
  // In a mask line, so the logo rises in and sinks out with the text.
  const mark = block.logo
    ? maskLine(logo(block.logo, "dv-cut-logo"), "dv-cut-logo-line")
    : "";
  const html = `<div class="dv-cut" id="${id}">${mark}<div class="dv-card dv-cut-card"><div class="dv-card-body">
  ${block.label ? maskLine(`<span class="dv-label">${escapeHtml(block.label)}</span>`) : ""}
  <div class="dv-cut-price">${maskLine(`<span class="dv-cut-price-value">${inline(block.price)}</span>${block.priceSub ? `<span class="dv-cut-price-sub">${escapeHtml(block.priceSub)}</span>` : ""}`)}</div>
  <div class="dv-cut-usage">
    ${maskLine(`<span class="dv-label">${escapeHtml(block.usageLabel ?? "Usage")}</span>`)}
    ${maskLine(`<span class="dv-cut-num">${block.from}${escapeHtml(suffix)}</span>`)}
  </div>
  <div class="dv-cut-bar">
    <div class="dv-cut-piece dv-cut-keep" style="clip-path:polygon(0 0,${split + lean}% 0,${split - lean}% 100%,0 100%)">${fill}</div>
    <div class="dv-cut-piece dv-cut-lose" style="clip-path:polygon(${split + lean}% 0,100% 0,100% 100%,${split - lean}% 100%)">${fill}</div>
    <div class="dv-cut-blade"><i style="clip-path:${band}"></i></div>
  </div>
</div></div></div>`;

  const t = block.cutAt ?? at + 0.6;
  const hit = t + 0.14;
  const cues: Cue[] = [
    rise(`#${id} .dv-rise`, at, { d: 0.7 }),
    // Tension: the bar starts to shake before anything happens.
    {
      k: "shake",
      s: `#${id} .dv-cut-bar`,
      t: Math.max(0, t - 0.5),
      d: 0.5,
      scale: 6,
      dir: "right",
    },
    // One fast stroke straight down through the bar...
    {
      k: "reveal",
      s: `#${id} .dv-cut-blade`,
      t,
      d: 0.14,
      dir: "down",
      e: "power4.in",
      sfx: "whoosh",
    },
    // ...the whole frame jolts...
    { k: "shake", s: `#${id}`, t: hit, d: 0.45, scale: 24, sfx: "pop" },
    // ...the cut-off part breaks away and tumbles out of frame.
    {
      k: "move",
      s: `#${id} .dv-cut-lose`,
      t: hit,
      d: 0.22,
      x: 70,
      y: 46,
      rot: 9,
      e: "power3.out",
    },
    {
      k: "move",
      s: `#${id} .dv-cut-lose`,
      t: hit + 0.22,
      d: 0.7,
      x: 220,
      y: 1700,
      rot: 34,
      e: "power2.in",
      noInit: true,
    },
    { k: "wipe", s: `#${id} .dv-cut-blade`, t: hit, d: 0.2, e: "power2.out" },
    // The number follows the bar down, and turns red.
    {
      k: "count",
      s: `#${id} .dv-cut-num`,
      t: hit + 0.05,
      d: 0.7,
      from: block.from,
      to: block.to,
      suffix,
      e: "power3.out",
      sfx: "pop2",
    },
    {
      k: "color",
      s: `#${id} .dv-cut-num`,
      t: hit + 0.05,
      d: 0.25,
      to: "#ef4444",
    },
  ];
  return { html, cues, hero: `#${id} .dv-cut-card`, card: true };
};
