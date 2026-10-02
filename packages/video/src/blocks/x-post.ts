import { escapeHtml, inline } from "../markup";
import type { PostBlock } from "../spec";
import { ditherCanvas, SEED } from "./dither";
import { X_ICONS } from "./icons";
import {
  type BlockContext,
  type Cue,
  maskLine,
  pop,
  type RenderedBlock,
  rise,
} from "./types";

/** How long the highlight sweep (and the cursor's drag) takes. */
export const SELECT = 0.6;

const PARAGRAPH_BREAK = /\n{2,}/;
const LINE_BREAK = /\n/g;

/** Post copy keeps its paragraphs, like X does. */
const paragraphs = (text: string) =>
  text
    .split(PARAGRAPH_BREAK)
    .map((p) => `<p>${inline(p.trim()).replace(LINE_BREAK, " ")}</p>`)
    .join("");

/**
 * An X post exactly as x.com draws it in the post view (light theme): avatar, name with the blue
 * badge, @handle, text with "Show more", the timestamp and views line, and the action bar.
 */
export const xPost = (
  block: typeof PostBlock.Type & { name: string; handle: string; text: string },
  { id, at }: BlockContext
): RenderedBlock => {
  const avatar = block.avatar
    ? `<img src="${escapeHtml(block.avatar)}" alt="">`
    : ditherCanvas({
        kind: "avatar",
        name: block.handle,
        color: SEED.indigo,
        bg: [23, 23, 29],
      });
  const stats = block.stats ?? {};
  const action = (key: "replies" | "reposts" | "likes" | "bookmarks") =>
    `<span class="dv-x-act">${X_ICONS[key]}<b>${escapeHtml(stats[key] ?? "")}</b></span>`;
  const when = [
    block.time ? `<span>${escapeHtml(block.time)}</span>` : "",
    stats.views ? `<span><b>${escapeHtml(stats.views)}</b> Views</span>` : "",
  ]
    .filter(Boolean)
    .join('<span class="dv-x-dot">·</span>');

  const html = `<div class="dv-card dv-x" id="${id}"><div class="dv-card-body">
  <div class="dv-x-head">
    <div class="dv-x-avatar">${avatar}</div>
    <div class="dv-x-who">
      ${maskLine(`<span class="dv-x-name">${escapeHtml(block.name)}${block.verified ? X_ICONS.verified : ""}</span>`)}
      ${maskLine(`<span class="dv-x-handle">${escapeHtml(block.handle)}</span>`)}
    </div>
    ${X_ICONS.more}
  </div>
  <div class="dv-x-text"><div class="dv-mask"><div class="dv-rise">${paragraphs(block.text)}${block.showMore ? '<p class="dv-x-more-link">Show more</p>' : ""}</div></div></div>
  ${when ? `<div class="dv-x-when">${maskLine(when)}</div>` : ""}
  ${block.stats ? `<div class="dv-x-actions">${action("replies")}${action("reposts")}${action("likes")}${action("bookmarks")}<span class="dv-x-act">${X_ICONS.share}</span></div>` : ""}
</div></div>`;

  const cues: Cue[] = [
    block.avatar
      ? pop(`#${id} .dv-x-avatar`, at)
      : {
          k: "ditherIn",
          s: `#${id} .dv-x-avatar .dv-dither`,
          t: at,
          d: 0.5,
          entrance: true,
        },
    rise(`#${id} .dv-x-who .dv-rise`, at + 0.08, { stagger: 0.06 }),
    pop(`#${id} .dv-x-more`, at + 0.12),
    rise(`#${id} .dv-x-text .dv-rise`, at + 0.2, { d: 0.7 }),
  ];
  if (when) {
    cues.push(rise(`#${id} .dv-x-when .dv-rise`, at + 0.34));
  }
  if (block.stats) {
    cues.push(rise(`#${id} .dv-x-act`, at + 0.4, { from: 160, stagger: 0.05 }));
  }
  if (block.text.includes("[[")) {
    const t = block.highlightAt ?? at + 1;
    const hl = `#${id} .dv-hl`;
    cues.push({ k: "highlight", s: hl, t, d: SELECT });
    if (block.select !== false) {
      // The cursor drags across the line like a real text selection.
      cues.push({
        k: "cursorIn",
        s: "@cursor",
        t: Math.max(0, t - 0.45),
        d: 0.35,
        target: hl,
        anchor: "start",
      });
      cues.push({
        k: "click",
        s: "@cursor",
        t,
        d: 0,
        target: hl,
        anchor: "start",
        pressFor: SELECT,
        sfx: "click",
      });
      cues.push({
        k: "cursorTo",
        s: "@cursor",
        t,
        d: SELECT,
        target: hl,
        anchor: "end",
        e: "none",
      });
      cues.push({ k: "cursorOut", s: "@cursor", t: t + SELECT + 0.4, d: 0.25 });
    }
  }
  return { html, cues, hero: `#${id}`, card: true };
};
