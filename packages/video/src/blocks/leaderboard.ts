import { escapeHtml, inline } from "../markup";
import type { LeaderboardBlock } from "../spec";
import { logo, windowBar } from "./brand";
import { ditherCanvas, SEED } from "./dither";
import {
  type BlockContext,
  type Cue,
  maskLine,
  pop,
  type RenderedBlock,
  rise,
} from "./types";

/** Row pitch in px (kept in sync with `.dv-lb-row` in runtime/dv.css). */
const ROW = 132;

/** A benchmark or pricing table that looks like the real thing; rows can re-rank on a beat. */
export const leaderboard = (
  block: typeof LeaderboardBlock.Type,
  { id, at }: BlockContext
): RenderedBlock => {
  const names = block.rows.map((r) => r.name);
  const order = block.rerank?.order ?? names;
  const rows = block.rows
    .map((row, i) => {
      const after = order.indexOf(row.name);
      const rank = (n: number) => `<span>${n + 1}</span>`;
      const ranks =
        block.rerank && after !== i
          ? `<span class="dv-swap">${rank(i)}${rank(after)}</span>`
          : rank(i);
      const badge =
        block.highlight?.name === row.name && block.highlight.badge
          ? `<span class="dv-lb-badge">${escapeHtml(block.highlight.badge)}</span>`
          : "";
      const bar =
        row.bar === undefined
          ? ""
          : `<div class="dv-lb-bar">${ditherCanvas({ kind: "fill", color: SEED[row.tone ?? "indigo"], variant: "gradient", axis: "x", cell: 5 }, "", `width:${(row.bar * 100).toFixed(2)}%`)}</div>`;
      return `<div class="dv-lb-row" id="${id}-r${i}" style="top:${i * ROW}px">
  <span class="dv-lb-rank">${ranks}</span>
  ${row.logo ? logo(row.logo, "dv-lb-logo") : '<span class="dv-lb-logo"></span>'}
  <div class="dv-lb-name"><span class="dv-lb-model">${inline(row.name)}<i class="dv-strike"></i></span>${row.note ? `<span class="dv-lb-note">${escapeHtml(row.note)}</span>` : ""}${bar}</div>
  <span class="dv-lb-value">${badge}${row.value ? escapeHtml(row.value) : ""}</span>
</div>`;
    })
    .join("");

  const cues: Cue[] = [
    rise(`#${id} .dv-lb-head .dv-rise`, at, { stagger: 0.04 }),
    {
      k: "reveal",
      s: `#${id} .dv-lb-row`,
      t: at + 0.1,
      d: 0.4,
      dir: "down",
      stagger: 0.08,
      entrance: true,
    },
  ];
  block.rows.forEach((row, i) => {
    if (row.bar !== undefined) {
      cues.push({
        k: "reveal",
        s: `#${id}-r${i} .dv-lb-bar .dv-dither`,
        t: at + 0.4 + i * 0.08,
        d: 0.8,
        dir: "right",
        e: "power2.out",
        entrance: true,
      });
    }
  });
  if (block.rerank) {
    const t = block.rerank.at;
    block.rows.forEach((row, i) => {
      const after = order.indexOf(row.name);
      if (after >= 0 && after !== i) {
        cues.push({
          k: "move",
          s: `#${id}-r${i}`,
          t,
          d: 0.6,
          y: (after - i) * ROW,
          e: "soft",
          sfx: after < i ? "whoosh" : undefined,
        });
        cues.push({
          k: "swap",
          s: `#${id}-r${i} .dv-swap > span`,
          t: t + 0.3,
          d: 0,
        });
      }
    });
  }
  if (block.highlight) {
    const i = names.indexOf(block.highlight.name);
    if (i >= 0) {
      cues.push({
        k: "fill",
        s: `#${id}-r${i}`,
        t: block.highlight.at,
        d: 0.35,
        from: "rgba(71,77,235,0)",
        to: "rgba(71,77,235,0.1)",
      });
      if (block.highlight.badge) {
        cues.push(
          // An event, not an entrance: it pops when the row takes the lead, even on a static hook.
          pop(`#${id}-r${i} .dv-lb-badge`, block.highlight.at + 0.15, {
            sfx: "pop",
            entrance: false,
          })
        );
      }
    }
  }
  if (block.strike) {
    const i = names.indexOf(block.strike.name);
    if (i >= 0) {
      cues.push({
        k: "reveal",
        s: `#${id}-r${i} .dv-strike`,
        t: block.strike.at,
        d: 0.35,
        dir: "right",
        sfx: "click",
      });
      cues.push({
        k: "color",
        s: `#${id}-r${i} .dv-lb-model`,
        t: block.strike.at,
        d: 0.3,
        to: "#ef4444",
      });
    }
  }
  const html = `<div class="dv-card dv-lb" id="${id}"><div class="dv-card-body">
  ${windowBar(block.title)}
  <div class="dv-lb-head">${maskLine("#")}${maskLine("Model")}${maskLine(escapeHtml(block.column ?? ""))}</div>
  <div class="dv-lb-rows" style="height:${block.rows.length * ROW}px">${rows}</div>
</div></div>`;
  return { html, cues, hero: `#${id}`, card: true };
};
