// biome-ignore-all lint/suspicious/noBitwiseOperators: FNV-1a, xorshift32 and Bayer-matrix lookups are bit operations by definition.
/* Ordered-dither painters for @delulu/video.
   Ported from Dither Kit (https://www.tripwire.sh/dither-kit, MIT, Boring Software Inc.):
   the 4×4 Bayer matrix, the button texture, the area fill and the mirrored pixel avatar. The React
   and hover/animation-frame parts are dropped. Every painter here is a pure function of its spec,
   its size and a `progress` value, so a frame can be repainted from timeline time alone.

   Usage: <canvas class="dv-dither" data-dither='{"kind":"fill",...}'>. The canvas is sized in
   dither cells; CSS stretches it to the element box with pixelated scaling. */
(() => {
  const BAYER4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ].map((row) => row.map((v) => (v + 0.5) / 16));

  const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${clamp01(a)})`;

  /** 32-bit FNV-1a hash of a string seed. */
  const fnv1a = (str) => {
    let h = 0x81_1c_9d_c5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01_00_01_93);
    }
    return h >>> 0;
  };
  /** Deterministic PRNG (xorshift32), floats in [0, 1). */
  const xorshift32 = (seed) => {
    let s = seed || 0x9e_37_79_b9;
    return () => {
      s ^= s << 13;
      s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5;
      s >>>= 0;
      return s / 0x1_00_00_00_00;
    };
  };

  /** Bayer-ordered materialise: at progress p only cells whose threshold is below p are drawn. */
  const visible = (x, y, p) => p >= 1 || BAYER4[y & 3][x & 3] < p;

  /* ---------- painters (ctx, cols, rows, spec, progress) ---------- */

  /** Button / bar texture: gradient (dense at the bottom), dotted, hatched or solid. */
  const fill = (ctx, cols, rows, spec, p) => {
    const variant = spec.variant || "gradient";
    const c = spec.color;
    const bias = variant === "dotted" ? 0.12 : 0;
    const axisLen = spec.axis === "x" ? cols : rows;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (!visible(x, y, p)) {
          continue;
        }
        const along = spec.axis === "x" ? x : rows - 1 - y;
        const density =
          variant === "gradient"
            ? (spec.floor ?? 0.45) +
              (1 - (spec.floor ?? 0.45)) * ((along + 0.5) / axisLen)
            : variant === "dotted"
              ? 0.5
              : 0.8;
        if (variant === "hatched" && ((x + y) & 3) >= 2) {
          continue;
        }
        const lit =
          variant === "solid" || density > BAYER4[y & 3][x & 3] - bias;
        if (variant === "dotted" && !lit) {
          continue;
        }
        const k = 0.35 + density * 0.65;
        ctx.fillStyle = rgba(c, lit ? k : k * 0.35);
        ctx.fillRect(x, y, 1, 1);
      }
    }
  };

  /** Area under a polyline (points in 0–1 of the box), densest along the line. */
  const area = (ctx, cols, rows, spec, p) => {
    const pts = spec.points;
    const lineAt = (fx) => {
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1];
        const [x1, y1] = pts[i];
        if (fx <= x1) {
          return y0 + ((y1 - y0) * (fx - x0)) / (x1 - x0 || 1);
        }
      }
      return pts.at(-1)[1];
    };
    for (let x = 0; x < cols; x++) {
      const top = lineAt((x + 0.5) / cols) * rows;
      for (let y = Math.max(0, Math.floor(top)); y < rows; y++) {
        if (!visible(x, y, p)) {
          continue;
        }
        const density = 1 - (y - top) / Math.max(1, rows - top);
        const lit = density * 0.9 > BAYER4[y & 3][x & 3];
        if (lit) {
          ctx.fillStyle = rgba(spec.color, 0.25 + 0.6 * density);
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  };

  /** Generative mirrored 8×8 avatar from a name (same name, same avatar). */
  const avatar = (ctx, cols, rows, spec, p) => {
    const GRID = 8;
    const rand = xorshift32(fnv1a(spec.name));
    const bits = Array.from({ length: 32 }, () => rand() < 0.5);
    const vertical = rand() < 0.5;
    rand(); // hue draw, kept so patterns match Dither Kit's stream
    const halfDensity = Array.from({ length: 32 }, () => 0.55 + rand() * 0.45);
    const cell = Math.floor(cols / GRID);
    ctx.fillStyle = rgba(spec.bg || [23, 23, 29], 1);
    ctx.fillRect(0, 0, cols, rows);
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const i = vertical
          ? Math.min(r, GRID - 1 - r) * GRID + c
          : r * (GRID / 2) + Math.min(c, GRID - 1 - c);
        const idx = i % 32;
        if (!bits[idx]) {
          continue;
        }
        const density = halfDensity[idx];
        for (let y = 0; y < cell; y++) {
          for (let x = 0; x < cell; x++) {
            const px = c * cell + x;
            const py = r * cell + y;
            if (!visible(px, py, p)) {
              continue;
            }
            const lit = density > BAYER4[py & 3][px & 3];
            ctx.fillStyle = rgba(spec.color, lit ? 0.4 + 0.6 * density : 0.18);
            ctx.fillRect(px, py, 1, 1);
          }
        }
      }
    }
  };

  const PAINTERS = { fill, area, avatar };

  /** Size a dither canvas to its box (in cells) and paint it at `progress`. */
  const paint = (canvas, progress = 1) => {
    const spec = canvas.__dvSpec || JSON.parse(canvas.dataset.dither);
    canvas.__dvSpec = spec;
    const cell = spec.cell || 6;
    if (!canvas.__dvSized) {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      canvas.width =
        spec.kind === "avatar" ? 32 : Math.max(4, Math.round(w / cell));
      canvas.height =
        spec.kind === "avatar" ? 32 : Math.max(4, Math.round(h / cell));
      canvas.__dvSized = true;
    }
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    PAINTERS[spec.kind](ctx, canvas.width, canvas.height, spec, progress);
  };

  window.DVDither = { paint, BAYER4, fnv1a, xorshift32 };
})();
