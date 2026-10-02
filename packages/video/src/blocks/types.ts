import type { SfxName } from "../spec";

export type CueKind =
  | "rise"
  | "sink"
  | "pop"
  | "reveal"
  | "retract"
  | "highlight"
  | "count"
  | "type"
  | "path"
  | "fall"
  | "swap"
  | "color"
  | "bob"
  | "hidden"
  | "move"
  | "shake"
  | "slam"
  | "wipe"
  | "fill"
  | "clipTo"
  | "ditherIn"
  | "press"
  | "cursorIn"
  | "cursorTo"
  | "cursorOut"
  | "click";

/**
 * One motion instruction for the runtime (`runtime/dv.js`). Times here are scene-local; compose
 * turns them into absolute timeline time. `entrance` cues are dropped for `static` blocks.
 */
export interface Cue {
  readonly k: CueKind;
  /** CSS selector inside the composition root. */
  readonly s: string;
  readonly t: number;
  readonly d: number;
  readonly e?: string;
  readonly sfx?: SfxName;
  readonly entrance?: boolean;
  readonly from?: number | string;
  readonly to?: number | string;
  readonly rot?: number;
  readonly rotFrom?: number;
  readonly stagger?: number;
  readonly dir?: "down" | "right" | "up";
  /** Cursor/camera cues: the element to point at or frame. `@cursor` in `s` is the scene cursor. */
  readonly target?: string;
  readonly anchor?: "start" | "end" | "center";
  /** Click: how long the button stays pressed (a drag). */
  readonly pressFor?: number;
  readonly prefix?: string;
  readonly suffix?: string;
  readonly decimals?: number;
  readonly x?: number;
  readonly y?: number;
  readonly cycle?: number;
  readonly scale?: number;
  /** Continue from the current state instead of resetting at scene start. */
  readonly noInit?: boolean;
}

export interface BlockContext {
  /** Unique DOM id for the block's root element. */
  readonly id: string;
  /** Scene-local time the block starts. */
  readonly at: number;
}

export interface RenderedBlock {
  readonly html: string;
  readonly cues: readonly Cue[];
  /** Selector of the ink surface a flood transition can land on, if the block has one. */
  readonly hero?: string;
  /** The hero is a card with a `.dv-card-body` that unrolls on entry (pills have none). */
  readonly card?: boolean;
  /** The block is a solid box (tile, chip) that should fold away rather than vanish. */
  readonly box?: boolean;
}

/** Text rising out of its mask line. */
export const rise = (s: string, t: number, extra: Partial<Cue> = {}): Cue => ({
  k: "rise",
  s,
  t,
  d: 0.6,
  entrance: true,
  ...extra,
});

/** Pop from zero on an underdamped spring. */
export const pop = (s: string, t: number, extra: Partial<Cue> = {}): Cue => ({
  k: "pop",
  s,
  t,
  d: 0.5,
  entrance: true,
  ...extra,
});

/** A masked line of display copy. */
export const maskLine = (innerHtml: string, cls = ""): string =>
  `<span class="dv-mask ${cls}"><span class="dv-rise">${innerHtml}</span></span>`;
