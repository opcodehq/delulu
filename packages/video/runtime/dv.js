/* @delulu/video runtime.
   Turns the plan written by `compose()` into one paused GSAP timeline. Every visual state is a
   pure function of timeline time: no clocks, no randomness, no CSS transitions.

   Motion doctrine (Apple-keynote, one continuous take, 120 BPM): every scene is made out of the
   previous one. Text rises out of a mask line, marks pop on springs, dithered bars draw across,
   the camera steps in on every beat and punches onto key moments, a cursor drives clicks and
   drags. Between scenes the hero card morphs on a spring into the next hero card; the big
   moments flood the frame with an indigo shape that contracts into the next scene.
   Banned: crossfades, blur, glows, brightness ramps, holds over a beat. */
(() => {
  /* ---------- springs (closed-form step responses) ---------- */
  const spring = (t, zeta, w) => {
    if (t <= 0) {
      return 0;
    }
    if (zeta >= 1) {
      return 1 - Math.exp(-w * t) * (1 + w * t);
    }
    const wd = w * Math.sqrt(1 - zeta * zeta);
    return (
      1 -
      Math.exp(-zeta * w * t) *
        (Math.cos(wd * t) + ((zeta * w) / wd) * Math.sin(wd * t))
    );
  };
  /** A GSAP ease that follows the spring over `dur` seconds and lands exactly on 1. */
  const springEase = (dur, zeta, w) => {
    const end = spring(dur, zeta, w);
    return (p) => spring(p * dur, zeta, w) + (1 - end) * p;
  };
  // Gentle springs: a little life, no bounce or snap.
  const SPRINGS = { pop: [0.72, 13], soft: [0.85, 11], snap: [0.92, 16] };
  const ease = (name, dur) => {
    const s = SPRINGS[name];
    return s ? springEase(dur, s[0], s[1]) : name || "power2.out";
  };

  /* ---------- layout (measured once, before any transform exists) ---------- */
  const rectIn = (el, frame) => {
    const a = el.getBoundingClientRect();
    const b = frame.getBoundingClientRect();
    return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height };
  };
  /** A point on a target: start/end follow the text (first/last line box), centre the box. */
  const anchorIn = (el, frame, anchor) => {
    const b = frame.getBoundingClientRect();
    const boxes = Array.from(el.getClientRects());
    const first = boxes[0] || el.getBoundingClientRect();
    const last = boxes.at(-1) || first;
    if (anchor === "start") {
      return {
        x: first.left - b.left,
        y: first.bottom - b.top - first.height * 0.2,
      };
    }
    if (anchor === "end") {
      return {
        x: last.right - b.left,
        y: last.bottom - b.top - last.height * 0.2,
      };
    }
    const r = el.getBoundingClientRect();
    return {
      x: r.left - b.left + r.width * 0.55,
      y: r.top - b.top + r.height * 0.62,
    };
  };
  /** A hero clipped to its top part (a sliced card) hands over from the part that shows. */
  const visibleRect = (el, r) =>
    el.dataset.visibleH ? { ...r, h: r.h * Number(el.dataset.visibleH) } : r;
  const radiusOf = (el) => {
    const r = Number.parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
    return Math.min(r, el.offsetHeight / 2, el.offsetWidth / 2);
  };

  /* ---------- cue kinds ---------- */
  const formatNumber = (v, c) =>
    `${c.prefix || ""}${v.toFixed(c.decimals || 0)}${c.suffix || ""}`;

  /** Apply a cue's starting state at scene start (skipped for cues that continue a prior one). */
  const start = (tl, targets, vars, c) => {
    if (c.init !== undefined) {
      tl.set(targets, vars, c.init);
    }
  };
  /** For `hold` cues only the starting state is applied (rebuilds the first frame for loops). */
  const holdOnly = (tl) => ({
    set: (...a) => tl.set(...a),
    to: () => tl,
    fromTo: () => tl,
  });

  const CLIP = {
    down: "inset(0% 0% 100% 0%)",
    up: "inset(100% 0% 0% 0%)",
    right: "inset(0% 100% 0% 0%)",
  };

  const CUES = {
    /** Background colour change (a card handing over to/from the flood shape). */
    fill: (tl, els, c) => {
      start(tl, els, { backgroundColor: c.from }, c);
      tl.to(
        els,
        { backgroundColor: c.to, duration: c.d, ease: "power1.inOut" },
        c.t
      );
    },
    /** Start scaled to zero (something a later cue pops in). */
    hidden: (tl, els, c) => {
      start(tl, els, { scale: 0 }, c);
    },
    rise: (tl, els, c) => {
      start(tl, els, { yPercent: c.from ?? 110 }, c);
      tl.to(
        els,
        {
          yPercent: 0,
          duration: c.d,
          ease: ease(c.e || "soft", c.d),
          stagger: c.stagger || 0,
        },
        c.t
      );
    },
    sink: (tl, els, c) => {
      tl.to(
        els,
        {
          yPercent: c.to ?? 110,
          duration: c.d,
          ease: c.e || "power3.in",
          stagger: c.stagger || 0,
        },
        c.t
      );
    },
    pop: (tl, els, c) => {
      start(tl, els, { scale: c.from ?? 0, rotation: c.rotFrom ?? 0 }, c);
      tl.to(
        els,
        {
          scale: 1,
          rotation: c.rot ?? 0,
          duration: c.d,
          ease: ease(c.e || "pop", c.d),
          stagger: c.stagger || 0,
        },
        c.t
      );
    },
    reveal: (tl, els, c) => {
      start(tl, els, { clipPath: CLIP[c.dir || "down"] }, c);
      tl.to(
        els,
        {
          clipPath: "inset(0% 0% 0% 0%)",
          duration: c.d,
          ease: ease(c.e || "power2.inOut", c.d),
          stagger: c.stagger || 0,
        },
        c.t
      );
    },
    /** Move a clip edge to a fraction (bars cut or grow). to = visible fraction 0–1. */
    clipTo: (tl, els, c) => {
      start(tl, els, { clipPath: CLIP[c.dir === "up" ? "up" : "right"] }, c);
      // No trailing zeros: GSAP does not interpolate a clip edge written as "0.000%".
      const right = `${Number(((1 - c.to) * 100).toFixed(3))}%`;
      tl.to(
        els,
        {
          clipPath:
            c.dir === "up"
              ? `inset(${right} 0% 0% 0%)`
              : `inset(0% ${right} 0% 0%)`,
          duration: c.d,
          ease: ease(c.e || "snap", c.d),
        },
        c.t
      );
    },
    retract: (tl, els, c) => {
      tl.to(
        els,
        { clipPath: CLIP.down, duration: c.d, ease: c.e || "power2.in" },
        c.t
      );
    },
    highlight: (tl, els, c) => {
      start(tl, els, { backgroundSize: "0% 100%" }, c);
      tl.to(
        els,
        {
          backgroundSize: "100% 100%",
          duration: c.d,
          ease: c.e || "none",
          stagger: c.d,
        },
        c.t
      );
    },
    count: (tl, els, c) => {
      for (const el of els) {
        const o = { v: c.from };
        const paint = () => {
          el.textContent = formatNumber(o.v, c);
        };
        start(tl, o, { v: c.from, onUpdate: paint }, c);
        tl.to(
          o,
          {
            v: c.to,
            duration: c.d,
            ease: c.e || "power2.out",
            onUpdate: paint,
          },
          c.t
        );
      }
    },
    path: (tl, els, c) => {
      for (const el of els) {
        const len = el.getTotalLength();
        el.style.strokeDasharray = `${len}`;
        start(tl, el, { strokeDashoffset: len }, c);
        tl.to(
          el,
          {
            strokeDashoffset: 0,
            duration: c.d,
            ease: ease(c.e || "power2.inOut", c.d),
          },
          c.t
        );
      }
    },
    /** Dither Kit's Bayer-ordered materialise, repainted from timeline progress. */
    ditherIn: (tl, els, c) => {
      for (const el of els) {
        const o = { p: 0 };
        const paint = () => window.DVDither.paint(el, o.p);
        start(tl, o, { p: 0, onUpdate: paint }, c);
        tl.to(o, { p: 1, duration: c.d, ease: "none", onUpdate: paint }, c.t);
      }
    },
    /** Clip away from the left edge: the element leaves through its right side. */
    wipe: (tl, els, c) => {
      tl.to(
        els,
        {
          clipPath: "inset(0% 0% 0% 100%)",
          duration: c.d,
          ease: c.e || "power2.in",
        },
        c.t
      );
    },
    /** Move/turn a piece to an offset (from rest at scene start unless it continues a move). */
    move: (tl, els, c) => {
      start(tl, els, { x: 0, y: 0, rotation: 0 }, c);
      tl.to(
        els,
        {
          x: c.x ?? 0,
          y: c.y ?? 0,
          rotation: c.rot ?? 0,
          duration: c.d,
          ease: ease(c.e || "soft", c.d),
        },
        c.t
      );
    },
    /**
     * A deterministic shake: alternating offsets on a fixed grid of steps. `scale` is the largest
     * offset in px; dir "right" builds up (tension), otherwise it decays (impact).
     */
    shake: (tl, els, c) => {
      const steps = Math.max(4, Math.round(c.d / 0.035));
      const step = c.d / steps;
      for (let i = 0; i < steps; i++) {
        const p = (i + 1) / steps;
        const amp = (c.scale || 10) * (c.dir === "right" ? p : (1 - p) ** 1.5);
        const sign = i % 2 === 0 ? 1 : -1;
        tl.to(
          els,
          {
            x: sign * amp,
            y: sign * amp * 0.35 * (i % 3 === 1 ? -1 : 1),
            duration: step,
            ease: "sine.inOut",
          },
          c.t + i * step
        );
      }
      tl.to(els, { x: 0, y: 0, duration: step, ease: "sine.out" }, c.t + c.d);
    },
    /** Appears big at one instant and lands at full size (a stamp hitting the page). */
    slam: (tl, els, c) => {
      start(
        tl,
        els,
        { opacity: 0, scale: c.from ?? 1.7, rotation: c.rot ?? 0 },
        c
      );
      tl.set(els, { opacity: 1 }, c.t);
      tl.to(els, { scale: 1, duration: c.d, ease: "power4.out" }, c.t);
    },
    fall: (tl, els, c) => {
      tl.to(
        els,
        {
          y: c.y ?? 160,
          rotation: c.rot ?? 9,
          duration: c.d,
          ease: c.e || "power2.in",
        },
        c.t
      );
    },
    swap: (tl, els, c) => {
      // Two identical-position elements: hide the first and show the second at one instant.
      start(tl, els[0], { opacity: 1 }, c);
      start(tl, els[1], { opacity: 0 }, c);
      tl.set(els[0], { opacity: 0 }, c.t);
      tl.set(els[1], { opacity: 1 }, c.t);
    },
    color: (tl, els, c) => {
      tl.to(els, { color: c.to, duration: c.d, ease: "none" }, c.t);
    },
    bob: (tl, els, c) => {
      const cycle = c.cycle || 0.5;
      const repeat = Math.max(0, Math.floor(c.d / cycle) - 1);
      tl.fromTo(
        els,
        { y: 0 },
        {
          y: c.y ?? 18,
          duration: cycle / 2,
          ease: "sine.inOut",
          yoyo: true,
          repeat: repeat * 2 + 1,
          immediateRender: false,
        },
        c.t
      );
    },
    press: (tl, els, c) => {
      tl.to(els, { scale: 0.94, duration: 0.08, ease: "power2.out" }, c.t);
      tl.to(
        els,
        { scale: 1, duration: 0.35, ease: ease("pop", 0.35) },
        c.t + 0.08
      );
    },
    /* cursor: the tip is the hotspot */
    cursorIn: (tl, els, c) => {
      start(tl, els, { x: c.point.x - 4, y: c.point.y - 4, scale: 0 }, c);
      tl.to(els, { scale: 1, duration: 0.35, ease: ease("pop", 0.35) }, c.t);
    },
    cursorTo: (tl, els, c) => {
      tl.to(
        els,
        {
          x: c.point.x - 4,
          y: c.point.y - 4,
          duration: c.d,
          ease: c.e || "power3.inOut",
        },
        c.t
      );
    },
    cursorOut: (tl, els, c) => {
      tl.to(els, { scale: 0, duration: 0.25, ease: "power3.in" }, c.t);
    },
    click: (tl, els, c) => {
      const cursor = els[0];
      const ring = document.getElementById(`${cursor.id}-ring`);
      tl.to(cursor, { scale: 0.86, duration: 0.07, ease: "power2.out" }, c.t);
      tl.to(
        cursor,
        { scale: 1, duration: 0.3, ease: ease("pop", 0.3) },
        c.t + (c.pressFor || 0.07)
      );
      tl.set(ring, { x: c.point.x, y: c.point.y }, c.t);
      tl.fromTo(
        ring,
        { scale: 0.3, opacity: 0.6 },
        {
          scale: 1.3,
          opacity: 0,
          duration: 0.42,
          ease: "power2.out",
          immediateRender: false,
        },
        c.t + 0.02
      );
    },
  };

  /* ---------- shared elements: the same key in two scenes is one object ---------- */
  const MORPH = { lead: 0.25, land: 0.45 };
  /** One gentle, near-critically damped spring for every shape change: no bounce, no snap. */
  const flow = (d) => springEase(d, 0.9, 9);

  /**
   * What a keyed element looks like as a box: rect, corners, fill colour, and its Dither Kit
   * texture when it has one (a dithered bar, or a tile/button whose fill is a dither canvas).
   */
  const look = (el, root) => {
    const own = el.classList.contains("dv-dither") ? el : null;
    const child = own ? null : el.querySelector(":scope > canvas.dv-dither");
    const canvas = own || child;
    const spec = canvas ? JSON.parse(canvas.dataset.dither) : null;
    const full = rectIn(el, root);
    // A bar clipped to part of its width hands over from the part that is showing.
    const visible = el.dataset.keyVisible ? Number(el.dataset.keyVisible) : 1;
    const box = { ...full, w: full.w * visible };
    const styled = own ? el.parentElement : el;
    const radius =
      Number.parseFloat(getComputedStyle(styled).borderTopLeftRadius) || 0;
    const color = spec
      ? `rgba(${spec.color.join(",")},0)`
      : getComputedStyle(el).backgroundColor;
    return { ...box, r: Math.min(radius, box.h / 2, box.w / 2), color, spec };
  };

  /** Flow every shared element from scene A to scene B: position, size, corners and colour. */
  const share = (tl, layer, at, pairs) => {
    const t0 = at - MORPH.lead;
    const t1 = at + MORPH.land;
    const d = MORPH.lead + MORPH.land;
    for (const { a, b, from, to } of pairs) {
      const proxy = document.createElement("div");
      proxy.className = "dv-proxy";
      layer.appendChild(proxy);
      // Carry the dither texture across: painted once at the size of the end that owns it, then
      // stretched with the box, so a dithered bar arrives as exactly the dithered tile it becomes.
      const textured = to.spec ? to : from.spec ? from : null;
      let texture = null;
      if (textured) {
        texture = document.createElement("canvas");
        texture.className = "dv-dither dv-proxy-texture";
        texture.dataset.dither = JSON.stringify(textured.spec);
        const cell = textured.spec.cell || 6;
        texture.width = Math.max(4, Math.round(textured.w / cell));
        texture.height = Math.max(4, Math.round(textured.h / cell));
        texture.__dvSized = true;
        proxy.appendChild(texture);
        window.DVDither.paint(texture, 1);
      }
      // Real CSS properties only (no update callbacks), so any frame is a pure function of time.
      const box = (r) => ({
        x: r.x,
        y: r.y,
        width: r.w,
        height: r.h,
        borderRadius: r.r,
      });
      gsap.set(proxy, { opacity: 0, ...box(from) });
      // The proxy takes over at the instant it looks exactly like A, and hands over to B the
      // instant it looks exactly like B.
      tl.set(
        proxy,
        { opacity: 1, backgroundColor: from.color, ...box(from) },
        t0
      );
      tl.set(a, { opacity: 0 }, t0);
      tl.set(b, { opacity: 0 }, at);
      tl.to(proxy, { ...box(to), duration: d, ease: flow(d) }, t0);
      tl.to(
        proxy,
        { backgroundColor: to.color, duration: d, ease: "sine.inOut" },
        t0
      );
      if (texture) {
        gsap.set(texture, { opacity: from.spec ? 1 : 0 });
        tl.set(texture, { opacity: from.spec ? 1 : 0 }, t0);
        tl.to(
          texture,
          { opacity: to.spec ? 1 : 0, duration: d, ease: "sine.inOut" },
          t0
        );
      }
      tl.set(proxy, { opacity: 0 }, t1);
      tl.set(b, { opacity: 1 }, t1);
    }
  };

  /* ---------- morph: with no shared keys, the hero card flows into the next hero card ---------- */

  const morph = (tl, shape, plan, from, to) => {
    const t0 = from.at - MORPH.lead;
    const t1 = from.at + MORPH.land;
    const dot = (r) => ({
      x: r.x + r.w / 2,
      y: r.y + r.h / 2,
      w: 0,
      h: 0,
      r: 0,
    });
    const centre = { x: plan.W / 2, y: plan.H / 2, w: 0, h: 0, r: 0 };
    const begin = from.rect
      ? { ...from.rect, r: from.radius }
      : from.anchor
        ? dot(from.anchor)
        : centre;
    const end = to.rect
      ? { ...to.rect, r: to.radius }
      : to.anchor
        ? dot(to.anchor)
        : centre;
    const s = { ...begin };
    const paint = () => {
      shape.style.transform = `translate(${s.x}px, ${s.y}px)`;
      shape.style.width = `${Math.max(0, s.w)}px`;
      shape.style.height = `${Math.max(0, s.h)}px`;
      shape.style.borderRadius = `${Math.max(0, s.r)}px`;
    };
    const d = MORPH.lead + MORPH.land;
    const fill = (el) =>
      el
        ? getComputedStyle(el).backgroundColor
        : getComputedStyle(shape).backgroundColor;
    tl.set(shape, { opacity: 1, backgroundColor: fill(from.hero) }, t0);
    tl.to(
      shape,
      { backgroundColor: fill(to.hero), duration: d, ease: "none" },
      t0
    );
    tl.set(s, { ...begin, onUpdate: paint }, t0);
    if (from.hero) {
      tl.set(from.hero, { opacity: 0 }, t0);
    }
    if (to.hero) {
      tl.set(to.hero, { opacity: 0 }, from.at);
    }
    // One spring for position, size and corners together, so the card reads as one object.
    tl.to(s, { ...end, duration: d, ease: flow(d), onUpdate: paint }, t0);
    tl.set(shape, { opacity: 0 }, t1);
    if (to.hero) {
      tl.set(to.hero, { opacity: 1 }, t1);
    }
  };

  /* ---------- flood ---------- */
  const FLOOD = { exit: 0.32, enter: 0.36 };

  const flood = (tl, shape, plan, from, to) => {
    const { W, H } = plan;
    const pad = Math.max(W, H) * 0.25;
    const full = { x: -pad, y: -pad, w: W + pad * 2, h: H + pad * 2, r: 0 };
    const centre = { x: W / 2, y: H / 2, w: 0, h: 0, r: 0 };
    const t0 = from.at - FLOOD.exit;
    const t1 = from.at;
    const t2 = from.at + FLOOD.enter;
    const begin = from.rect ? { ...from.rect, r: from.radius } : centre;
    const end = to.rect ? { ...to.rect, r: to.radius } : centre;
    const s = { ...begin };
    const paint = () => {
      shape.style.transform = `translate(${s.x}px, ${s.y}px)`;
      shape.style.width = `${Math.max(0, s.w)}px`;
      shape.style.height = `${Math.max(0, s.h)}px`;
      shape.style.borderRadius = `${Math.max(0, s.r)}px`;
    };
    tl.set(shape, { opacity: 1 }, t0);
    tl.set(s, { ...begin, onUpdate: paint }, t0);
    if (from.hero) {
      tl.set(from.hero, { opacity: 0 }, t0);
    }
    // Ease by screen coverage: grow from small with power1.out, contract from full with power1.in.
    tl.to(
      s,
      { ...full, duration: FLOOD.exit, ease: "power1.out", onUpdate: paint },
      t0
    );
    if (to.hero) {
      tl.set(to.hero, { opacity: 0 }, t1);
    }
    tl.to(
      s,
      { ...end, duration: FLOOD.enter, ease: "power1.in", onUpdate: paint },
      t1
    );
    tl.set(shape, { opacity: 0 }, t2);
    if (to.hero) {
      tl.set(to.hero, { opacity: 1 }, t2);
    }
  };

  /* ---------- build ---------- */
  const build = (plan) => {
    const root = document.getElementById("dv-root");
    const q = (sel) => Array.from(root.querySelectorAll(sel));
    const shape = document.getElementById("dv-flood");
    const ctx = { W: plan.W, H: plan.H };

    // 1. Measure everything while no element carries a transform.
    for (const canvas of q(".dv-dither")) {
      window.DVDither.paint(canvas, 1);
    }
    const scenes = plan.scenes.map((sc) => {
      const stage = document.querySelector(`#${sc.id} .dv-stage`);
      const hero = sc.hero ? document.querySelector(sc.hero) : null;
      // Without a hero card, a morph starts or ends as a point on the scene's first line of text.
      const first = document.querySelector(`#${sc.id} .dv-cam .dv-mask`);
      return {
        ...sc,
        stage,
        hero,
        rect: hero ? visibleRect(hero, rectIn(hero, root)) : null,
        radius: hero ? radiusOf(hero) : 0,
        anchor: first ? rectIn(first, root) : null,
      };
    });
    const cues = plan.cues.map((c) => {
      const els = q(c.s);
      if (!els.length) {
        throw new Error(`dv: cue ${c.k} matched nothing for ${c.s}`);
      }
      if (c.target) {
        const target = document.querySelector(c.target);
        if (!target) {
          throw new Error(`dv: cue ${c.k} target ${c.target} matched nothing`);
        }
        const frame = els[0].closest(".dv-cam");
        return {
          ...c,
          els,
          rect: rectIn(target, frame),
          point: anchorIn(target, frame, c.anchor),
        };
      }
      return { ...c, els };
    });

    // Shared elements, measured now for every keyed transition.
    const transitions = plan.transitions.map((tr) => {
      const pairs = (tr.keys || []).map((key) => {
        const a = document.querySelector(
          `#${plan.scenes[tr.from].id} [data-key="${key}"]`
        );
        const b = document.querySelector(
          `#${plan.scenes[tr.to].id} [data-key="${key}"]`
        );
        if (!(a && b)) {
          throw new Error(
            `dv: shared key "${key}" is missing from one of its scenes`
          );
        }
        return { a, b, from: look(a, root), to: look(b, root) };
      });
      return { ...tr, pairs };
    });

    // 2. The stage never zooms: scenes only move when one slides over another.
    const tl = gsap.timeline({ paused: true });
    const morphShape = document.getElementById("dv-morph");
    const proxies = document.getElementById("dv-proxies");
    gsap.set([shape, morphShape], { opacity: 0 });
    for (const sc of scenes) {
      tl.set(sc.stage, { x: 0 }, sc.start);
    }

    // 3. Cues.
    for (const c of cues) {
      CUES[c.k](c.hold ? holdOnly(tl) : tl, c.els, c, ctx);
    }

    // 4. Transitions.
    for (const tr of transitions) {
      const a = scenes[tr.from];
      const b = scenes[tr.to];
      if (tr.kind === "morph" && tr.pairs.length) {
        share(tl, proxies, tr.at, tr.pairs);
        continue;
      }
      if (tr.kind === "morph") {
        morph(
          tl,
          morphShape,
          plan,
          {
            at: tr.at,
            hero: a.hero,
            rect: a.rect,
            radius: a.radius,
            anchor: a.anchor,
          },
          { hero: b.hero, rect: b.rect, radius: b.radius, anchor: b.anchor }
        );
        continue;
      }
      if (tr.kind === "push") {
        tl.fromTo(
          b.stage,
          { x: plan.W },
          { x: 0, duration: 0.6, ease: flow(0.6), immediateRender: false },
          tr.at
        );
        tl.to(
          a.stage,
          { x: -plan.W * 0.35, duration: 0.6, ease: flow(0.6) },
          tr.at
        );
        continue;
      }
      flood(
        tl,
        shape,
        plan,
        { at: tr.at, hero: a.hero, rect: a.rect, radius: a.radius },
        { hero: b.hero, rect: b.rect, radius: b.radius }
      );
    }
    return tl;
  };

  /** Build once fonts are in (layout depends on them), then register the timeline. */
  const mount = (plan, id = "main") =>
    document.fonts.ready.then(() => {
      window.__timelines[id] = build(plan);
    });

  window.DV = { build, mount, spring, springEase, ease };
})();
