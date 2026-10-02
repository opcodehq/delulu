import { escapeHtml, inline } from "../markup";
import type { ChecklistBlock } from "../spec";
import { CHECK } from "./icons";
import {
  type BlockContext,
  type Cue,
  maskLine,
  pop,
  type RenderedBlock,
  rise,
} from "./types";

/** Items arrive one by one (time them to the voiceover) and get ticked. */
export const checklist = (
  block: typeof ChecklistBlock.Type,
  { id, at }: BlockContext
): RenderedBlock => {
  const cues: Cue[] = [];
  const label = block.label
    ? `<div class="dv-label">${maskLine(escapeHtml(block.label), "dv-check-label")}</div>`
    : "";
  if (block.label) {
    cues.push(rise(`#${id} .dv-check-label > .dv-rise`, at));
  }
  const items = block.items.map((item, i) => {
    const iid = `${id}-i${i}`;
    const t = item.at ?? at + 0.2 + i * 0.6;
    cues.push(pop(`#${iid} .dv-box`, t));
    cues.push(rise(`#${iid} .dv-check-text .dv-rise`, t, { stagger: 0.06 }));
    cues.push(pop(`#${iid} .dv-box-fill`, t + 0.3, { d: 0.45, sfx: "pop2" }));
    const note = item.note
      ? maskLine(`<span class="dv-label">${escapeHtml(item.note)}</span>`)
      : "";
    return `<div class="dv-check" id="${iid}"><i class="dv-box"><span class="dv-box-fill">${CHECK}</span></i><div class="dv-check-text">${maskLine(inline(item.text))}${note}</div></div>`;
  });
  return {
    html: `<div class="dv-card dv-checklist" id="${id}"><div class="dv-card-body">${label}${items.join("")}</div></div>`,
    cues,
    hero: `#${id}`,
    card: true,
  };
};
