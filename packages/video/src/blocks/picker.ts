import { escapeHtml, inline } from "../markup";
import type { PickerBlock } from "../spec";
import { logo, windowBar } from "./brand";
import { ditherButton } from "./dither";
import { CHECK } from "./icons";
import { type BlockContext, type Cue, pop, type RenderedBlock } from "./types";

const TICK = CHECK.replace('stroke="#fff"', 'stroke="currentColor"');

/**
 * A model picker as the app draws it (ChatGPT, Claude…): the current model in the header, the
 * open list with logos and notes, and an optional mode switch. A cursor picks, the tick moves.
 */
export const picker = (
  block: typeof PickerBlock.Type,
  { id, at }: BlockContext
): RenderedBlock => {
  const from = block.selected ?? 0;
  const to = block.pick?.index ?? from;
  const current = (i: number) =>
    `<span>${inline(block.options[i]?.name ?? "")}</span>`;
  const header =
    from === to
      ? current(from)
      : `<span class="dv-swap">${current(from)}${current(to)}</span>`;
  const options = block.options
    .map((o, i) => {
      const tick =
        i === from || i === to
          ? `<span class="dv-pk-tick dv-pk-tick-${i === from ? "from" : "to"}">${TICK}</span>`
          : "";
      return `<div class="dv-pk-option" id="${id}-o${i}">
  ${o.logo ? logo(o.logo, "dv-pk-logo") : ""}
  <div class="dv-pk-text"><span class="dv-pk-name">${inline(o.name)}<i class="dv-strike"></i></span>${o.note ? `<span class="dv-pk-note">${inline(o.note)}</span>` : ""}</div>
  ${o.badge ? `<span class="dv-pk-badge">${escapeHtml(o.badge)}</span>` : ""}${tick}
</div>`;
    })
    .join("");
  const toggle = block.toggle
    ? `<div class="dv-pk-toggle"><span>${inline(block.toggle.label)}</span><span class="dv-switch" id="${id}-switch"><i></i></span></div>${
        block.toggle.warn
          ? `<div class="dv-pk-warn">${ditherButton(inline(block.toggle.warn), { tone: "red", cls: "dv-tag" })}</div>`
          : ""
      }`
    : "";

  const cues: Cue[] = [
    {
      k: "reveal",
      s: `#${id} .dv-pk-option`,
      t: at + 0.1,
      d: 0.35,
      dir: "down",
      stagger: 0.07,
      entrance: true,
    },
  ];
  if (from !== to) {
    cues.push({ k: "hidden", s: `#${id} .dv-pk-tick-to`, t: 0, d: 0 });
  }
  if (block.pick && from !== to) {
    const t = block.pick.at;
    const target = `#${id}-o${to}`;
    cues.push({
      k: "cursorIn",
      s: "@cursor",
      t: t - 0.8,
      d: 0.35,
      target: `#${id}-o${from}`,
      anchor: "center",
    });
    cues.push({
      k: "cursorTo",
      s: "@cursor",
      t: t - 0.45,
      d: 0.45,
      target,
      anchor: "center",
    });
    cues.push({
      k: "click",
      s: "@cursor",
      t,
      d: 0,
      target,
      anchor: "center",
      sfx: "click",
    });
    cues.push({
      k: "fill",
      s: target,
      t,
      d: 0.3,
      from: "rgba(71,77,235,0)",
      to: "rgba(71,77,235,0.1)",
    });
    cues.push({ k: "vanish", s: `#${id} .dv-pk-tick-from`, t, d: 0.2 });
    cues.push(
      pop(`#${id} .dv-pk-tick-to`, t + 0.05, { d: 0.4, entrance: false })
    );
    cues.push({
      k: "swap",
      s: `#${id} .dv-pk-current .dv-swap > span`,
      t: t + 0.1,
      d: 0,
    });
    cues.push({ k: "cursorOut", s: "@cursor", t: t + 0.8, d: 0.25 });
  }
  if (block.strike) {
    const o = `#${id}-o${block.strike.index}`;
    cues.push({
      k: "reveal",
      s: `${o} .dv-strike`,
      t: block.strike.at,
      d: 0.35,
      dir: "right",
      sfx: "click",
    });
    cues.push({
      k: "color",
      s: `${o} .dv-pk-name`,
      t: block.strike.at,
      d: 0.3,
      to: "#ef4444",
    });
  }
  if (block.toggle) {
    const t = block.toggle.at;
    const sw = `#${id}-switch`;
    cues.push({
      k: "cursorIn",
      s: "@cursor",
      t: t - 0.7,
      d: 0.35,
      target: `#${id} .dv-pk-toggle span`,
      anchor: "center",
    });
    cues.push({
      k: "cursorTo",
      s: "@cursor",
      t: t - 0.4,
      d: 0.4,
      target: sw,
      anchor: "center",
    });
    cues.push({
      k: "click",
      s: "@cursor",
      t,
      d: 0,
      target: sw,
      anchor: "center",
      sfx: "press",
    });
    cues.push({ k: "move", s: `${sw} > i`, t, d: 0.35, x: 46, e: "soft" });
    cues.push({ k: "fill", s: sw, t, d: 0.3, from: "#dedee6", to: "#ef4444" });
    if (block.toggle.warn) {
      cues.push({
        k: "reveal",
        s: `#${id} .dv-pk-warn`,
        t: t + 0.35,
        d: 0.4,
        dir: "down",
        sfx: "pop",
      });
    }
    cues.push({ k: "cursorOut", s: "@cursor", t: t + 0.9, d: 0.25 });
  }
  return {
    html: `<div class="dv-card dv-pk" id="${id}"><div class="dv-card-body">
  ${windowBar(block.app, block.logo)}
  <div class="dv-pk-current"><span class="dv-pk-label">Model</span>${header}<span class="dv-pk-caret">▾</span></div>
  <div class="dv-pk-list">${options}</div>
  ${toggle}
</div></div>`,
    cues,
    hero: `#${id}`,
    card: true,
  };
};
