/** Canvas sizes and the safe areas platform UI leaves clear (all 1080px wide). */

export type FormatName = "reel" | "portrait" | "square";

export interface Format {
  readonly width: number;
  readonly height: number;
  /** Clear of the platform's top chrome. */
  readonly safeTop: number;
  /** Clear of the caption, username and action rail at the bottom. */
  readonly safeBottom: number;
  readonly safeX: number;
  /** Height reserved above `safeBottom` when spoken captions are on. */
  readonly captionHeight: number;
}

export const FORMATS: Record<FormatName, Format> = {
  // Instagram Reels / TikTok / Shorts: the bottom ~380px sits under the caption and buttons.
  reel: {
    width: 1080,
    height: 1920,
    safeTop: 230,
    safeBottom: 380,
    safeX: 84,
    captionHeight: 200,
  },
  portrait: {
    width: 1080,
    height: 1350,
    safeTop: 110,
    safeBottom: 110,
    safeX: 84,
    captionHeight: 150,
  },
  square: {
    width: 1080,
    height: 1080,
    safeTop: 90,
    safeBottom: 90,
    safeX: 84,
    captionHeight: 140,
  },
};
