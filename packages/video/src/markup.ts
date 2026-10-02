/**
 * Inline emphasis for every piece of reel copy:
 * - `*words*` → brand indigo (the actor)
 * - `_words_` → red (loss, cuts, warnings)
 * - `[[words]]` → marker highlight that sweeps in (post text only)
 * Everything else is HTML-escaped.
 */

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (ch) => ESCAPES[ch] ?? ch);

export type Tone = "indigo" | "red";

export interface Run {
  readonly text: string;
  readonly tone?: Tone;
  readonly highlight?: boolean;
}

const WHITESPACE = /\s+/;
const TOKEN = /\[\[(.+?)\]\]|\*(.+?)\*|_(.+?)_/g;

/** Split marked-up copy into styled runs. */
export const parseRuns = (source: string): Run[] => {
  const runs: Run[] = [];
  let last = 0;
  for (const match of source.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) {
      runs.push({ text: source.slice(last, index) });
    }
    const [, highlight, indigo, red] = match;
    if (highlight !== undefined) {
      runs.push({ text: highlight, highlight: true });
    } else if (indigo !== undefined) {
      runs.push({ text: indigo, tone: "indigo" });
    } else if (red !== undefined) {
      runs.push({ text: red, tone: "red" });
    }
    last = index + match[0].length;
  }
  if (last < source.length) {
    runs.push({ text: source.slice(last) });
  }
  return runs;
};

const TONE_CLASS: Record<Tone, string> = { indigo: "dv-i", red: "dv-r" };

const runHtml = (run: Run): string => {
  const text = escapeHtml(run.text);
  if (run.highlight) {
    return `<span class="dv-hl">${text}</span>`;
  }
  return run.tone
    ? `<span class="${TONE_CLASS[run.tone]}">${text}</span>`
    : text;
};

/** Marked-up copy → inline HTML. */
export const inline = (source: string): string =>
  parseRuns(source).map(runHtml).join("");

/** Marked-up copy → one masked span per word, so each word can rise on its own. */
export const maskedWords = (source: string): string =>
  parseRuns(source)
    .flatMap((run) =>
      run.text
        .split(WHITESPACE)
        .filter(Boolean)
        .map((word) => runHtml({ ...run, text: word }))
    )
    .map(
      (word) =>
        `<span class="dv-mask dv-inline"><span class="dv-rise">${word}</span></span>`
    )
    .join("");
