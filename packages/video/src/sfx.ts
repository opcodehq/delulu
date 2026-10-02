import type { SfxName } from "./spec";

/**
 * Real recorded sound effects from Mixkit (free for commercial use under the Mixkit licence).
 * They are not committed: `writeProject` downloads each one once into the local cache and checks
 * its SHA-256. `peak` is the measured loudest moment, so an effect is scheduled at `event − peak`
 * and lands exactly on the beat it belongs to.
 */
export interface SfxDef {
  readonly mixkit: number;
  readonly sha256: string;
  readonly duration: number;
  readonly peak: number;
  readonly volume: number;
}

const sfxUrl = (id: number) =>
  `https://assets.mixkit.co/active_storage/sfx/${id}/${id}-preview.mp3`;

export const SFX: Record<SfxName, SfxDef> = {
  // Soft only: rounded attacks and almost nothing above ~5 kHz (measured, see README).
  // Soft select clicks for the cursor, an air woosh for transitions, bubbles for arrivals,
  // a warm page chime for the end. No metallic hits, snaps or bright pops.
  click: {
    mixkit: 1109,
    sha256: "4473ef3397b4a35bb75520e637b827e9984ae1d09bbf27c7f7c72cacc17885f7",
    duration: 0.6,
    peak: 0.069,
    volume: 0.3,
  },
  press: {
    mixkit: 2573,
    sha256: "a5118de16f2b7aef75b69a4698610e0a2d260e8724e5191b096adb87a107114d",
    duration: 0.8,
    peak: 0.121,
    volume: 0.32,
  },
  pop: {
    mixkit: 3000,
    sha256: "7bb1e708558f4cb1c52d65436bf2030e94d6acfe646104863cf945e3e845d0e8",
    duration: 0.7,
    peak: 0.055,
    volume: 0.38,
  },
  pop2: {
    mixkit: 2925,
    sha256: "92a0c7684c96d8609787545f37fc0e26961780558762be368113f0d709da4fae",
    duration: 0.8,
    peak: 0.186,
    volume: 0.28,
  },
  whoosh: {
    mixkit: 1489,
    sha256: "8af9843a636d3b4961f0c8b3545a21e674bd43d59f97d5c38d3f9a3f04674fd2",
    duration: 1.4,
    peak: 0.715,
    volume: 0.32,
  },
  swoosh: {
    mixkit: 1489,
    sha256: "8af9843a636d3b4961f0c8b3545a21e674bd43d59f97d5c38d3f9a3f04674fd2",
    duration: 1.4,
    peak: 0.715,
    volume: 0.45,
  },
  chime: {
    mixkit: 1107,
    sha256: "179ba20aaa7f5ab8ff75969e3a51db5dc7b8f6d9d3b40defd32d3b55e6a97ecc",
    duration: 1.2,
    peak: 0.347,
    volume: 0.3,
  },
};

export interface TrackDef {
  readonly title: string;
  readonly url: string;
  readonly sha256: string;
  readonly bpm: number;
  /** Seconds to the first downbeat. */
  readonly firstBeat: number;
  readonly notes: string;
}

/** Vetted music beds, addressed in a spec as `"music": "mixkit:<id>"`. */
export const TRACKS: Record<string, TrackDef> = {
  "mixkit:292": {
    title: "Relax Beat (Mixkit)",
    url: "https://assets.mixkit.co/music/292/292.mp3",
    sha256: "7e160d5dc09f99b24a2f48c50aa1b2f78701fccdc3b7f5412368f4283df19375",
    bpm: 128.5,
    firstBeat: 0.41,
    notes:
      "Soft, warm, steady beat; low and clean under a voice. The default bed.",
  },
  "mixkit:201": {
    title: "Minimal Techno 01 (Mixkit)",
    url: "https://assets.mixkit.co/music/201/201.mp3",
    sha256: "e50c5d7ad1617c0bd4fcbbbf1202e4541ed681965a27a83f1bc72f1659d9f207",
    bpm: 120,
    firstBeat: 0.01,
    notes:
      "Clean kick, no vocals. Breakdown 24–40s, drop at 40s, second drop at 104s.",
  },
};

/** Where each remote audio file comes from and the project path it is copied to. */
export const sfxSource = (name: SfxName) => ({
  url: sfxUrl(SFX[name].mixkit),
  sha256: SFX[name].sha256,
  file: `assets/sfx/${name}.mp3`,
});

export const trackFile = (ref: string) =>
  `assets/music/${ref.replace(":", "-")}.mp3`;
