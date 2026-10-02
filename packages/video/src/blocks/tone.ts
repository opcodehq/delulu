import type { Tone } from "../spec";

/** Text colour class; `ink` and `muted` fall back to the surface's own colour. */
export const textClass = (tone: Tone = "indigo"): string => {
  if (tone === "indigo") {
    return "dv-i";
  }
  if (tone === "red") {
    return "dv-r";
  }
  return "";
};
