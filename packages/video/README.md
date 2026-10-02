# @delulu/video

Motion-graphics reels in Delulu's house style. You write a reel spec (JSON) and the package compiles
it into a [HyperFrames](https://hyperframes.heygen.com) project, then renders it to MP4.

```bash
pnpm --filter @delulu/video video build  path/to/reel.json   # write the HyperFrames project
pnpm --filter @delulu/video video check  path/to/reel.json   # + lint, runtime and layout checks
pnpm --filter @delulu/video video render path/to/reel.json -o out.mp4 [--no-captions] [--fps 60]
```

Rendering needs Node 22+, FFmpeg and a Chrome that HyperFrames can drive. Run
`npx hyperframes doctor` if a render fails to start.

## The look

The Delulu app's dark theme, as a film:

- The app's dark background (`#09090B`) as the canvas, with light cards (`#F9F9FB`, 24px radius) in front.
- Delulu indigo (`#474DEB`) drives the story. Red (`#EF4444`) marks loss, cuts and warnings.
- Geist for everything, Geist Mono for labels.
- Buttons, tags, stamps, bar and meter fills and the chart area use ordered dither from
  [Dither Kit](https://www.tripwire.sh/dither-kit) (MIT). `runtime/dither.js` is a deterministic
  port of its painters. The background stays plain.
- No CSS gradients, glows, blur, glass or hairlines.

## The motion

The style is an Apple keynote: one continuous take, smooth and quiet.

- **Shared elements.** Give a block, or a bar row, a `key`. If the next scene has something
  with the same key, it is the same object: it flows there on one gentle spring, with its
  position, size, corners, colour and Dither Kit texture all changing together. A card becomes a
  chip, a progress bar becomes a tile, and a tile becomes a card.
- Elements that don't carry on fold away. New boxes unroll in place. Text rises out of mask lines
  and sinks back into them.
- Without shared keys, a `morph` flows the hero card into the next hero card. `flood` (an indigo
  shape fills the frame) is for one big moment. `push` slides a scene in.
- There is no zoom: no camera push-ins or punch-ins. Springs are near-critically damped, so
  nothing bounces or snaps.
- Scene lengths snap to the beat (`bpm`, default 120). With `loop: true` the reel ends on its
  first frame.

The sound is soft and clean: Mixkit's select clicks for the cursor, an air woosh for transitions,
liquid and soap bubbles for things landing, and a warm page chime. Every effect was measured for
no hard attack and almost nothing above 5 kHz, and each is placed so its peak lands on its event.
Nothing metallic, snappy or bright. A calm bed is optional:
`"music": "mixkit:292"` (Relax Beat). Audio is downloaded once into `~/.cache/delulu-video` and
checked against a SHA-256, so it is never committed and renders never touch the network. Reels
with a voiceover or music are mastered to −14 LUFS; effects-only cuts stay at their quiet,
under-voice levels.

Everything is a pure function of time, so renders are deterministic.

## Spec

The types and validation are in [`src/spec.ts`](src/spec.ts). A reel has:

- `format`: `reel` (1080×1920, the default), `portrait` (1080×1350) or `square`
- `scenes[]`: each has a `duration`, an optional `transition` (`flood` or `push`) and `blocks[]`
- `captions[]`: spoken lines at absolute times. Render with `--no-captions` for a clean cut.
- `bpm` (default 120), `loop` and `sfx` (default on)
- `audio`: `voiceover`, `music` (a file, `mixkit:292` or `mixkit:201`), `musicStart` and `musicVolume`

Block times (`at`, `items[].at`, `change.at`, `highlightAt`, `pickAt`, …) are in seconds from the
start of the scene. Any block (and any bar row) can take a `key` to carry on into the next scene.

| Block | Use it for |
| --- | --- |
| `headline` | A kicker plus display lines. `size` is `xl`, `l` or `m`. |
| `post` | A post card. With `source` set to an X link, it is the real post (see below). A cursor drag-selects the `[[highlight]]`. |
| `stat` | A big number, optionally replacing an old one that gets struck through (`20x → 10x`). |
| `bars` | Labelled bars that draw and count. A `change` cuts a bar (the cut piece falls away) or grows it. |
| `checklist` | Items that arrive one at a time and get ticked. |
| `chart` | A line chart that draws itself and ends on a note. |
| `versus` | Two options side by side: label, value, meter and what you get. |
| `rows` | Statements with a verdict tag each (`PROMISE` / `FACT`), with an optional strike. |
| `quote` | A pulled quote with an optional stamp (`−50%`). |
| `poll` | A card of two dithered buttons. A cursor can `pick` one, and a prompt asks for comments. |
| `leaderboard` | A benchmark or pricing table with logos; rows can `rerank`, `highlight` and `strike`. |
| `picker` | A model picker (ChatGPT, Claude…); a cursor picks a model, strikes one, or flips a mode toggle. |
| `terminal` | An agent/terminal run: lines type out on their beat, meters count up. |
| `launches` | A keynote wall of launch tiles that collapses to the ones that matter, or gets swept away. |
| `agent` | An always-on agent in an app window: status, its own browser, a task log, an unmoved usage meter. |
| `cut` | Same price, usage slashed: the bar is cut, the frame jolts, the number counts down. |
| `tile` | A big dithered value box ("10x") with an optional logo; the shape a bar or card can turn into. |
| `chip` | A small label pill. |
| `wordmark` | A closing wordmark. |

Copy markup works in every text field: `*indigo*`, `_red_`, and `[[highlight]]` (post text only).

Any card block can take `window: { title, logo }` to draw as an app window. Logos are built in
(`openai`, `chatgpt`, `claude`, `anthropic`, `codex`, from [LobeHub Icons](https://github.com/lobehub/lobe-icons),
MIT) or an image path.

Rules of thumb (the full set is in `skills/make-motion-reel`):

- Every scene is a graphic: realistic UI with logos, and text only as a short label. The CLI
  warns about text-only scenes.
- One idea per scene, and one object carried across scenes with shared `key`s.
- Mark the first scene's hero `static` so the hook reads in the very first frame.
- Never invent a post's wording, prices or data. Use the real text, or say that it's a
  recreation.

## Examples

[`examples/`](examples) has complete, re-renderable specs: the 3-second "same $200, half the
usage" hook, the full reel built around it, and three reels made of UI graphics (Astra,
Sonnet 5.5, DevDay). See [`examples/README.md`](examples/README.md)
for the render commands.

## Real posts

Give an X post block a link and it renders that post exactly as x.com shows it. At build time
the package fetches the post through the public [FxTwitter API](https://github.com/FxEmbed/FxEmbed)
and pulls in:

- the author's name, @handle, blue badge and avatar image
- the text, timestamp, views and the reply, repost, like and bookmark counts

```json
{ "type": "post", "platform": "x", "source": "https://x.com/thsottiaux/status/2104823812042940713",
  "timeZone": "America/Los_Angeles",
  "text": "In effect, if you do the math, it will net out at [[half the dollar in API spend]] compared to the old Pro $200 plan." }
```

- `text` is optional. When you set it, it must appear word for word in the real post, or the
  build fails. "Show more" appears when you show only part of the post.
- Posts and avatars are cached in `~/.cache/delulu-video`, so a rebuild shows the same numbers.
  Pass `--refresh` to fetch current counts.
- Inter stands in for X's Chirp font.

## Layout of the package

```
src/spec.ts          reel spec (Effect Schema) and decodeReel
src/blocks/*.ts      one module per component: HTML + timed cues
src/compose.ts       spec → index.html + motion plan (timing, transitions, loop, captions, SFX)
src/project.ts       writes a self-contained project (runtime, GSAP, fonts, SFX, media) and renders
src/cli.ts           delulu-video build | check | render
src/sfx.ts           Mixkit sound effects and music (ids, SHA-256, measured peaks, volumes)
src/sources.ts       real posts: fetch an X link, format it the way X does, verify excerpts
runtime/dv.js        browser runtime: springs, camera, cursor and cue kinds in one paused GSAP timeline
runtime/dither.js    Dither Kit painters (fill, area, avatar), ported from MIT source
runtime/dv.css       design tokens and component styles
```

To add a component:

1. Add its schema to `Block` in `spec.ts`.
2. Write `src/blocks/<name>.ts`. Return `{ html, cues, hero?, card? }`.
3. Wire it into `renderBlock` (the compiler enforces this) and style it in `runtime/dv.css`.
4. Add it to `test/fixtures.ts`. The compose tests check that every cue selector exists.
