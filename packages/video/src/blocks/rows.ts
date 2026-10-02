import { escapeHtml, inline } from "../markup";
import type { RowsBlock } from "../spec";
import { ditherButton } from "./dither";
import {
  type BlockContext,
  type Cue,
  maskLine,
  pop,
  type RenderedBlock,
  rise,
} from "./types";

/** Statements with a verdict tag each: "Cheaper models — PROMISE", "Half the usage — FACT". */
export const rows = (
  block: typeof RowsBlock.Type,
  { id, at }: BlockContext
): RenderedBlock => {
  const cues: Cue[] = [];
  const html = block.rows
    .map((row, i) => {
      const rid = `${id}-r${i}`;
      const t = row.at ?? at + 0.15 + i * 0.7;
      const style = row.style ?? "solid";
      const tone = row.tone ?? "indigo";
      cues.push(rise(`#${rid} .dv-row-text .dv-rise`, t));
      cues.push(
        pop(`#${rid} .dv-tag`, t + 0.3, { rotFrom: -14, rot: -3, sfx: "pop" })
      );
      if (row.strikeAt !== undefined) {
        cues.push({
          k: "reveal",
          s: `#${rid} .dv-strike`,
          t: row.strikeAt,
          d: 0.35,
          dir: "right",
          sfx: "click",
        });
      }
      const strike =
        row.strikeAt === undefined ? "" : '<i class="dv-strike"></i>';
      const tag = ditherButton(escapeHtml(row.tag), {
        tone: style === "outline" ? "muted" : tone,
        variant: style === "outline" ? "dotted" : "gradient",
        cls: "dv-tag",
      });
      return `<div class="dv-row" id="${rid}"><div class="dv-row-text">${maskLine(inline(row.text))}${strike}</div>${tag}</div>`;
    })
    .join("");
  return {
    html: `<div class="dv-card dv-rows" id="${id}"><div class="dv-card-body">${html}</div></div>`,
    cues,
    hero: `#${id}`,
    card: true,
  };
};
