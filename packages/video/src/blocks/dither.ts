import { escapeHtml } from "../markup";
import type { Tone } from "../spec";

/**
 * Dither Kit textures as markup. Each returns a <canvas> the runtime paints with the ordered
 * (Bayer) dither from `runtime/dither.js`; CSS sizes it, pixelated scaling keeps the cells crisp.
 */
export type Rgb = readonly [number, number, number];

/** Delulu colours as dither seeds. */
export const SEED: Record<Tone, Rgb> = {
  indigo: [71, 77, 235],
  red: [239, 68, 68],
  muted: [135, 135, 146],
  ink: [33, 33, 44],
};

type Spec =
  | {
      kind: "fill";
      color: Rgb;
      variant?: "gradient" | "dotted" | "hatched" | "solid";
      axis?: "x" | "y";
      cell?: number;
      floor?: number;
    }
  | {
      kind: "area";
      color: Rgb;
      points: ReadonlyArray<readonly [number, number]>;
      cell?: number;
    }
  | { kind: "avatar"; color: Rgb; name: string; bg?: Rgb };

export const ditherCanvas = (spec: Spec, cls = "", style = ""): string =>
  `<canvas class="dv-dither ${cls}" data-dither='${escapeHtml(JSON.stringify(spec))}'${style ? ` style="${style}"` : ""}></canvas>`;

export type ButtonVariant = "gradient" | "dotted" | "hatched" | "solid";

/** Dither Kit button: a box whose background is the dither fill, label on top. */
export const ditherButton = (
  labelHtml: string,
  {
    tone = "indigo",
    variant = "gradient",
    cls = "",
    id,
  }: { tone?: Tone; variant?: ButtonVariant; cls?: string; id?: string } = {}
): string =>
  `<span class="dv-btn ${cls}"${id ? ` id="${id}"` : ""}>${ditherCanvas({ kind: "fill", color: SEED[tone], variant: variant === "dotted" ? "gradient" : variant, cell: 5, floor: variant === "dotted" ? 0.35 : 0.72 })}${labelHtml}</span>`;
