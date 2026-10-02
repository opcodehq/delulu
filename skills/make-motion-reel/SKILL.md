---
name: make-motion-reel
description: Turn a short-form video script (Instagram Reel, TikTok, Short, LinkedIn video) into an on-brand motion-graphics video with Delulu's @delulu/video package. Use when someone wants a reel, B-roll graphics, animated captions, or a post/tweet, stat, chart, checklist or comparison animated for their script.
---

# Make a motion reel

The package lives at `packages/video`. Its README covers the look, the motion and every block.
Read it before you write a spec. You write JSON. Do not hand-write HTML or animation code.

## Workflow

1. **Get the script and its beats.** For each beat, note the spoken line, what the viewer should
   see, and any on-screen text. Ask for anything missing that changes the video: the real
   screenshot or post text, the brand, or whether it is voiceover-only or a talking head.
2. **Truth pass.** For an X post, set `source` to its link so the real author, avatar, text and
   counts are fetched. Read the fetched post and compare it with the script. List every claim,
   number, quote and post shown on screen. Use the user's exact
   wording. Never invent a post's text, a person's handle, prices or chart data. When a visual
   stands in for a real artefact, tell the user it is a recreation and ask for the original.
3. **Map beats to scenes.** Usually one scene per beat, with one idea per scene: an optional
   `headline` plus one hero card. Pick the block that shows what is being said:
   - a quoted post → `post`
   - "X went from A to B" → `stat` or `bars` with a `change`
   - a list → `checklist`
   - a trend → `chart`
   - "this vs that" → `versus`
   - verdicts → `rows`
   - a line someone said → `quote`
   - the CTA question → `poll`
4. **Time it.** The cut runs at 120 BPM: scene lengths snap to whole beats (0.5s) and block times to
   half beats. Plan something on every beat. Scene durations come from the script's timestamps. Inside a scene, set `at`,
   `items[].at` and `change.at` to the second the word is spoken. With a recorded voiceover,
   transcribe it with `npx hyperframes transcribe <file>` and use the word timings. Without one,
   use the script's section times. Captions take absolute times.
   Plan the transitions as shared elements: give the thing that carries on the same `key` in both
   scenes (a bar becomes a tile, a card becomes a chip, a tile becomes the next card). Use `flood`
   only for the single biggest moment. Don't zoom. For a soft bed add
   `"audio": { "music": "mixkit:292", "musicVolume": 0.35 }`.
5. **Make the hook instant.** Mark the first scene's hero `static: true` so frame 0 already reads.
   Leave `loop: true` on so the reel ends on its first frame.
6. **Build and check.** Run
   `pnpm --filter @delulu/video video check <spec.json>`. Fix every lint error. Layout notes about
   masked text mid-animation and the flood leaving the canvas are expected.
7. **Look at it.** Run `npx hyperframes snapshot --at <t1>,<t2>,…` inside the build folder at
   mid-scene times, and read the contact sheet. Fix text that wraps badly, cards that crowd the
   caption area, and blocks that collide.
8. **Render.** Run `pnpm --filter @delulu/video video render <spec.json> -o <file>.mp4`. Render a
   second cut with `--no-captions` when the user will edit it under their own talking head.
9. **Deliver.** Give the user both file paths, the length, and the list of on-screen claims and
   recreations they still need to confirm.

## Where files go

- Keep a user's reel spec and renders outside the product source, for example `.context/reels/<name>/`.
- Improve the components, runtime or styles in `packages/video` itself, with tests. Do not patch a
  generated build folder by hand.

## Worked examples

`packages/video/examples/` has finished specs to copy from: `hook-cut` (a 3-second
"same price, usage cut" hook) and `openai-pro-cut` (a full 60-second reel with a real X post and
shared-element transitions).

## Spec skeleton

```json
{
  "format": "reel",
  "loop": true,
  "scenes": [
    { "duration": 3, "pushIn": 0, "blocks": [
      { "type": "post", "static": true, "platform": "x", "name": "…", "handle": "…",
        "text": "… [[the line to call out]] …", "highlightAt": 0.3 },
      { "type": "stat", "at": 1, "label": "…", "from": "20x", "to": "10x" } ] },
    { "duration": 6, "blocks": [
      { "type": "headline", "size": "m", "kicker": "…", "lines": ["…", "*key* words"] },
      { "type": "bars", "suffix": "x", "rows": [ { "name": "…", "value": 20, "max": 20,
        "change": { "at": 3.9, "value": 10, "note": "Now" } } ] } ] }
  ],
  "captions": [ { "at": 0, "text": "Spoken line with _red_ and *indigo* words." } ]
}
```
