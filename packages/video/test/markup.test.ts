import { describe, expect, it } from "vitest";
import { escapeHtml, inline, parseRuns } from "../src/markup";

describe("markup", () => {
  it("splits emphasis into runs", () => {
    expect(parseRuns("cut your plan *in* _half_ [[now]]")).toEqual([
      { text: "cut your plan " },
      { text: "in", tone: "indigo" },
      { text: " " },
      { text: "half", tone: "red" },
      { text: " " },
      { text: "now", highlight: true },
    ]);
  });

  it("escapes HTML in every run", () => {
    expect(inline("<b>&</b> *<i>*")).toBe(
      '&lt;b&gt;&amp;&lt;/b&gt; <span class="dv-i">&lt;i&gt;</span>'
    );
    expect(escapeHtml(`"'`)).toBe("&quot;&#39;");
  });

  it("never treats markers inside words as emphasis", () => {
    expect(parseRuns("my_var and other_var")).toEqual([
      { text: "my_var and other_var" },
    ]);
    expect(parseRuns("2*3*4 = 24")).toEqual([{ text: "2*3*4 = 24" }]);
    expect(parseRuns("plan _in half._")).toEqual([
      { text: "plan " },
      { text: "in half.", tone: "red" },
    ]);
  });

  it("leaves plain words with underscores inside them alone", () => {
    expect(parseRuns("snake_case is fine")).toEqual([
      { text: "snake_case is fine" },
    ]);
  });
});
