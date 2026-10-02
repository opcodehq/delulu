import { escapeHtml, inline } from "../markup";
import type { AgentBlock } from "../spec";
import { windowBar } from "./brand";
import { ditherButton, ditherCanvas, SEED } from "./dither";
import { CHECK } from "./icons";
import {
  type BlockContext,
  type Cue,
  maskLine,
  pop,
  type RenderedBlock,
  rise,
} from "./types";

/**
 * An always-on agent in an app window: a live status, its own browser (the page scrolls while
 * it works), a task log that ticks, and your usage meter, which does not move.
 */
export const agent = (
  block: typeof AgentBlock.Type,
  { id, at }: BlockContext
): RenderedBlock => {
  const usage = block.usage ?? 0.32;
  const tasks = block.tasks
    .map(
      (task, i) =>
        `<div class="dv-ag-task" id="${id}-k${i}"><i class="dv-box"><span class="dv-box-fill">${CHECK}</span></i>${maskLine(`<span>${inline(task.text)}</span>`)}</div>`
    )
    .join("");
  const page = Array.from(
    { length: 9 },
    (_, i) =>
      `<i style="width:${[92, 64, 78, 40, 88, 70, 56, 84, 48][i]}%"></i>`
  ).join("");
  const cues: Cue[] = [
    rise(`#${id} .dv-ag-status .dv-rise`, at, { stagger: 0.06 }),
    {
      k: "reveal",
      s: `#${id} .dv-ag-browser`,
      t: at + 0.15,
      d: 0.5,
      dir: "down",
      e: "soft",
      entrance: true,
    },
    { k: "type", s: `#${id} .dv-ag-url`, t: at + 0.4, d: 0.6, entrance: true },
    // The agent's own browser keeps scrolling while it works.
    {
      k: "move",
      s: `#${id} .dv-ag-page`,
      t: at + 0.6,
      d: 6,
      y: -260,
      e: "sine.inOut",
    },
    rise(`#${id} .dv-ag-usage .dv-rise`, at + 0.3),
    {
      k: "reveal",
      s: `#${id} .dv-ag-usage .dv-dither`,
      t: at + 0.5,
      d: 0.7,
      dir: "right",
      e: "power2.out",
      entrance: true,
    },
  ];
  block.tasks.forEach((task, i) => {
    cues.push(pop(`#${id}-k${i} .dv-box`, task.at));
    cues.push(rise(`#${id}-k${i} .dv-rise`, task.at));
    cues.push(
      pop(`#${id}-k${i} .dv-box-fill`, task.at + 0.3, { d: 0.45, sfx: "pop2" })
    );
  });
  if (block.usageNote) {
    cues.push({
      k: "reveal",
      s: `#${id} .dv-ag-note`,
      t: block.usageNoteAt ?? at + 2,
      d: 0.4,
      dir: "down",
      sfx: "chime",
    });
  }
  return {
    html: `<div class="dv-card dv-ag" id="${id}"><div class="dv-card-body">
  ${windowBar(block.app, block.logo)}
  <div class="dv-ag-status">${maskLine(`<span class="dv-ag-name">${inline(block.name)}</span>`)}${maskLine(`<span class="dv-ag-live"><i></i>${escapeHtml(block.status)}</span>`)}</div>
  <div class="dv-ag-browser"><div class="dv-ag-bar"><span class="dv-lights"><i></i><i></i><i></i></span><span class="dv-ag-url">${escapeHtml(block.browse ?? "browsing…")}</span></div><div class="dv-ag-view"><div class="dv-ag-page">${page}</div></div></div>
  <div class="dv-ag-tasks">${tasks}</div>
  <div class="dv-ag-usage">${maskLine('<span class="dv-label">Your usage</span>')}<div class="dv-ag-meter">${ditherCanvas({ kind: "fill", color: SEED.indigo, variant: "gradient", axis: "x", cell: 5 }, "", `width:${(usage * 100).toFixed(1)}%`)}</div>${
    block.usageNote
      ? `<div class="dv-ag-note">${ditherButton(inline(block.usageNote), { tone: "indigo", cls: "dv-tag" })}</div>`
      : ""
  }</div>
</div></div>`,
    cues,
    hero: `#${id}`,
    card: true,
  };
};
