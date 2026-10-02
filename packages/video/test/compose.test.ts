// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { compose, FLOOD_EXIT, LOOP_TAIL, textOnlyScenes } from "../src/compose";
import { SFX } from "../src/sfx";
import { decodeReel } from "../src/spec";
import { sampleReel } from "./fixtures";

const AT_LEAST = /at least/;
const RESERVED = /reserved/;
const dom = (html: string) =>
  new DOMParser().parseFromString(html, "text/html");

describe("compose", () => {
  const reel = sampleReel();
  const out = compose(reel);
  const doc = dom(out.html);

  it("lays scenes back to back and carves the loop beat out of the last scene", () => {
    expect(out.duration).toBe(48);
    const last = out.plan.scenes.at(-1);
    expect(last).toMatchObject({ id: "loop", start: 48 - LOOP_TAIL, end: 48 });
    expect(out.plan.scenes.at(-2)?.end).toBe(48 - LOOP_TAIL);
  });

  it("every cue (and every cursor or camera target) exists in the document", () => {
    for (const cue of out.plan.cues) {
      expect(
        doc.querySelectorAll(cue.s).length,
        `${cue.k} ${cue.s}`
      ).toBeGreaterThan(0);
      if (cue.target) {
        expect(
          doc.querySelector(cue.target),
          `${cue.k} → ${cue.target}`
        ).not.toBeNull();
      }
    }
  });

  it("gives a scene a cursor only when one of its blocks drives it", () => {
    expect(doc.getElementById("hook-cursor")).not.toBeNull();
    expect(doc.getElementById("cta-cursor")).not.toBeNull();
    expect(doc.getElementById("bars-cursor")).toBeNull();
  });

  it("paints every texture with Dither Kit specs the runtime can read", () => {
    const canvases = Array.from(
      doc.querySelectorAll<HTMLCanvasElement>("canvas.dv-dither")
    );
    expect(canvases.length).toBeGreaterThan(5);
    for (const canvas of canvases) {
      const spec = JSON.parse(canvas.dataset.dither ?? "");
      expect(["fill", "area", "avatar"]).toContain(spec.kind);
      expect(spec.color).toHaveLength(3);
    }
  });

  it("every scene hero exists and every scene is a timed clip", () => {
    for (const scene of out.plan.scenes) {
      const section = doc.getElementById(scene.id);
      expect(section?.classList.contains("clip")).toBe(true);
      expect(section?.dataset.start).toBe(String(scene.start));
      if (scene.hero) {
        expect(doc.querySelector(scene.hero)).not.toBeNull();
      }
    }
  });

  it("uses unique DOM ids", () => {
    const ids = Array.from(doc.querySelectorAll("[id]"), (el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps a flood scene's clip exactly its length, and extends the one a push slides over", () => {
    expect(doc.getElementById("hook")?.dataset.duration).toBe("3");
    expect(doc.getElementById("bars")?.dataset.duration).toBe("4.6");
    expect(out.plan.transitions.find((t) => t.to === 2)?.kind).toBe("push");
  });

  it("drops entrance cues of static blocks but keeps their later beats", () => {
    const post = out.plan.cues.filter((c) => c.s.startsWith("#hook-b1"));
    // Only the highlight beat and the exit (the card empties before it morphs) remain.
    expect(post.map((c) => c.k)).toEqual(["highlight", "retract"]);
    expect(post[0]?.t).toBe(0.25); // highlightAt 0.3 snaps to the half-beat grid
  });

  it("rebuilds the first frame for the loop with hold-only cues", () => {
    const loop = out.plan.cues.filter((c) => c.s.startsWith("#loop-"));
    const held = loop.filter((c) => c.hold);
    expect(held.length).toBeGreaterThan(0);
    // The only live cue in the loop beat is the hero card unrolling once the morph lands.
    expect(loop.filter((c) => !c.hold).map((c) => c.k)).toEqual(["reveal"]);
  });

  it("morphs by default and floods only where asked", () => {
    const kinds = out.plan.transitions.map((t) => t.kind);
    expect(kinds.filter((k) => k === "flood")).toHaveLength(1);
    expect(kinds.filter((k) => k === "push")).toHaveLength(1);
    expect(
      kinds.every((k) => k === "morph" || k === "flood" || k === "push")
    ).toBe(true);
    // Only the card leaving into the flood turns indigo; a morph never recolours a scene's hero.
    const fills = out.plan.cues.filter((c) => c.k === "fill").map((c) => c.s);
    expect(fills).toContain("#quote-b1");
    const morphHeroes = out.plan.transitions
      .filter((t) => t.kind === "morph")
      .map((t) => out.plan.scenes[t.to]?.hero)
      .filter((h): h is string => Boolean(h));
    // (A morph-entered card may still turn indigo on its way out into a flood.)
    const arrivingIndigo = out.plan.cues
      .filter((c) => c.k === "fill" && c.from === "#474deb")
      .map((c) => c.s);
    expect(arrivingIndigo.filter((f) => morphHeroes.includes(f))).toEqual([]);
  });

  it("cuts the usage, never the price: the bar is slashed and the number counts down", () => {
    const slice = out.plan.cues.filter((c) => c.s.startsWith("#slice-b1"));
    expect(slice.map((c) => c.k)).toEqual(
      expect.arrayContaining([
        "shake",
        "reveal",
        "move",
        "wipe",
        "count",
        "color",
      ])
    );
    expect(slice.find((c) => c.k === "count")).toMatchObject({
      from: 20,
      to: 10,
    });
    // Only the cut-off part of the bar moves; the price is never animated after it arrives.
    expect(
      slice
        .filter((c) => c.k === "move")
        .every((c) => c.s.endsWith(".dv-cut-lose"))
    ).toBe(true);
    expect(out.plan.scenes.find((s) => s.id === "slice")?.hero).toBe(
      "#slice-b1 .dv-cut-card"
    );
  });

  it("flags scenes that are only text", () => {
    expect(textOnlyScenes(reel)).toEqual(["big"]);
  });

  it("draws app windows with the built-in logos inlined", () => {
    expect(
      doc.querySelectorAll("#board-b1 .dv-winbar .dv-lights i").length
    ).toBe(3);
    expect(
      doc.querySelector("#pick-b1 .dv-winbar .dv-logo-claude svg")
    ).not.toBeNull();
    expect(
      doc.querySelector("#board-b1-r0 .dv-logo-openai svg")
    ).not.toBeNull();
  });

  it("turns a shared key into one object across a morph", () => {
    const keyed = compose(
      decodeReel({
        scenes: [
          {
            duration: 2,
            blocks: [
              {
                type: "bars",
                key: "plan",
                rows: [{ key: "usage", name: "Pro", value: 20, max: 20 }],
              },
            ],
          },
          {
            duration: 2,
            blocks: [
              { type: "chip", key: "plan", text: "Pro" },
              { type: "tile", key: "usage", value: "10x" },
            ],
          },
          {
            duration: 2,
            blocks: [{ type: "quote", key: "usage", text: "Half" }],
          },
        ],
      })
    );
    const d = new DOMParser().parseFromString(keyed.html, "text/html");
    expect(keyed.plan.transitions.map((t) => t.keys)).toEqual([
      ["plan", "usage"],
      ["usage"],
    ]);
    // Each key appears once per scene, on the element that carries on.
    expect(
      d
        .querySelectorAll('#s1 [data-key="usage"]')[0]
        ?.classList.contains("dv-bar-fill")
    ).toBe(true);
    expect(
      d.querySelector('#s2 [data-key="usage"]')?.classList.contains("dv-tile")
    ).toBe(true);
    expect(
      d.querySelector('#s3 [data-key="usage"]')?.classList.contains("dv-quote")
    ).toBe(true);
    // The quote card that takes over from the tile unrolls its content once the shape lands.
    expect(keyed.plan.cues).toContainEqual(
      expect.objectContaining({
        k: "reveal",
        s: "#s3-b1 > .dv-card-body",
        t: 4.45,
      })
    );
  });

  it("swooshes on every flood, and lands each sound's peak on its event", () => {
    for (const t of out.plan.transitions.filter((tr) => tr.kind === "flood")) {
      expect(out.sfx).toContainEqual({
        name: "swoosh",
        at: Math.round((t.at - FLOOD_EXIT / 2) * 1000) / 1000,
      });
    }
    const audio = Array.from(
      doc.querySelectorAll<HTMLAudioElement>("audio[id][src]")
    );
    expect(audio.length).toBe(out.sfx.length);
    out.sfx.forEach((ev, i) => {
      const start = Number(audio[i]?.dataset.start);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(start).toBeCloseTo(ev.at - SFX[ev.name].peak, 3);
    });
  });

  it("puts scenes on whole beats and authored times on half beats", () => {
    const off = compose(
      decodeReel({
        scenes: [
          {
            duration: 2.6,
            blocks: [{ type: "headline", lines: ["a"], at: 0.6 }],
          },
          { duration: 1.9, blocks: [{ type: "wordmark", text: "b" }] },
        ],
      })
    );
    expect(off.plan.scenes.map((s) => [s.start, s.end])).toEqual([
      [0, 2.5],
      [2.5, 4.5],
    ]);
    expect(off.plan.cues.find((c) => c.k === "rise")?.t).toBe(0.5);
  });

  it("can render a clean cut without captions", () => {
    const clean = compose(reel, { captions: false });
    expect(dom(clean.html).getElementById("dv-captions")).toBeNull();
    expect(clean.plan.cues.some((c) => c.s.startsWith("#cap-"))).toBe(false);
    expect(doc.querySelectorAll(".dv-cap").length).toBe(2);
  });

  it("shows a caption that starts at zero in the first frame", () => {
    expect(
      out.plan.cues.some((c) => c.s.startsWith("#cap-1") && c.k === "rise")
    ).toBe(false);
  });

  it("is deterministic", () => {
    expect(compose(sampleReel()).html).toBe(out.html);
  });

  it("rejects scene ids compose uses itself", () => {
    for (const id of ["loop", "dv-root", "cap-1"]) {
      const clash = decodeReel({
        scenes: [
          { id, duration: 2, blocks: [{ type: "wordmark", text: "x" }] },
        ],
      });
      expect(() => compose(clash)).toThrow(RESERVED);
    }
  });

  it("keeps spec text from closing the inline script", () => {
    const sneaky = compose(
      decodeReel({
        scenes: [
          {
            duration: 2,
            blocks: [
              {
                type: "stat",
                to: "1",
                count: { from: 0, to: 1, suffix: "</script><b>" },
              },
            ],
          },
        ],
      })
    );
    const inline = sneaky.html.slice(sneaky.html.indexOf("DV.mount("));
    expect(inline.indexOf("</script>")).toBe(inline.lastIndexOf("</script>"));
    expect(inline).toContain("\\u003c/script>");
  });

  it("keeps a static stat still (its count is an entrance)", () => {
    const still = compose(
      decodeReel({
        scenes: [
          {
            duration: 2,
            blocks: [
              {
                type: "stat",
                static: true,
                to: "10",
                count: { from: 0, to: 10 },
              },
            ],
          },
        ],
      })
    );
    expect(still.plan.cues.some((c) => c.k === "count")).toBe(false);
  });

  it("refuses a loop when the last scene is too short to give up its tail", () => {
    const short = decodeReel({
      loop: true,
      scenes: [{ duration: 1.5, blocks: [{ type: "wordmark", text: "x" }] }],
    });
    expect(() => compose(short)).toThrow(AT_LEAST);
  });
});

describe("decodeReel", () => {
  it("rejects unknown blocks and bad numbers", () => {
    expect(() =>
      decodeReel({ scenes: [{ duration: 2, blocks: [{ type: "nope" }] }] })
    ).toThrow();
    expect(() =>
      decodeReel({
        scenes: [{ duration: -1, blocks: [{ type: "wordmark", text: "x" }] }],
      })
    ).toThrow();
    expect(() =>
      decodeReel({
        scenes: [
          { duration: 2, blocks: [{ type: "chart", label: "x", points: [1] }] },
        ],
      })
    ).toThrow();
  });
});
