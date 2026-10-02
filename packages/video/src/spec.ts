import { Schema } from "effect";

/**
 * The reel spec: everything a person or agent writes to get a video. Scenes play in order; each
 * scene stacks blocks (components) inside the safe area. Times are scene-local seconds, so a
 * block or list item can start on the exact word of a voiceover.
 */

const Seconds = Schema.Number.check(Schema.isGreaterThanOrEqualTo(0));
const Duration = Schema.Number.check(Schema.isGreaterThan(0));
const Unit = Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 1 }));
const Copy = Schema.NonEmptyString;
const Key = Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9-]*$/));

export const Tone = Schema.Literals(["indigo", "red", "muted", "ink"]);
export type Tone = typeof Tone.Type;

export const SfxName = Schema.Literals([
  "click",
  "press",
  "pop",
  "pop2",
  "whoosh",
  "swoosh",
  "chime",
]);
export type SfxName = typeof SfxName.Type;

/** Fields every block accepts. */
const common = {
  /** Scene-local start time. Defaults to a short stagger after the scene enters. */
  at: Schema.optional(Seconds),
  /** Render already in place, with no entrance (use for the very first frame of a hook). */
  static: Schema.optional(Schema.Boolean),
  /** Whether this block is the scene's hero card that the flood transition lands on. */
  hero: Schema.optional(Schema.Boolean),
  /**
   * Shared-element id. A block with the same key in the next scene is the same object: it flows
   * there (position, size, corners and colour on one spring) instead of leaving and re-entering.
   */
  key: Schema.optional(Key),
};

const Count = Schema.Struct({
  from: Schema.Number,
  to: Schema.Number,
  prefix: Schema.optional(Schema.String),
  suffix: Schema.optional(Schema.String),
  decimals: Schema.optional(Schema.Number),
});
export type Count = typeof Count.Type;

export const HeadlineBlock = Schema.Struct({
  type: Schema.Literal("headline"),
  ...common,
  kicker: Schema.optional(Copy),
  /** One display line per entry. Mark words with *indigo* or _red_. */
  lines: Schema.NonEmptyArray(Copy),
  size: Schema.optional(Schema.Literals(["xl", "l", "m"])),
  align: Schema.optional(Schema.Literals(["start", "center"])),
});

export const PostBlock = Schema.Struct({
  type: Schema.Literal("post"),
  ...common,
  platform: Schema.Literals(["x", "threads", "linkedin", "instagram"]),
  /**
   * The real post's URL (x.com / twitter.com status link). At build time the author, avatar,
   * verified badge, exact text, time and counts are fetched from it; anything you set here wins.
   */
  source: Schema.optional(Copy),
  /** IANA time zone for the post's timestamp (default UTC). */
  timeZone: Schema.optional(Copy),
  name: Schema.optional(Copy),
  handle: Schema.optional(Copy),
  /** Avatar image path (project-relative) or URL; falls back to a Dither Kit avatar. */
  avatar: Schema.optional(Copy),
  initials: Schema.optional(Copy),
  verified: Schema.optional(Schema.Boolean),
  /**
   * Post copy. With a `source`, this is an excerpt and must appear word for word in the real
   * post (markup aside). Wrap the line to call out in [[double brackets]].
   */
  text: Schema.optional(Copy),
  /** Show the platform's "Show more" link (on by default when the excerpt is shorter than the post). */
  showMore: Schema.optional(Schema.Boolean),
  /** Display timestamp, e.g. "11:41 PM · Sep 28, 2026". */
  time: Schema.optional(Copy),
  meta: Schema.optional(Copy),
  stats: Schema.optional(
    Schema.Struct({
      replies: Schema.optional(Copy),
      reposts: Schema.optional(Copy),
      likes: Schema.optional(Copy),
      bookmarks: Schema.optional(Copy),
      views: Schema.optional(Copy),
    })
  ),
  /** When the [[highlight]] sweeps in. */
  highlightAt: Schema.optional(Seconds),
  /** A cursor drags across the highlight like a text selection (default on). */
  select: Schema.optional(Schema.Boolean),
});

export const StatBlock = Schema.Struct({
  type: Schema.Literal("stat"),
  ...common,
  label: Schema.optional(Copy),
  /** The old value, shown muted and struck through. */
  from: Schema.optional(Copy),
  to: Copy,
  tone: Schema.optional(Tone),
  count: Schema.optional(Count),
});

export const BarRow = Schema.Struct({
  /** Shared-element id for this row's bar (it can become a tile or card in the next scene). */
  key: Schema.optional(Key),
  name: Copy,
  note: Schema.optional(Copy),
  value: Schema.Number,
  max: Duration,
  tone: Schema.optional(Tone),
  at: Schema.optional(Seconds),
  /** Later in the scene the bar is cut (or grows) to a new value. */
  change: Schema.optional(
    Schema.Struct({
      at: Seconds,
      value: Schema.Number,
      note: Schema.optional(Copy),
    })
  ),
});

export const BarsBlock = Schema.Struct({
  type: Schema.Literal("bars"),
  ...common,
  label: Schema.optional(Copy),
  rows: Schema.NonEmptyArray(BarRow),
  prefix: Schema.optional(Schema.String),
  suffix: Schema.optional(Schema.String),
});

export const ChecklistBlock = Schema.Struct({
  type: Schema.Literal("checklist"),
  ...common,
  label: Schema.optional(Copy),
  items: Schema.NonEmptyArray(
    Schema.Struct({
      text: Copy,
      note: Schema.optional(Copy),
      at: Schema.optional(Seconds),
    })
  ),
});

export const ChartBlock = Schema.Struct({
  type: Schema.Literal("chart"),
  ...common,
  label: Copy,
  note: Schema.optional(Copy),
  tone: Schema.optional(Tone),
  /** Values left → right; the chart scales them to fit. At least two. */
  points: Schema.NonEmptyArray(Schema.Number).check(Schema.isMinLength(2)),
});

const VersusSide = Schema.Struct({
  label: Copy,
  value: Copy,
  sub: Copy,
  meter: Unit,
  tone: Schema.optional(Tone),
  count: Schema.optional(Count),
});

export const VersusBlock = Schema.Struct({
  type: Schema.Literal("versus"),
  ...common,
  left: VersusSide,
  right: VersusSide,
});

export const RowsBlock = Schema.Struct({
  type: Schema.Literal("rows"),
  ...common,
  rows: Schema.NonEmptyArray(
    Schema.Struct({
      text: Copy,
      tag: Copy,
      tone: Schema.optional(Tone),
      style: Schema.optional(Schema.Literals(["solid", "outline"])),
      at: Schema.optional(Seconds),
      /** Strike the row out later (e.g. a promise that does not hold). */
      strikeAt: Schema.optional(Seconds),
    })
  ),
});

export const QuoteBlock = Schema.Struct({
  type: Schema.Literal("quote"),
  ...common,
  text: Copy,
  by: Schema.optional(Copy),
  stamp: Schema.optional(
    Schema.Struct({
      text: Copy,
      tone: Schema.optional(Tone),
      at: Schema.optional(Seconds),
    })
  ),
});

export const PollBlock = Schema.Struct({
  type: Schema.Literal("poll"),
  ...common,
  options: Schema.Tuple([
    Schema.Struct({ text: Copy, tone: Schema.optional(Tone) }),
    Schema.Struct({ text: Copy, tone: Schema.optional(Tone) }),
  ]),
  question: Schema.optional(Copy),
  prompt: Schema.optional(Copy),
  promptAt: Schema.optional(Seconds),
  /** A cursor clicks this option (0 or 1) at `pickAt`. */
  pick: Schema.optional(Schema.Literals([0, 1])),
  pickAt: Schema.optional(Seconds),
});

/** A big dithered value box ("10x"), the kind of thing a bar or a card can turn into. */
export const TileBlock = Schema.Struct({
  type: Schema.Literal("tile"),
  ...common,
  value: Copy,
  label: Schema.optional(Copy),
  tone: Schema.optional(Tone),
});

/**
 * A plan card whose usage gets slashed while the price stays put: the bar trembles, a blade cuts
 * straight through it, the frame jolts, the cut-off part tumbles out and the number counts down.
 */
export const CutBlock = Schema.Struct({
  type: Schema.Literal("cut"),
  ...common,
  /** Logo image (project-relative path) shown above the card. */
  logo: Schema.optional(Copy),
  label: Schema.optional(Copy),
  /** The price that does NOT change, e.g. "$200". */
  price: Copy,
  priceSub: Schema.optional(Copy),
  usageLabel: Schema.optional(Copy),
  /** Usage before and after the cut; the bar is cut at to/from. */
  from: Schema.Number.check(Schema.isGreaterThan(0)),
  to: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)),
  suffix: Schema.optional(Schema.String),
  /** Scene-local time the blade goes through. */
  cutAt: Schema.optional(Seconds),
});

/** A small label pill ("PRO · $200"). */
export const ChipBlock = Schema.Struct({
  type: Schema.Literal("chip"),
  ...common,
  text: Copy,
});

export const WordmarkBlock = Schema.Struct({
  type: Schema.Literal("wordmark"),
  ...common,
  text: Copy,
});

export const Block = Schema.Union([
  HeadlineBlock,
  PostBlock,
  StatBlock,
  BarsBlock,
  ChecklistBlock,
  ChartBlock,
  VersusBlock,
  RowsBlock,
  QuoteBlock,
  PollBlock,
  TileBlock,
  ChipBlock,
  CutBlock,
  WordmarkBlock,
]);
export type Block = typeof Block.Type;
export type BlockType = Block["type"];

export const Scene = Schema.Struct({
  id: Schema.optional(
    Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9-]*$/))
  ),
  duration: Duration,
  /**
   * How this scene arrives. `morph` (default): the previous card flows on a spring into this
   * scene's card. `flood`: an indigo shape fills the frame and contracts in (save it for the big
   * moment). `push`: this scene slides in over the previous one.
   */
  transition: Schema.optional(Schema.Literals(["morph", "flood", "push"])),
  align: Schema.optional(Schema.Literals(["center", "top"])),
  blocks: Schema.NonEmptyArray(Block),
});
export type Scene = typeof Scene.Type;

export const Caption = Schema.Struct({
  /** Absolute seconds from the start of the reel. */
  at: Seconds,
  /** Defaults to the next caption's start (or the end of the reel). */
  end: Schema.optional(Seconds),
  text: Copy,
});
export type Caption = typeof Caption.Type;

export const Reel = Schema.Struct({
  title: Schema.optional(Copy),
  format: Schema.optional(Schema.Literals(["reel", "portrait", "square"])),
  fps: Schema.optional(Schema.Literals([30, 60])),
  scenes: Schema.NonEmptyArray(Scene),
  /** Spoken lines shown as captions. Omit (or render with captions off) for a clean b-roll cut. */
  captions: Schema.optional(Schema.Array(Caption)),
  /** End on the first frame so the reel loops seamlessly into its hook. */
  loop: Schema.optional(Schema.Boolean),
  /** Tempo of the cut (default 120). Scene lengths snap to whole beats, block times to half beats. */
  bpm: Schema.optional(
    Schema.Number.check(Schema.isBetween({ minimum: 60, maximum: 200 }))
  ),
  sfx: Schema.optional(Schema.Boolean),
  audio: Schema.optional(
    Schema.Struct({
      voiceover: Schema.optional(Copy),
      /** A project-relative file, or a vetted track id such as "mixkit:201". */
      music: Schema.optional(Copy),
      /** Seconds into the track to start from (pick it so the drop lands on your key beat). */
      musicStart: Schema.optional(Seconds),
      musicVolume: Schema.optional(Unit),
    })
  ),
});
export type Reel = typeof Reel.Type;

/** Validate untrusted JSON into a reel spec. Throws a readable SchemaError on bad input. */
export const decodeReel = Schema.decodeUnknownSync(Reel);
