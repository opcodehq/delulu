---
name: make-motion-reel
description: Turn a short-form video script (Instagram Reel, TikTok, Short, LinkedIn video) into an on-brand motion-graphics video with Delulu's @delulu/video package. Use when someone wants a reel, B-roll graphics, a hook animation, or a post, leaderboard, model picker, terminal run, launch wall or comparison animated for their script.
---

# Make a motion reel

The package lives at `packages/video`. Its README covers the look, the motion and every block.
Read it before you write a spec. You write JSON. Do not hand-write HTML or animation code.

## House rules

These rules are settled. Follow them without asking again.

**Every scene is a graphic.**
- Never ship a text-only screen. The CLI warns about one; treat the warning as an error.
- Text is a short label above a graphic, never the whole frame.
- Prefer realistic product UI over abstract charts. Use an app window, a model picker, a
  leaderboard, a terminal run, a launch wall, an agent window, or a real post.
- Use a chart only when the data is the point.
- Use brand logos wherever a company or model appears. Built-in logos are `openai`, `chatgpt`,
  `claude`, `anthropic` and `codex`; use them before a file path.

**Look**
- Delulu's dark background (`#09090B`) with light cards in front. No background texture and no
  CSS gradients, glows or blur.
- Dither Kit texture belongs only on buttons, tags, stamps, bar and meter fills, and chart
  areas. Never on the background.
- Corner radii follow the app (24px cards, 14px buttons). Keep rounding modest.

**Motion**
- Transitions are shared elements: one object carries the story. Give the thing that carries on
  the same `key` in both scenes. A card becomes the next card, a bar becomes a tile, a tile
  becomes a card.
- Unmatched boxes fold away, so plan the chain of keys before you write the scenes.
- Use `flood` for the single biggest moment only.
- No zoom of any kind: no push-ins and no punch-ins. Keep everything smooth, with no bounce,
  snap or harsh moves.

**Hook**
- The first 3 seconds must read at frame 0: mark the hero `static: true`.
- It must be dramatic, and correct about what changed. "Same $200, half the usage" slashes the
  usage bar while the price never moves. Never let it read as a discount or sale.
- When the user wants to judge a transition idea, render a 3–4 second test of just those
  screens first.

**Sound**
- Soft effects only: select clicks, an air woosh, bubbles, a warm chime. These are the library
  defaults.
- Nothing metallic, snappy or bright.
- No music unless the user asks; a calm bed is `mixkit:292`.

**Output**
- No captions unless asked: render with `--no-captions`.
- Render at 60 fps (`--fps 60`), 1080×1920.
- `loop: true`, so the reel ends on its first frame.

**Truth**
- Posts come from their real link (`source`), and excerpts must be word for word.
- Never invent a post, a handle, prices, scores or chart data.
- Illustrative boards (relative price, "1st vs 2nd") must carry only the script's own claims.
- List every unverified claim for the user when you deliver.

## Workflow

1. **Beats.** For each beat, note the spoken line, what the viewer should see, and which brands
   appear. Ask only for what changes the video: the post link, a missing logo, or the voiceover.
2. **Truth pass.** Fetch any linked post (`source`) and compare it with the script. Flag claims
   the post doesn't support.
3. **Pick a graphic per beat.**
   - Announcement or model change → `picker` (the cursor picks it)
   - Ranking or benchmark → `leaderboard` (with `rerank`, `highlight`, `strike`)
   - A run, cost or tokens → `terminal` (lines type out, meters count)
   - Many launches or features → `launches` (`collapseAt` to the ones that matter, `sweepAt`
     to dismiss)
   - An always-on agent → `agent`
   - Price kept, usage cut → `cut`
   - Before and after numbers → `bars` with a `change`, inside a `window`
   - A quote → a real `post` or `quote`
   - The punchline object → `tile` with a logo
4. **Chain the keys** so each scene's main card flows into the next.
5. **Time it.** The cut runs at 120 BPM: scene lengths snap to whole beats and block times to
   half beats.
   - Set `at` times to the second each word is spoken.
   - With a recorded voiceover, use `npx hyperframes transcribe <file>` for word timings.
   - Without one, use the script's section times.
6. **Build:** `pnpm --filter @delulu/video video build <spec.json> --no-captions`. There must be no
   text-only warnings.
7. **Render and look.** Render with `--no-captions --fps 60`. Pull frames from the real MP4 at
   mid-scene and mid-transition times (`ffmpeg -ss <t> … -frames:v 1`) and read them. Fix:
   - text that wraps badly or values that overflow their column
   - boxes that collide or sit empty
   - anything sharp or jumpy
8. **Deliver.** Give the file path, the length, and the list of unverified claims.

## Where files go

- Keep a user's reel spec and renders outside the product source, for example
  `.context/reels/<name>/`. Finished, reusable specs go in `packages/video/examples/`.
- Improve components, the runtime or styles in `packages/video` itself, with tests. Do not patch
  a generated build folder by hand. Every new cue kind must exist in `runtime/dv.js`; a test
  checks this.

## Worked examples

`packages/video/examples/` has finished specs to copy from:

| Example | What it shows |
| --- | --- |
| `hook-cut` | The 3-second "Same $200, half the usage" hook |
| `openai-pro-cut` | A full reel built around a real X post |
| `astra-pointless` | Leaderboard re-rank, model picker, terminal run |
| `sonnet-intern` | Claude picker with the Max toggle, a cost window, a subagent terminal |
| `devday-speedrun` | A launch wall, a DOTS agent window and the usage cut |

## Spec skeleton

```json
{
  "format": "reel",
  "bpm": 120,
  "loop": true,
  "scenes": [
    { "id": "hook", "duration": 3.5, "blocks": [
      { "type": "headline", "static": true, "size": "m", "lines": ["Short *label*"] },
      { "type": "leaderboard", "static": true, "key": "board", "title": "DeepSWE leaderboard",
        "column": "Cost / task",
        "rows": [ { "name": "Astra", "logo": "openai", "value": "$4–7" },
                  { "name": "GPT-6.1 Sol", "logo": "openai", "value": "<$1" } ],
        "rerank": { "at": 1.25, "order": ["GPT-6.1 Sol", "Astra"] },
        "highlight": { "name": "GPT-6.1 Sol", "at": 1.75, "badge": "#1" } } ] },
    { "id": "picked", "duration": 4.5, "blocks": [
      { "type": "picker", "key": "board", "app": "ChatGPT", "logo": "chatgpt",
        "options": [ { "name": "Astra", "logo": "openai" },
                     { "name": "GPT-6.1 Sol", "logo": "openai", "badge": "New" } ],
        "selected": 0, "pick": { "index": 1, "at": 2.5 } } ] }
  ]
}
```
