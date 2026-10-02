import { escapeHtml } from "../markup";
import type { TerminalBlock } from "../spec";
import { windowBar } from "./brand";
import {
  type BlockContext,
  type Cue,
  maskLine,
  type RenderedBlock,
} from "./types";

/** Characters per second a line types at (capped so long lines still land on their beat). */
const CPS = 55;

/**
 * An agent or terminal run in an app window: each line types out on its beat, and live counters
 * (tokens, cost, time) spin up underneath.
 */
export const terminal = (
  block: typeof TerminalBlock.Type,
  { id, at }: BlockContext
): RenderedBlock => {
  const cues: Cue[] = [];
  const lines = block.lines
    .map((line, i) => {
      const t = line.at ?? at + 0.4 + i * 0.6;
      cues.push({
        k: "type",
        s: `#${id}-l${i}`,
        t,
        d: Math.min(0.9, line.text.length / CPS),
        entrance: true,
      });
      return `<div class="dv-term-line dv-term-${line.tone ?? "ink"}" id="${id}-l${i}">${escapeHtml(line.text)}</div>`;
    })
    .join("");
  const meters = (block.meters ?? [])
    .map((m, i) => {
      cues.push(maskRise(`#${id}-m${i} .dv-rise`, at + 0.2 + i * 0.08));
      cues.push({
        k: "count",
        s: `#${id}-m${i} .dv-term-num`,
        t: m.at,
        d: m.d ?? 1.6,
        from: m.from,
        to: m.to,
        prefix: m.prefix,
        suffix: m.suffix,
        decimals: m.decimals,
        e: "power1.inOut",
        entrance: true,
      });
      const tone =
        m.tone === "red" ? " dv-r" : m.tone === "indigo" ? " dv-i" : "";
      return `<div class="dv-term-meter" id="${id}-m${i}">${maskLine(`<span class="dv-label">${escapeHtml(m.label)}</span>`)}${maskLine(
        `<span class="dv-term-num${tone}">${escapeHtml(`${m.prefix ?? ""}${m.from.toFixed(m.decimals ?? 0)}${m.suffix ?? ""}`)}</span>`
      )}</div>`;
    })
    .join("");
  return {
    html: `<div class="dv-card dv-term" id="${id}"><div class="dv-card-body">
  ${windowBar(block.title, block.logo)}
  <div class="dv-term-body">${lines}<span class="dv-term-caret"></span></div>
  ${meters ? `<div class="dv-term-meters">${meters}</div>` : ""}
</div></div>`,
    cues,
    hero: `#${id}`,
    card: true,
  };
};

const maskRise = (s: string, t: number): Cue => ({
  k: "rise",
  s,
  t,
  d: 0.5,
  entrance: true,
});
