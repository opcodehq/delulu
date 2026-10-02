import { escapeHtml, inline } from "../markup";
import type { BarsBlock } from "../spec";
import { ditherCanvas, SEED } from "./dither";
import {
  type BlockContext,
  type Cue,
  maskLine,
  type RenderedBlock,
  rise,
} from "./types";

const pct = (n: number) => `${Math.max(0, Math.min(100, n * 100)).toFixed(3)}%`;

/** Labelled bars that draw in, count up, and can later be cut (the cut piece falls away) or grow. */
export const bars = (
  block: typeof BarsBlock.Type,
  { id, at }: BlockContext
): RenderedBlock => {
  const fmt = (n: number) => `${block.prefix ?? ""}${n}${block.suffix ?? ""}`;
  const cues: Cue[] = [];
  const label = block.label
    ? `<div class="dv-label">${maskLine(escapeHtml(block.label), "dv-bars-label")}</div>`
    : "";
  if (block.label) {
    cues.push(rise(`#${id} .dv-bars-label > .dv-rise`, at));
  }

  const rows = block.rows.map((row, i) => {
    const rid = `${id}-r${i}`;
    const t = row.at ?? at + 0.15 + i * 0.45;
    const change = row.change;
    // The fill canvas spans the larger of the two values; clip edges show the current one.
    const top = Math.max(row.value, change?.value ?? 0) / row.max;
    const tone = row.tone ?? "indigo";
    const frac = (v: number) => (top === 0 ? 0 : v / row.max / top);
    const fill = ditherCanvas(
      { kind: "fill", color: SEED[tone], variant: "gradient", axis: "x" },
      "dv-bar-fill",
      `width:${pct(top)}`
    ).replace(
      "<canvas ",
      // A keyed bar hands over from the part that is showing when its scene ends (after any cut).
      `<canvas ${row.key ? `data-key="${row.key}" data-key-visible="${Number(frac(change?.value ?? row.value).toFixed(4))}" ` : ""}`
    );
    const cut =
      change && change.value < row.value
        ? ditherCanvas(
            { kind: "fill", color: SEED.red, variant: "hatched", axis: "x" },
            "dv-bar-cut",
            `left:${pct(change.value / row.max)};width:${pct((row.value - change.value) / row.max)}`
          )
        : "";
    const note = row.note
      ? change?.note
        ? `<span class="dv-swap dv-label dv-bar-note"><span>${escapeHtml(row.note)}</span><span class="dv-r">${escapeHtml(change.note)}</span></span>`
        : `<span class="dv-label dv-bar-note">${escapeHtml(row.note)}</span>`
      : "";

    cues.push(rise(`#${rid} .dv-bar-top .dv-rise`, t, { stagger: 0.06 }));
    cues.push({
      k: "clipTo",
      s: `#${rid} .dv-bar-fill`,
      t: t + 0.25,
      d: 1,
      to: frac(row.value),
      e: "power2.out",
      entrance: true,
    });
    cues.push({
      k: "count",
      s: `#${rid} .dv-bar-num`,
      t: t + 0.25,
      d: 1,
      from: 0,
      to: row.value,
      prefix: block.prefix,
      suffix: block.suffix,
      entrance: true,
    });

    if (change) {
      const land = change.at + 0.35;
      if (change.value < row.value) {
        cues.push({
          k: "reveal",
          s: `#${rid} .dv-bar-cut`,
          t: change.at,
          d: 0.3,
          dir: "right",
          sfx: "click",
        });
        cues.push({
          k: "fall",
          s: `#${rid} .dv-bar-cut`,
          t: land,
          d: 0.6,
          sfx: "whoosh",
        });
      }
      cues.push({
        k: "clipTo",
        s: `#${rid} .dv-bar-fill`,
        t: land,
        d: change.value < row.value ? 0.01 : 0.7,
        to: frac(change.value),
        noInit: true,
        sfx: change.value < row.value ? undefined : "pop2",
      });
      cues.push({
        k: "count",
        s: `#${rid} .dv-bar-num`,
        t: land,
        d: 0.6,
        from: row.value,
        to: change.value,
        prefix: block.prefix,
        suffix: block.suffix,
        noInit: true,
      });
      cues.push({
        k: "color",
        s: `#${rid} .dv-bar-num`,
        t: land,
        d: 0.2,
        to: change.value < row.value ? "#ff8a8a" : "#9ea2ff",
      });
      if (row.note && change.note) {
        cues.push({ k: "swap", s: `#${rid} .dv-swap > span`, t: land, d: 0 });
      }
    }

    return `<div class="dv-bar-row" id="${rid}">
  <div class="dv-bar-top">
    <div>${maskLine(`<span class="dv-bar-name">${inline(row.name)}</span>`)}${note ? maskLine(note) : ""}</div>
    ${maskLine(`<span class="dv-bar-value"><span class="dv-bar-num">${escapeHtml(fmt(row.value))}</span></span>`)}
  </div>
  <div class="dv-track">${fill}${cut}</div>
</div>`;
  });

  return {
    html: `<div class="dv-card dv-bars" id="${id}"><div class="dv-card-body">${label}${rows.join("")}</div></div>`,
    cues,
    hero: `#${id}`,
    card: true,
  };
};
