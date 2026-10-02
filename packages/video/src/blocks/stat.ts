import { escapeHtml, inline } from "../markup";
import type { StatBlock } from "../spec";
import { ARROW_RIGHT } from "./icons";
import { textClass } from "./tone";
import {
  type BlockContext,
  type Cue,
  maskLine,
  pop,
  type RenderedBlock,
  rise,
} from "./types";

/** A big number, optionally replacing an old one that gets struck through: 20x → 10x. */
export const stat = (
  block: typeof StatBlock.Type,
  { id, at }: BlockContext
): RenderedBlock => {
  const label = block.label
    ? maskLine(
        `<span class="dv-kicker"><i class="dv-dot"></i>${escapeHtml(block.label)}</span>`,
        "dv-stat-label"
      )
    : "";
  const from = block.from
    ? `${maskLine(`<span class="dv-stat-from">${escapeHtml(block.from)}<i class="dv-strike"></i></span>`, "dv-inline dv-stat-from-line")}${ARROW_RIGHT}`
    : "";
  const to = `<span class="dv-stat-to ${textClass(block.tone ?? "red")}">${inline(block.to)}</span>`;
  const html = `<div class="dv-stat" id="${id}">${label}<div class="dv-stat-row">${from}${maskLine(to, "dv-inline dv-stat-to-line")}</div></div>`;

  const cues: Cue[] = [];
  let t = at;
  if (block.label) {
    cues.push(rise(`#${id} .dv-stat-label > .dv-rise`, t));
    t += 0.1;
  }
  if (block.from) {
    cues.push(
      rise(`#${id} .dv-stat-from-line > .dv-rise`, t, { e: "snap", d: 0.45 })
    );
    cues.push(pop(`#${id} .dv-stat-arrow`, t + 0.18, { d: 0.45 }));
    t += 0.32;
  }
  cues.push(
    rise(`#${id} .dv-stat-to-line > .dv-rise`, t, {
      e: "pop",
      d: 0.6,
      sfx: "pop",
    })
  );
  if (block.count) {
    cues.push({
      k: "count",
      s: `#${id} .dv-stat-to`,
      t,
      d: 0.8,
      ...block.count,
      entrance: true,
    });
  }
  if (block.from) {
    cues.push({
      k: "reveal",
      s: `#${id} .dv-strike`,
      t: t + 0.3,
      d: 0.3,
      dir: "right",
      entrance: true,
      sfx: "click",
    });
  }
  return { html, cues };
};
