# Examples

Each folder is a complete reel spec. Paths inside a spec (logos, avatars) are relative to its
folder. Render one from the repo root:

```bash
pnpm --filter @delulu/video video render examples/hook-cut/reel.json --no-captions --fps 60 -o out/hook-cut.mp4
pnpm --filter @delulu/video video render examples/openai-pro-cut/reel.json --no-captions --fps 60 -o out/openai-pro-cut.mp4
```

| Example | What it shows |
| --- | --- |
| `hook-cut` | 3s hook: same $200, usage slashed from 20x to 10x (`cut` block, tremble, blade, jolt). |
| `openai-pro-cut` | The full 60s reel: the hook, a real X post fetched from its link, and shared-element transitions that carry one card through the whole story. |

The X post is fetched from its link at build time and cached in `~/.cache/delulu-video`; pass
`--refresh` for current counts. The Mixkit sound effects download and verify the same way.

`assets/logos/codex.svg` is the Codex mark from [LobeHub Icons](https://github.com/lobehub/lobe-icons)
(MIT). Codex and OpenAI are trademarks of OpenAI.
