import { escapeHtml, inline } from "../markup";
import type { PollBlock } from "../spec";
import { ditherButton } from "./dither";
import { ARROW_DOWN, CHECK } from "./icons";
import {
  type BlockContext,
  type Cue,
  maskLine,
  pop,
  type RenderedBlock,
  rise,
} from "./types";

/** "Downgrade or upgrade?" — a card of Dither Kit buttons, a cursor pick, and a call to comment. */
export const poll = (
  block: typeof PollBlock.Type,
  { id, at }: BlockContext
): RenderedBlock => {
  const fallback = ["red", "indigo"] as const;
  const options = block.options
    .map((o, i) =>
      ditherButton(
        `<span>${inline(o.text)}</span><span class="dv-pick">${CHECK.replace('stroke="#fff"', 'stroke="#21212c"')}</span>`,
        {
          tone: o.tone ?? fallback[i],
          cls: "dv-option",
          id: `${id}-o${i}`,
        }
      )
    )
    .join("");
  const question = block.question
    ? `<div class="dv-poll-q">${maskLine(inline(block.question))}</div>`
    : "";
  const cues: Cue[] = [];
  if (block.question) {
    cues.push(rise(`#${id} .dv-poll-q .dv-rise`, at));
  }
  cues.push(pop(`#${id}-o0`, at + 0.15, { from: 0.6, sfx: "pop" }));
  cues.push(pop(`#${id}-o1`, at + 0.4, { from: 0.6, sfx: "pop" }));
  // Pick marks start hidden; the picked one pops when clicked.
  cues.push({ k: "hidden", s: `#${id} .dv-pick`, t: 0, d: 0 });

  if (block.pick !== undefined) {
    const t = block.pickAt ?? at + 1.4;
    const option = `#${id}-o${block.pick}`;
    cues.push({
      k: "cursorIn",
      s: "@cursor",
      t: t - 0.9,
      d: 0.35,
      target: `#${id}-o${1 - block.pick}`,
      anchor: "center",
    });
    cues.push({
      k: "cursorTo",
      s: "@cursor",
      t: t - 0.5,
      d: 0.45,
      target: option,
      anchor: "center",
    });
    cues.push({
      k: "click",
      s: "@cursor",
      t,
      d: 0,
      target: option,
      anchor: "center",
      sfx: "press",
    });
    cues.push({ k: "press", s: option, t, d: 0.43 });
    cues.push(
      pop(`${option} .dv-pick`, t + 0.05, {
        d: 0.45,
        entrance: false,
        sfx: "pop2",
      })
    );
    cues.push({ k: "cursorOut", s: "@cursor", t: t + 0.9, d: 0.25 });
  }

  let prompt = "";
  if (block.prompt) {
    const t = block.promptAt ?? at + 2;
    prompt = `<div class="dv-poll-prompt">${maskLine(escapeHtml(block.prompt), "dv-poll-prompt-line")}<span class="dv-poll-arrow-wrap">${ARROW_DOWN}</span></div>`;
    cues.push(
      rise(`#${id} .dv-poll-prompt-line > .dv-rise`, t, { sfx: "chime" })
    );
    cues.push(pop(`#${id} .dv-poll-arrow`, t + 0.2));
    cues.push({
      k: "bob",
      s: `#${id} .dv-poll-arrow-wrap`,
      t: t + 0.6,
      d: 2,
      y: 16,
    });
  }
  return {
    html: `<div class="dv-poll-wrap" id="${id}"><div class="dv-card dv-poll" id="${id}-card"><div class="dv-card-body">${question}${options}</div></div>${prompt}</div>`,
    cues,
    hero: `#${id}-card`,
    card: true,
  };
};
