import { escapeHtml, inline } from "../markup";
import type { VersusBlock } from "../spec";
import { ditherCanvas, SEED } from "./dither";
import { textClass } from "./tone";
import {
  type BlockContext,
  type Cue,
  maskLine,
  type RenderedBlock,
  rise,
} from "./types";

type Side = (typeof VersusBlock.Type)["left"];

/** Two options side by side: label, big value, a meter, and what you get. */
export const versus = (
  block: typeof VersusBlock.Type,
  { id, at }: BlockContext
): RenderedBlock => {
  const cues: Cue[] = [];
  const column = (side: Side, key: "l" | "r", t: number) => {
    const cid = `${id}-${key}`;
    const tone = side.tone ?? (key === "l" ? "indigo" : "red");
    cues.push(rise(`#${cid} .dv-rise`, t, { stagger: 0.07 }));
    cues.push({
      k: "reveal",
      s: `#${cid} .dv-meter .dv-dither`,
      t: t + 0.3,
      d: 0.9,
      dir: "up",
      e: "power2.out",
      entrance: true,
    });
    if (side.count) {
      cues.push({
        k: "count",
        s: `#${cid} .dv-vs-value`,
        t: t + 0.3,
        d: 0.9,
        ...side.count,
        entrance: true,
      });
    }
    return `<div class="dv-vs-col" id="${cid}">
  ${maskLine(`<span class="dv-label">${escapeHtml(side.label)}</span>`)}
  ${maskLine(`<span class="dv-vs-value">${escapeHtml(side.value)}</span>`)}
  <div class="dv-meter">${ditherCanvas({ kind: "fill", color: SEED[tone], variant: "gradient" }, "", `height:${(side.meter * 100).toFixed(2)}%`)}</div>
  ${maskLine(`<span class="dv-vs-sub ${textClass(tone)}">${inline(side.sub)}</span>`)}
</div>`;
  };
  const left = column(block.left, "l", at);
  const right = column(block.right, "r", at + 0.3);
  return {
    html: `<div class="dv-card dv-versus" id="${id}"><div class="dv-card-body">${left}${right}</div></div>`,
    cues,
    hero: `#${id}`,
    card: true,
  };
};
