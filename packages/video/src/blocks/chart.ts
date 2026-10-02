import { escapeHtml, inline } from "../markup";
import type { ChartBlock } from "../spec";
import { ditherCanvas, SEED } from "./dither";
import {
  type BlockContext,
  type Cue,
  maskLine,
  pop,
  type RenderedBlock,
  rise,
} from "./types";

const VIEW = { w: 1000, h: 520, padX: 16, padTop: 30, padBottom: 10 };
const STROKE = {
  indigo: "#474deb",
  red: "#ef4444",
  muted: "#878792",
  ink: "#21212c",
} as const;

/** Scale values into the chart's view box (highest value at the top). */
export const chartPoints = (values: readonly number[]): [number, number][] => {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const innerW = VIEW.w - VIEW.padX * 2;
  const innerH = VIEW.h - VIEW.padTop - VIEW.padBottom;
  return values.map((v, i) => [
    VIEW.padX + (innerW * i) / (values.length - 1),
    VIEW.padTop + innerH * (1 - (v - min) / span),
  ]);
};

/** Dither Kit area chart: the line draws itself over an ordered-dither area, ending on a dot. */
export const chart = (
  block: typeof ChartBlock.Type,
  { id, at }: BlockContext
): RenderedBlock => {
  const tone = block.tone ?? "indigo";
  const pts = chartPoints(block.points);
  const line = pts
    .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");
  const last = pts.at(-1) ?? [0, 0];
  const unit = pts.map(([x, y]) => [x / VIEW.w, y / VIEW.h] as const);
  const note = block.note
    ? maskLine(
        `<span class="dv-chart-note dv-r">${inline(block.note)}</span>`,
        "dv-chart-note-line"
      )
    : "";

  const html = `<div class="dv-card dv-chart" id="${id}"><div class="dv-card-body">
  <div class="dv-chart-head"><div class="dv-label">${maskLine(escapeHtml(block.label), "dv-chart-label")}</div>${note}</div>
  <div class="dv-chart-plot">
    ${ditherCanvas({ kind: "area", color: SEED[tone], points: unit, cell: 6 }, "dv-chart-area")}
    <svg viewBox="0 0 ${VIEW.w} ${VIEW.h}" preserveAspectRatio="none">
      <path class="dv-chart-line" d="${line}" stroke="${STROKE[tone]}" stroke-width="8" stroke-linecap="square" stroke-linejoin="miter" fill="none"/>
      <rect class="dv-chart-dot" x="${(last[0] - 14).toFixed(1)}" y="${(last[1] - 14).toFixed(1)}" width="28" height="28" fill="#ef4444" style="transform-box:fill-box;transform-origin:center"/>
    </svg>
  </div>
</div></div>`;

  const draw = 1.6;
  const cues: Cue[] = [
    rise(`#${id} .dv-chart-label > .dv-rise`, at),
    {
      k: "path",
      s: `#${id} .dv-chart-line`,
      t: at + 0.2,
      d: draw,
      entrance: true,
    },
    {
      k: "reveal",
      s: `#${id} .dv-chart-area`,
      t: at + 0.2,
      d: draw,
      dir: "right",
      e: "power2.inOut",
      entrance: true,
    },
    pop(`#${id} .dv-chart-dot`, at + 0.2 + draw - 0.1, { sfx: "pop" }),
  ];
  if (block.note) {
    cues.push(
      rise(`#${id} .dv-chart-note-line > .dv-rise`, at + 0.2 + draw, {
        e: "pop",
      })
    );
  }
  return { html, cues, hero: `#${id}`, card: true };
};
