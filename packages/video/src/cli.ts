#!/usr/bin/env -S npx tsx
/**
 * delulu-video — build, check and render reels from a JSON spec.
 *
 *   delulu-video build  <spec.json> [--out dir] [--no-captions] [--refresh]
 *   delulu-video check  <spec.json> [--out dir] [--no-captions]
 *   delulu-video render <spec.json> [--out dir] [--no-captions] [-o file.mp4] [--fps 30|60] [--draft]
 */
import { readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { textOnlyScenes } from "./compose";
import { checkProject, renderProject, writeProject } from "./project";
import { decodeReel } from "./spec";

const JSON_EXT = /\.json$/;

const USAGE = `Usage:
  delulu-video build  <spec.json> [--out dir] [--no-captions] [--refresh]
  delulu-video check  <spec.json> [--out dir] [--no-captions]
  delulu-video render <spec.json> [--out dir] [--no-captions] [-o out.mp4] [--fps 30|60] [--draft]`;

const main = async () => {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: "string" },
      output: { type: "string", short: "o" },
      "no-captions": { type: "boolean" },
      fps: { type: "string" },
      draft: { type: "boolean" },
      refresh: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  const [command, specPath] = positionals;
  if (
    values.help ||
    !command ||
    !specPath ||
    !["build", "check", "render"].includes(command)
  ) {
    console.log(USAGE);
    process.exit(values.help ? 0 : 1);
  }

  const specFile = resolve(specPath);
  const reel = decodeReel(JSON.parse(readFileSync(specFile, "utf8")));
  const name = basename(specFile).replace(JSON_EXT, "");
  const captions = !values["no-captions"];
  const outDir = resolve(
    values.out ??
      join(dirname(specFile), "build", captions ? name : `${name}-no-captions`)
  );
  const composition = await writeProject(reel, outDir, {
    captions,
    mediaRoot: dirname(specFile),
    refresh: values.refresh ?? false,
  });
  for (const scene of textOnlyScenes(reel)) {
    console.warn(
      `Warning: scene "${scene}" is text only. Give it a graphic (a card, window, chart, tile…).`
    );
  }
  console.log(
    `Wrote ${outDir} (${composition.duration}s, ${composition.format.width}x${composition.format.height}, ${composition.sfx.length} sfx)`
  );

  if (command === "check") {
    checkProject(outDir);
  }
  if (command === "render") {
    const fps = values.fps === "60" ? 60 : composition.fps;
    const output = resolve(
      values.output ??
        join(dirname(specFile), "renders", `${basename(outDir)}.mp4`)
    );
    // Master to −14 LUFS only when there is a voice or a bed; an effects-only cut stays quiet.
    const loudness =
      reel.audio?.voiceover || reel.audio?.music ? -14 : undefined;
    renderProject(outDir, {
      output,
      fps,
      quality: values.draft ? "draft" : "high",
      loudness,
    });
    console.log(`Rendered ${output}`);
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
