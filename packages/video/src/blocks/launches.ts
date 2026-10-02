import { escapeHtml, inline } from "../markup";
import type { LaunchesBlock } from "../spec";
import { logo } from "./brand";
import {
  type BlockContext,
  type Cue,
  maskLine,
  pop,
  type RenderedBlock,
  rise,
} from "./types";

/**
 * A keynote-style wall of launch tiles: named tiles among blank ones, popping in fast. It can
 * collapse to the few that matter (the rest shrink away and the keepers light up) or be swept
 * away entirely ("moving on").
 */
export const launches = (
  block: typeof LaunchesBlock.Type,
  { id, at }: BlockContext
): RenderedBlock => {
  const count = Math.max(block.count ?? block.tiles.length, block.tiles.length);
  const cols = block.cols ?? 4;
  const keep = new Set(block.keep ?? []);
  // Spread the named tiles over the wall so the blanks don't bunch up at the end.
  const step = count / block.tiles.length;
  const named = new Map(
    block.tiles.map((tile, i) => [
      Math.min(count - 1, Math.floor(i * step + step / 2)),
      tile,
    ])
  );
  const cues: Cue[] = [];
  const tiles = Array.from({ length: count }, (_, i) => {
    const tile = named.get(i);
    const cls = `dv-lt${tile ? "" : " dv-lt-blank"}${keep.has(i) ? " dv-lt-keep" : ""}`;
    const body = tile
      ? `<span class="dv-lt-title">${inline(tile.title)}</span>${tile.note ? `<span class="dv-lt-note">${escapeHtml(tile.note)}</span>` : ""}`
      : "<i></i><i></i>";
    if (tile?.at !== undefined) {
      cues.push(pop(`#${id}-t${i}`, tile.at, { from: 0.6, sfx: "pop2" }));
    }
    return `<div class="${cls}" id="${id}-t${i}">${body}</div>`;
  }).join("");

  const timed = new Set(
    block.tiles.flatMap((t, i) => (t.at === undefined ? [] : [i]))
  );
  if (timed.size === 0) {
    cues.push(
      pop(`#${id} .dv-lt`, at + 0.1, { from: 0.6, stagger: 0.025, sfx: "pop" })
    );
  }
  if (block.title || block.logo) {
    cues.push(rise(`#${id} .dv-lt-head .dv-rise`, at));
  }
  if (block.collapseAt !== undefined) {
    const t = block.collapseAt;
    const gone = Array.from({ length: count }, (_, i) => i).filter(
      (i) => !keep.has(i)
    );
    // Nothing to collapse when every tile is kept (an empty selector would break the runtime).
    if (gone.length > 0) {
      cues.push({
        k: "vanish",
        s: gone.map((i) => `#${id}-t${i}`).join(","),
        t,
        d: 0.3,
        stagger: 0.012,
        sfx: "whoosh",
      });
    }
    for (const i of keep) {
      cues.push({
        k: "fill",
        s: `#${id}-t${i}`,
        t: t + 0.25,
        d: 0.35,
        from: "#f9f9fb",
        to: "#474deb",
      });
      cues.push({
        k: "color",
        s: `#${id}-t${i}`,
        t: t + 0.25,
        d: 0.35,
        to: "#ffffff",
      });
      cues.push({
        k: "press",
        s: `#${id}-t${i}`,
        t: t + 0.55,
        d: 0.43,
        sfx: "pop",
      });
    }
  }
  if (block.sweepAt !== undefined) {
    cues.push({
      k: "vanish",
      s: `#${id} .dv-lt`,
      t: block.sweepAt,
      d: 0.3,
      stagger: 0.03,
      sfx: "whoosh",
    });
  }
  const head =
    block.title || block.logo
      ? `<div class="dv-lt-head">${maskLine(`${block.logo ? logo(block.logo, "dv-lt-logo") : ""}${block.title ? `<span>${inline(block.title)}</span>` : ""}`)}</div>`
      : "";
  return {
    html: `<div class="dv-launches" id="${id}">${head}<div class="dv-lt-grid" style="grid-template-columns:repeat(${cols},1fr)">${tiles}</div></div>`,
    cues,
    box: true,
  };
};
