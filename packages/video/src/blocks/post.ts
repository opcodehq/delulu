import { escapeHtml, inline } from "../markup";
import type { PostBlock } from "../spec";
import { ditherCanvas, SEED } from "./dither";
import { PLATFORM_ICONS, STAT_ICONS, VERIFIED } from "./icons";
import {
  type BlockContext,
  type Cue,
  maskLine,
  pop,
  type RenderedBlock,
  rise,
} from "./types";
import { SELECT, xPost } from "./x-post";

/** A social post card (X, Threads, LinkedIn, Instagram) with a Dither Kit avatar. */
export const post = (
  input: typeof PostBlock.Type,
  ctx: BlockContext
): RenderedBlock => {
  const { name, handle, text } = input;
  if (!(name && handle && text)) {
    throw new Error(
      `Post ${ctx.id} needs a name, handle and text. Set them, or set "source" to a real post link (resolved at build time).`
    );
  }
  const block = { ...input, name, handle, text };
  if (block.platform === "x") {
    return xPost(block, ctx);
  }
  const { id, at } = ctx;
  const avatar = block.avatar
    ? `<img src="${escapeHtml(block.avatar)}" alt="">`
    : ditherCanvas({
        kind: "avatar",
        name: block.handle,
        color: SEED.indigo,
        bg: [23, 23, 29],
      });
  const stats = block.stats
    ? `<div class="dv-post-stats">${(
        ["replies", "reposts", "likes", "views"] as const
      )
        .filter((key) => block.stats?.[key])
        .map(
          (key) =>
            `<span>${STAT_ICONS[key]}${escapeHtml(block.stats?.[key] ?? "")}</span>`
        )
        .join("")}</div>`
    : "";
  const meta = block.meta
    ? `<div class="dv-post-meta">${maskLine(escapeHtml(block.meta))}</div>`
    : "";

  const html = `<div class="dv-card dv-post" id="${id}"><div class="dv-card-body">
  <div class="dv-post-head">
    <div class="dv-avatar">${avatar}</div>
    <div class="dv-post-who">
      ${maskLine(`<span class="dv-post-name">${escapeHtml(block.name)}${block.verified ? VERIFIED : ""}</span>`)}
      ${maskLine(`<span class="dv-post-handle">${escapeHtml(block.handle)}</span>`)}
    </div>
    ${PLATFORM_ICONS[block.platform]}
  </div>
  <div class="dv-post-text">${maskLine(inline(block.text))}</div>
  ${meta}
  ${stats}
</div></div>`;

  const cues: Cue[] = [
    {
      k: "ditherIn",
      s: `#${id} .dv-avatar .dv-dither`,
      t: at,
      d: 0.5,
      entrance: true,
    },
    rise(`#${id} .dv-post-who .dv-rise`, at + 0.08, { stagger: 0.06 }),
    pop(`#${id} .dv-platform`, at + 0.12),
    rise(`#${id} .dv-post-text .dv-rise`, at + 0.2, { d: 0.7 }),
  ];
  if (block.avatar) {
    cues.shift();
    cues.unshift(pop(`#${id} .dv-avatar`, at));
  }
  if (block.meta) {
    cues.push(rise(`#${id} .dv-post-meta .dv-rise`, at + 0.34));
  }
  if (block.stats) {
    cues.push(
      rise(`#${id} .dv-post-stats span`, at + 0.4, { from: 160, stagger: 0.05 })
    );
  }
  if (block.text.includes("[[")) {
    const t = block.highlightAt ?? at + 1;
    const hl = `#${id} .dv-hl`;
    cues.push({ k: "highlight", s: hl, t, d: SELECT });
    if (block.select !== false) {
      // The cursor drags across the line like a text selection.
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
