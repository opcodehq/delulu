import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type ComposeOptions, type Composition, compose } from "./compose";
import { sfxSource, TRACKS, trackFile } from "./sfx";
import { fetchTweet, resolveSources, type Tweet } from "./sources";
import type { Reel } from "./spec";

/** HyperFrames CLI version the generated projects are pinned to. */
export const HYPERFRAMES_VERSION = "0.8.109";

const URL_SCHEME = /^[a-z]+:\/\//i;
const PATH_SEP = /[\\/]/;
const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

/** Directory of an installed package (its `exports` may hide package.json). */
const packageDir = (name: string, entry = ""): string => {
  let dir = dirname(require.resolve(entry ? `${name}/${entry}` : name));
  while (!existsSync(join(dir, "package.json"))) {
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`Cannot locate the ${name} package.`);
    }
    dir = parent;
  }
  return dir;
};

export interface WriteProjectOptions extends ComposeOptions {
  /** Directory media paths in the spec are relative to (avatars, voiceover, music). */
  readonly mediaRoot?: string;
  /** Re-fetch linked posts instead of using the cached copy (counts change over time). */
  readonly refresh?: boolean;
}

/** Media the spec points at by local path, copied into the project under the same path. */
const localMedia = (reel: Reel): string[] => {
  const paths: string[] = [];
  for (const scene of reel.scenes) {
    for (const block of scene.blocks) {
      if (block.type === "post" && block.avatar) {
        paths.push(block.avatar);
      }
      if (block.type === "cut" && block.logo) {
        paths.push(block.logo);
      }
    }
  }
  if (reel.audio?.voiceover) {
    paths.push(reel.audio.voiceover);
  }
  if (reel.audio?.music && !TRACKS[reel.audio.music]) {
    paths.push(reel.audio.music);
  }
  return paths.filter((p) => !URL_SCHEME.test(p));
};

const CACHE_DIR = join(
  process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"),
  "delulu-video"
);

const sha256 = (buf: Buffer) => createHash("sha256").update(buf).digest("hex");

/**
 * Download a remote file once into the cache and verify it. Renders never touch the network:
 * everything a project needs is resolved here, at build time.
 */
const cached = async (url: string, expected: string): Promise<string> => {
  const file = join(CACHE_DIR, expected);
  if (existsSync(file) && sha256(readFileSync(file)) === expected) {
    return file;
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed (${res.status}): ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const got = sha256(buf);
  if (got !== expected) {
    throw new Error(
      `Checksum mismatch for ${url}: expected ${expected}, got ${got}`
    );
  }
  mkdirSync(CACHE_DIR, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, buf);
  renameSync(tmp, file);
  return file;
};

/** Remote media with no known checksum (avatars): cached by URL, fetched once. */
const cachedUrl = async (url: string): Promise<string> => {
  const file = join(CACHE_DIR, "media", sha256(Buffer.from(url)));
  if (existsSync(file)) {
    return file;
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed (${res.status}): ${url}`);
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
};

/** A post fetched once and cached, so a rebuild shows the same numbers until `refresh` is set. */
const cachedTweet =
  (refresh: boolean) =>
  async (url: string): Promise<Tweet> => {
    const file = join(
      CACHE_DIR,
      "posts",
      `${sha256(Buffer.from(url.split("?")[0] ?? url))}.json`
    );
    if (!refresh && existsSync(file)) {
      return JSON.parse(readFileSync(file, "utf8")) as Tweet;
    }
    const tweet = await fetchTweet(url);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(tweet, null, 2));
    return tweet;
  };

/**
 * Write a self-contained HyperFrames project for `reel` into `outDir`: index.html, the runtime,
 * vendored GSAP, fonts, sound effects and any local media the spec references.
 */
export const writeProject = async (
  reel: Reel,
  outDir: string,
  options: WriteProjectOptions = {}
): Promise<Composition> => {
  const resolved = await resolveSources(
    reel,
    cachedTweet(options.refresh ?? false)
  );
  const composition = compose(resolved.reel, options);
  const runtimeDir = join(outDir, "runtime");
  const fontsDir = join(outDir, "assets", "fonts");
  mkdirSync(runtimeDir, { recursive: true });
  mkdirSync(fontsDir, { recursive: true });

  writeFileSync(join(outDir, "index.html"), composition.html);
  copyFileSync(
    join(PACKAGE_ROOT, "runtime", "dv.js"),
    join(runtimeDir, "dv.js")
  );
  copyFileSync(
    join(PACKAGE_ROOT, "runtime", "dv.css"),
    join(runtimeDir, "dv.css")
  );
  copyFileSync(
    join(PACKAGE_ROOT, "runtime", "dither.js"),
    join(runtimeDir, "dither.js")
  );
  // Vendored, not CDN: a render must never depend on the network.
  copyFileSync(
    join(packageDir("gsap", "dist/gsap.min.js"), "dist", "gsap.min.js"),
    join(runtimeDir, "gsap.min.js")
  );

  const geist = join(packageDir("geist", "font/sans"), "dist", "fonts");
  copyFileSync(
    join(geist, "geist-sans", "Geist-Variable.woff2"),
    join(fontsDir, "Geist-Variable.woff2")
  );
  copyFileSync(
    join(geist, "geist-mono", "GeistMono-Variable.woff2"),
    join(fontsDir, "GeistMono-Variable.woff2")
  );
  // Inter stands in for X's Chirp in post cards (closest open font).
  copyFileSync(
    join(
      packageDir("@fontsource-variable/inter"),
      "files",
      "inter-latin-wght-normal.woff2"
    ),
    join(fontsDir, "Inter-Variable.woff2")
  );

  // Sound effects and vetted music: fetched once, verified, copied into the project.
  const remote = [...new Set(composition.sfx.map((ev) => ev.name))].map(
    sfxSource
  );
  const music = reel.audio?.music ? TRACKS[reel.audio.music] : undefined;
  if (reel.audio?.music && music) {
    remote.push({
      url: music.url,
      sha256: music.sha256,
      file: trackFile(reel.audio.music),
    });
  }
  for (const item of remote) {
    const target = join(outDir, item.file);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(await cached(item.url, item.sha256), target);
  }
  for (const item of resolved.media) {
    const target = join(outDir, item.to);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(await cachedUrl(item.url), target);
  }

  const mediaRoot = options.mediaRoot ?? process.cwd();
  for (const media of localMedia(reel)) {
    if (isAbsolute(media) || media.split(PATH_SEP).includes("..")) {
      throw new Error(
        `Media paths must be relative and inside the spec folder: ${media}`
      );
    }
    const target = join(outDir, media);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(resolve(mediaRoot, media), target);
  }

  writeFileSync(
    join(outDir, "hyperframes.json"),
    `${JSON.stringify({ $schema: "https://hyperframes.heygen.com/schema/hyperframes.json", paths: { assets: "assets" } }, null, 2)}\n`
  );
  writeFileSync(
    join(outDir, "meta.json"),
    `${JSON.stringify({ id: "delulu-reel", name: reel.title ?? "Delulu reel" }, null, 2)}\n`
  );
  return composition;
};

export interface RenderOptions {
  readonly output: string;
  readonly fps?: 30 | 60;
  readonly quality?: "draft" | "standard" | "high";
  /**
   * Integrated loudness target in LUFS (−14 is what Instagram and TikTok normalise to). Set it
   * only when the reel carries a voiceover or music: normalising a sparse effects-only track would
   * push every click to full scale. Without it the effects keep their authored, under-voice levels.
   */
  readonly loudness?: number;
}

const hyperframes = (args: readonly string[], cwd: string) =>
  execFileSync(
    "npx",
    ["--yes", `hyperframes@${HYPERFRAMES_VERSION}`, ...args],
    {
      cwd,
      stdio: "inherit",
      env: { ...process.env, HYPERFRAMES_SKIP_SKILLS: "1" },
    }
  );

/** Lint + runtime + layout checks on a written project. Throws when HyperFrames reports errors. */
export const checkProject = (projectDir: string): void => {
  hyperframes(["check"], projectDir);
};

/** Render a written project to MP4 with the HyperFrames CLI (needs Chrome and FFmpeg), optionally
 *  mastering the audio to one loudness target. */
export const renderProject = (
  projectDir: string,
  options: RenderOptions
): void => {
  const output = resolve(options.output);
  const raw = join(tmpdir(), `delulu-video-${process.pid}-${Date.now()}.mp4`);
  hyperframes(
    [
      "render",
      ".",
      "-q",
      options.quality ?? "high",
      "-f",
      String(options.fps ?? 30),
      "-o",
      raw,
    ],
    projectDir
  );
  mkdirSync(dirname(output), { recursive: true });
  const audio =
    options.loudness === undefined
      ? ["-c:a", "copy"]
      : [
          "-af",
          `loudnorm=I=${options.loudness}:TP=-1.5:LRA=11`,
          "-c:a",
          "aac",
          "-b:a",
          "192k",
          "-ar",
          "48000",
        ];
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-i",
    raw,
    "-c:v",
    "copy",
    ...audio,
    "-movflags",
    "+faststart",
    output,
  ]);
  rmSync(raw, { force: true });
};
