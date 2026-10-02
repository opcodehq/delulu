import { type Cue, renderBlock } from "./blocks/index";
import { FORMATS, type Format } from "./formats";
import { escapeHtml, maskedWords } from "./markup";
import { SFX, TRACKS, trackFile } from "./sfx";
import type { Block, Reel, Scene, SfxName } from "./spec";

/** Seconds the flood takes to cover the frame, then to contract into the next hero. */
export const FLOOD_EXIT = 0.32;
export const FLOOD_ENTER = 0.36;
/** A morph leaves the outgoing card this long before the cut and lands this long after it. */
export const MORPH_LEAD = 0.25;
export const MORPH_LAND = 0.45;

type Transition = "morph" | "flood" | "push";
/** When the incoming hero card is in place, per transition. */
const ENTER: Record<Transition, number> = {
  morph: MORPH_LAND,
  flood: FLOOD_ENTER,
  push: 0,
};
/** Outgoing text starts sinking this long before the cut, so the shape leaves from an empty card. */
const EXIT_LEAD: Record<Transition, number> = {
  morph: 0.42,
  flood: 0.62,
  push: 0,
};
/** A pushed-in scene keeps the previous one on screen while it slides away. */
const PUSH_OVERLAP = 0.6;
/** Length of the closing beat that settles back onto the first frame when `loop` is on. */
export const LOOP_TAIL = 1.0;
export const DEFAULT_BPM = 120;
/** The flood colour and the card colour it hands over to (runtime/dv.css). */
const INDIGO = "#474deb";
const CARD = "#f9f9fb";

const CURSOR_SVG =
  '<svg viewBox="0 0 26 38"><path d="M3 3v26l7.2-6.9 4.6 10.9 4.7-2-4.6-10.6h9.9z" fill="#21212c" stroke="#ffffff" stroke-width="2.2" stroke-linejoin="round"/></svg>';

export interface PlanCue extends Omit<Cue, "entrance" | "noInit" | "sfx"> {
  /** When the cue's starting state is applied (scene start); absent = continue from current. */
  readonly init?: number;
  /** Apply only the starting state (used to rebuild the first frame for the loop). */
  readonly hold?: boolean;
}

export interface PlanScene {
  readonly id: string;
  readonly start: number;
  readonly end: number;
  readonly hero: string | null;
}

export interface Plan {
  readonly W: number;
  readonly H: number;
  readonly duration: number;
  /** Seconds per beat. */
  readonly beat: number;
  readonly scenes: readonly PlanScene[];
  readonly cues: readonly PlanCue[];
  readonly transitions: ReadonlyArray<{
    readonly at: number;
    readonly kind: Transition;
    /** Shared-element keys present in both scenes (a morph flows each one across). */
    readonly keys?: readonly string[];
    readonly from: number;
    readonly to: number;
  }>;
}

export interface SfxEvent {
  readonly name: SfxName;
  /** The moment the sound should hit (its peak lands here). */
  readonly at: number;
}

export interface ComposeOptions {
  /** Show the spoken-line captions (default true when the spec has captions). */
  readonly captions?: boolean;
}

export interface Composition {
  readonly html: string;
  readonly plan: Plan;
  readonly sfx: readonly SfxEvent[];
  readonly duration: number;
  readonly format: Format;
  readonly fps: 30 | 60;
}

/** The opening tag of a block's root element (where its shared-element key goes). */
const FIRST_TAG = /^<(\w+)/;
const round = (n: number) => Math.round(n * 1000) / 1000;
const snapTo = (n: number, step: number) => round(Math.round(n / step) * step);

/** Spec-authored times inside a block, snapped to the half-beat grid. */
const TIME_KEYS = new Set([
  "at",
  "until",
  "highlightAt",
  "promptAt",
  "pickAt",
  "strikeAt",
]);
const snapBlock = <T>(value: T, step: number): T => {
  if (Array.isArray(value)) {
    return value.map((v) => snapBlock(v, step)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        TIME_KEYS.has(k) && typeof v === "number"
          ? snapTo(v, step)
          : snapBlock(v, step),
      ])
    ) as T;
  }
  return value;
};

interface Timed {
  readonly scene: Scene;
  readonly id: string;
  readonly start: number;
  readonly duration: number;
  /** Rebuilds the first scene's opening frame so the reel loops. */
  readonly loopOf?: number;
}

/** Lay scenes on the beat grid; with `loop`, carve the closing beat out of the last scene. */
const layout = (reel: Reel, beat: number): Timed[] => {
  const scenes = [...reel.scenes];
  const ids = scenes.map((s, i) => s.id ?? `s${i + 1}`);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Scene ids must be unique.");
  }
  const timed: Timed[] = [];
  let t = 0;
  scenes.forEach((scene, i) => {
    let duration = Math.max(beat, snapTo(scene.duration, beat));
    if (reel.loop && i === scenes.length - 1) {
      duration = round(duration - LOOP_TAIL);
      if (duration < 1) {
        throw new Error(
          `The last scene needs at least ${LOOP_TAIL + 1}s when loop is on.`
        );
      }
    }
    timed.push({ scene, id: ids[i] ?? `s${i + 1}`, start: round(t), duration });
    t += duration;
  });
  const first = scenes[0];
  if (reel.loop && first) {
    timed.push({
      scene: { ...first, transition: "morph" },
      id: "loop",
      start: round(t),
      duration: LOOP_TAIL,
      loopOf: 0,
    });
  }
  return timed;
};

export const compose = (
  reel: Reel,
  options: ComposeOptions = {}
): Composition => {
  const format = FORMATS[reel.format ?? "reel"];
  const beat = 60 / (reel.bpm ?? DEFAULT_BPM);
  const timed = layout(reel, beat);
  const last = timed.at(-1);
  const duration = round(last ? last.start + last.duration : 0);
  const showCaptions =
    (options.captions ?? true) && (reel.captions?.length ?? 0) > 0;

  const cues: PlanCue[] = [];
  const sfx: SfxEvent[] = [];
  const planScenes: PlanScene[] = [];
  const transitions: Plan["transitions"][number][] = [];
  const sceneHtml: string[] = [];

  /** Shared-element keys a scene carries: block keys and bar-row keys. */
  const keysOf = (scene: Scene): Set<string> =>
    new Set(
      scene.blocks.flatMap((b) => [
        ...(b.key ? [b.key] : []),
        ...(b.type === "bars"
          ? b.rows.flatMap((r) => (r.key ? [r.key] : []))
          : []),
      ])
    );
  const shared = (a?: Scene, b?: Scene): Set<string> => {
    if (!(a && b)) {
      return new Set();
    }
    const kb = keysOf(b);
    return new Set([...keysOf(a)].filter((k) => kb.has(k)));
  };

  timed.forEach((entry, i) => {
    const { scene, id, start } = entry;
    const isLoop = entry.loopOf !== undefined;
    const next = timed[i + 1];
    const enteredBy: Transition | null =
      i === 0 ? null : (scene.transition ?? "morph");
    const exitsBy: Transition | null = next
      ? (next.scene.transition ?? "morph")
      : null;
    const exitAt = entry.duration - (exitsBy ? EXIT_LEAD[exitsBy] : 0);
    // Keys shared with the previous / next scene turn a morph into shared-element moves.
    const keysIn =
      enteredBy === "morph"
        ? shared(timed[i - 1]?.scene, scene)
        : new Set<string>();
    const keysOut =
      exitsBy === "morph" ? shared(scene, next?.scene) : new Set<string>();

    let hero: string | null = null;
    let heroIsCard = false;
    const blocksHtml: string[] = [];
    const local: Array<Cue & { hold?: boolean }> = [];

    scene.blocks.forEach((raw: Block, j) => {
      const block = snapBlock(raw, beat / 2);
      const blockId = `${id}-b${j + 1}`;
      const probe = renderBlock(block, { id: blockId, at: 0 });
      const isHero = !hero && probe.hero !== undefined && block.hero !== false;
      const sharedIn = block.key !== undefined && keysIn.has(block.key);
      const sharedOut = block.key !== undefined && keysOut.has(block.key);
      // Content starts arriving as its box lands, so a box is never on screen empty.
      const lands = sharedIn || (isHero && keysIn.size === 0);
      const defaultAt =
        lands && enteredBy && enteredBy !== "push"
          ? ENTER[enteredBy] + 0.02
          : isHero && !enteredBy
            ? 0.2
            : 0.1 + j * 0.1;
      const at = block.at ?? defaultAt;
      const rendered = renderBlock(block, { id: blockId, at });
      const html = block.key
        ? rendered.html.replace(FIRST_TAG, `<$1 data-key="${block.key}"`)
        : rendered.html;
      // A bar that arrives as a shared element is already drawn: skip its own entrance.
      const arrivedRows =
        block.type === "bars"
          ? block.rows.flatMap((r, n) =>
              r.key && keysIn.has(r.key) ? [`${blockId}-r${n} `] : []
            )
          : [];
      const blockCues = rendered.cues.filter(
        (c) =>
          !(
            c.entrance &&
            arrivedRows.some((r) => c.s.startsWith(`#${r}.dv-bar-fill`))
          )
      );
      blocksHtml.push(html);
      if ((probe.card || probe.box) && !isLoop) {
        if (!block.static && sharedIn && probe.card) {
          local.push({
            k: "reveal",
            s: `#${blockId} > .dv-card-body`,
            t: ENTER.morph,
            d: 0.35,
            e: "soft",
          });
        } else if (!(block.static || sharedIn) && keysIn.size > 0) {
          // A new card in a shared-element move unrolls in place.
          local.push({
            k: "reveal",
            s: `#${blockId}`,
            t: 0.15,
            d: 0.45,
            e: "soft",
            entrance: true,
          });
        }
        if (sharedOut && probe.card) {
          local.push({
            k: "retract",
            s: `#${blockId} > .dv-card-body`,
            t: exitAt,
            d: 0.2,
          });
        } else if (
          !sharedOut &&
          (keysOut.size > 0 || (exitsBy === "morph" && !isHero && probe.box))
        ) {
          // A box that does not carry on folds up (after any shared bar inside it has been taken),
          // rather than vanishing when its scene ends.
          local.push({
            k: "retract",
            s: `#${blockId}`,
            t: entry.duration - 0.3,
            d: 0.28,
          });
        }
      }
      if (isHero && probe.hero) {
        hero = probe.hero;
        heroIsCard = probe.card === true;
      }
      for (const cue of blockCues) {
        if (block.static && cue.entrance) {
          continue;
        }
        const s = cue.s === "@cursor" ? `#${id}-cursor` : cue.s;
        local.push(isLoop ? { ...cue, s, hold: true } : { ...cue, s });
      }
      // A card that arrives without a flood unrolls like a blind.
      if (
        isHero &&
        probe.card &&
        !block.static &&
        keysIn.size === 0 &&
        (enteredBy === null || enteredBy === "push")
      ) {
        local.push({
          k: "reveal",
          s: probe.hero ?? `#${blockId}`,
          t: Math.max(0, at - 0.15),
          d: 0.5,
          e: "soft",
          entrance: true,
        });
      }
    });

    const heroSel: string | null = hero;
    if (
      heroSel &&
      heroIsCard &&
      keysIn.size === 0 &&
      (enteredBy === "flood" || enteredBy === "morph")
    ) {
      if (enteredBy === "flood") {
        // The indigo flood lands as the card, which turns back to card colour while it unrolls.
        local.push({
          k: "fill",
          s: heroSel,
          t: FLOOD_ENTER,
          d: 0.4,
          from: INDIGO,
          to: CARD,
        });
      }
      local.push({
        k: "reveal",
        s: `${heroSel} > .dv-card-body`,
        t: ENTER[enteredBy],
        d: 0.35,
        e: "soft",
      });
    }
    if ((exitsBy === "flood" || exitsBy === "morph") && !isLoop) {
      // Lines sink one after another, so the scene empties as a ripple rather than all at once.
      local.push({
        k: "sink",
        s: `#${id} .dv-cam .dv-rise`,
        t: exitAt,
        d: 0.3,
        stagger: 0.025,
      });
      if (heroSel && heroIsCard && keysOut.size === 0) {
        local.push({
          k: "retract",
          s: `${heroSel} > .dv-card-body`,
          t: exitAt,
          d: exitsBy === "morph" ? 0.22 : 0.28,
        });
        if (exitsBy === "flood") {
          local.push({
            k: "fill",
            s: heroSel,
            t: exitAt,
            d: 0.28,
            to: INDIGO,
            noInit: true,
          });
        }
      }
    }

    const usesCursor = local.some((c) => c.s === `#${id}-cursor`);
    for (const cue of local) {
      const { entrance: _e, noInit, sfx: name, hold, ...rest } = cue;
      cues.push({
        ...rest,
        t: round(start + cue.t),
        ...(noInit ? {} : { init: round(start) }),
        ...(hold ? { hold: true } : {}),
      });
      if (name && !hold && reel.sfx !== false) {
        sfx.push({ name, at: round(start + cue.t) });
      }
    }

    if (enteredBy) {
      transitions.push({
        at: start,
        kind: enteredBy,
        from: i - 1,
        to: i,
        ...(keysIn.size ? { keys: [...keysIn] } : {}),
      });
      if (reel.sfx !== false) {
        const sound: Record<Transition, SfxEvent> = {
          flood: { name: "swoosh", at: round(start - FLOOD_EXIT / 2) },
          morph: { name: "whoosh", at: round(start) },
          push: { name: "whoosh", at: round(start + 0.15) },
        };
        sfx.push(sound[enteredBy]);
      }
    }

    planScenes.push({
      id,
      start,
      end: round(start + entry.duration),
      hero: heroSel,
    });

    const clipDuration = round(
      Math.min(
        duration - start,
        entry.duration + (next?.scene.transition === "push" ? PUSH_OVERLAP : 0)
      )
    );
    const cursor = usesCursor
      ? `<div class="dv-ring" id="${id}-cursor-ring"></div><div class="dv-cursor" id="${id}-cursor">${CURSOR_SVG}</div>`
      : "";
    const align = scene.align === "top" ? " dv-top" : "";
    sceneHtml.push(
      `<section id="${id}" class="clip dv-scene" data-start="${start}" data-duration="${clipDuration}" data-track-index="1" style="z-index:${i + 1}"><div class="dv-stage"><div class="dv-cam${align}">${blocksHtml.join("")}${cursor}</div></div></section>`
    );
  });

  // Captions follow the voice, not the beat: one masked line per spoken sentence.
  const captionHtml: string[] = [];
  if (showCaptions) {
    const caps = [...(reel.captions ?? [])].sort((a, b) => a.at - b.at);
    caps.forEach((cap, i) => {
      const id = `cap-${i + 1}`;
      const end = cap.end ?? caps[i + 1]?.at ?? duration;
      captionHtml.push(
        `<div class="dv-cap" id="${id}">${maskedWords(cap.text)}</div>`
      );
      // A caption at 0 is already on screen in the first frame (the hook must read instantly).
      if (cap.at > 0) {
        cues.push({
          k: "rise",
          s: `#${id} .dv-rise`,
          t: round(cap.at),
          d: 0.45,
          stagger: 0.035,
          init: 0,
        });
      }
      if (end < duration) {
        cues.push({
          k: "sink",
          s: `#${id} .dv-rise`,
          t: round(end - 0.22),
          d: 0.2,
        });
      }
    });
  }

  const plan: Plan = {
    W: format.width,
    H: format.height,
    duration,
    beat: round(beat),
    scenes: planScenes,
    cues,
    transitions,
  };
  const events = dedupeSfx(sfx, duration);
  const html = documentHtml({
    reel,
    format,
    duration,
    plan,
    sceneHtml,
    captionHtml,
    showCaptions,
    sfx: events,
  });
  return { html, plan, sfx: events, duration, format, fps: reel.fps ?? 30 };
};

/** One sound per moment: drop repeats of the same effect within 80ms, and anything off the clock. */
const dedupeSfx = (
  events: readonly SfxEvent[],
  duration: number
): SfxEvent[] => {
  const sorted = [...events].sort(
    (a, b) => a.at - b.at || a.name.localeCompare(b.name)
  );
  const kept: SfxEvent[] = [];
  for (const ev of sorted) {
    const begin = ev.at - SFX[ev.name].peak;
    if (begin < 0 || begin >= duration) {
      continue;
    }
    if (
      !kept.some((k) => k.name === ev.name && Math.abs(k.at - ev.at) < 0.08)
    ) {
      kept.push(ev);
    }
  }
  return kept;
};

interface DocumentInput {
  readonly reel: Reel;
  readonly format: Format;
  readonly duration: number;
  readonly plan: Plan;
  readonly sceneHtml: readonly string[];
  readonly captionHtml: readonly string[];
  readonly showCaptions: boolean;
  readonly sfx: readonly SfxEvent[];
}

/** Project path of the music bed: a vetted track id resolves to its cached file. */
export const musicPath = (music: string): string =>
  TRACKS[music] ? trackFile(music) : music;

const documentHtml = ({
  reel,
  format,
  duration,
  plan,
  sceneHtml,
  captionHtml,
  showCaptions,
  sfx,
}: DocumentInput): string => {
  const stageBottom =
    format.safeBottom + (showCaptions ? format.captionHeight + 40 : 0);
  const vars = [
    `--dv-safe-top:${format.safeTop}px`,
    `--dv-safe-bottom:${format.safeBottom}px`,
    `--dv-stage-bottom:${stageBottom}px`,
    `--dv-safe-x:${format.safeX}px`,
    `--dv-caption-h:${format.captionHeight}px`,
  ].join(";");

  const audio: string[] = sfx.map((ev, i) => {
    const s = SFX[ev.name];
    const begin = round(ev.at - s.peak);
    const len = round(Math.min(s.duration, duration - begin));
    return `<audio id="sfx-${i + 1}" src="assets/sfx/${ev.name}.mp3" data-start="${begin}" data-duration="${len}" data-volume="${s.volume}"></audio>`;
  });
  const voiceover = reel.audio?.voiceover;
  if (voiceover) {
    audio.push(
      `<audio id="voiceover" src="${escapeHtml(voiceover)}" data-start="0" data-duration="${duration}" data-volume="1"></audio>`
    );
  }
  const music = reel.audio?.music;
  if (music) {
    const volume = reel.audio?.musicVolume ?? (voiceover ? 0.22 : 0.6);
    const offset = reel.audio?.musicStart ?? 0;
    audio.push(
      `<audio id="music" src="${escapeHtml(musicPath(music))}" data-start="0" data-duration="${duration}" data-media-start="${offset}" data-volume="${volume}" data-fade-out="0.6"></audio>`
    );
  }

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${format.width}, height=${format.height}" />
    <title>${escapeHtml(reel.title ?? "Delulu reel")}</title>
    <style>
      @font-face { font-family: "Geist"; src: url("assets/fonts/Geist-Variable.woff2") format("woff2"); font-weight: 100 900; }
      @font-face { font-family: "Geist Mono"; src: url("assets/fonts/GeistMono-Variable.woff2") format("woff2"); font-weight: 100 900; }
      @font-face { font-family: "Inter"; src: url("assets/fonts/Inter-Variable.woff2") format("woff2"); font-weight: 100 900; }
      html, body { width: ${format.width}px; height: ${format.height}px; }
    </style>
    <link rel="stylesheet" href="runtime/dv.css" />
    <script src="runtime/gsap.min.js"></script>
    <script src="runtime/dither.js"></script>
    <script src="runtime/dv.js"></script>
  </head>
  <body>
    <div id="dv-root" data-composition-id="main" data-start="0" data-duration="${duration}" data-width="${format.width}" data-height="${format.height}" style="${vars}">
      ${sceneHtml.join("\n      ")}
      <div id="dv-morph"></div>
      <div id="dv-proxies"></div>
      <div id="dv-flood"></div>
      ${showCaptions ? `<div id="dv-captions">${captionHtml.join("")}</div>` : ""}
      ${audio.join("\n      ")}
    </div>
    <script>
      DV.mount(${JSON.stringify(plan)});
    </script>
  </body>
</html>
`;
};
