// WHERE THE CREATURE MEETS THE SEA (WP8): the particle and splash events of a giant creature that lives at the water line. Read-only: it watches state.creature and calls WP4's particles
// (view.vfx.P.burst, 3D world coordinates, y UP) and the sea's splash rings (world.splashAt). Replaces the old Kraken emitter of vfx.js.
//   - a limb or the body crossing the sea line: a spray of drops and a mist puff, a ring on the water (bigger and faster for the body, a flash when it is fast)
//   - a WAKE: while the body swims, white puffs and rings trail from its far edge
//   - the BREACH (cr.breach): bubbles over the shadow while it slides under the ship, a spray column and a flash when it bursts up (the sim's `splashUp` flag), a crash of drops, mist and rings when
//     it comes down (`splashDown`), a stream of spray off the body while it moves fast through the surface
//   - a DEATH: bubbles and foam while it sinks, a big flourish when it dies; during the slow-motion finale (state.slow) the drops are slower and live longer
//   - grips: spray and chips where a tentacle holds the ship
// Everything here is a burst on an event or a fixed cadence: no noise, no sine of the time. The pool is shared, so the calls per frame are capped (a burst stops by itself when it is full).
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fin = Number.isFinite;

export function createWaterFx({ world, getP }) {
  const crossSide = new Map(), crossAt = new Map(), acc = new Map();
  let lastX = null, lastBreach = null, fired = null, lastMode = '', wakeT = 0, bubT = 0, sinkRingT = 0;
  const rnd = (() => { let a = 7331; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();

  const W = {
    reset() { crossSide.clear(); crossAt.clear(); acc.clear(); lastX = null; lastBreach = null; fired = null; lastMode = ''; },
    // cr: the creature. S = { sea (the game's y of the sea line), dt, slow (state.slow), limbZ(part, i) -> the depth of that segment's middle, mantle: { xl, xr, z, speed } | null (where the body crosses the sea line), bodyZ }
    update(cr, S) {
      const P = getP();
      if (!P || !cr || !fin(S.sea)) return;
      const sea = S.sea, sea3 = -sea, dt = Math.max(S.dt, 0.001), slow = clamp(S.slow || 1, 0.25, 1), slowK = 1 / slow;
      let made = 0;
      const drops = (x, z, n, o) => P.burst('drop', x, sea3, z, n, { dir: Math.PI / 2, spread: 0.6, ...o, ...(slow < 1 ? { speed: o.speed.map((v) => v * slow), life: [1.2 * slowK, 1.8 * slowK] } : {}) });
      const mist = (x, z, n, w, o = {}) => P.burst('steam', x, sea3 + 10, z, n, { size: [w * 0.22, w * 0.36], size1: 2.0, life: [0.8, 1.3], alpha: 0.55, speed: [10, 70], up: [20, 80], area: w * 0.3, ...o });
      // ---- limbs crossing the sea line ----
      for (const p of cr.parts) {
        if (!p.segs || p.dead || p.hidden || !p.limb) continue;
        p.segs.forEach((s, i) => {
          if (!fin(s.x) || !fin(s.y) || !fin(s.ang) || !fin(s.len)) return;
          const mx = s.x + Math.cos(s.ang) * s.len * 0.5, my = s.y + Math.sin(s.ang) * s.len * 0.5, key = p.id + '#' + i;
          const side = my > sea + 6 ? 1 : my < sea - 6 ? 0 : -1;
          if (side < 0) return;
          const was = crossSide.get(key), wasY = crossAt.get(key + 'y'), ck = 'c' + p.id, cd = crossAt.get(ck) || 0;
          crossSide.set(key, side); crossAt.set(key + 'y', my);
          if (i === 0 && cd > 0) crossAt.set(ck, cd - dt); // (one cooldown for the whole limb: its first segment counts it down)
          if (was === undefined || was === side || cd > 0 || made >= 2) return;
          crossAt.set(ck, 0.5);
          made++;
          const spd = wasY === undefined ? 300 : Math.abs(my - wasY) / dt, k = clamp(spd / 450, 0.35, 1.8), w = Math.min(420, Math.max(60, (s.r || 20) * 2.4)), z = S.limbZ(p, i), kk = Math.min(k, 2);
          drops(mx, z, Math.round(14 * k), { speed: [260 * kk, 560 * kk], size: [14, 26], area: w * 0.25, up: [60, 200] });
          mist(mx, z, Math.round(2 + 1.5 * k), w);
          if (k > 1) P.flash(mx, sea3 + 30, z + 30, w * 1.4, '#e8fbff', { hdr: 1.6, alpha: 0.5 });
          world.splashAt(mx, sea, clamp(w * 1.2, 90, 520), z + 40);
        });
        // a limb gripping the ship: spray and chips
        if (p.grip && fin(p.grip.x) && fin(p.grip.y) && P.inView(p.grip.x, -p.grip.y)) {
          const a = (acc.get(p) || 0) + dt;
          if (a >= 0.14) { acc.set(p, 0); P.burst('drop', p.grip.x, -p.grip.y, 360, 2, { spread: 1.2, speed: [60, 190], size: [8, 13] }); if (rnd() < 0.35) P.splinters(p.grip.x, -p.grip.y, 360, 2, { kind: 'wood', speed: [60, 200], up: [30, 100] }); } else acc.set(p, a);
        }
      }
      // ---- the body crossing the sea line: a wake while it swims ----
      const m = S.mantle;
      if (m && (cr.mode === 'idle' || cr.mode === 'surfacing')) {
        const vx = lastX == null ? 0 : (cr.x - lastX) / dt;
        if (Math.abs(vx) > 70 && (wakeT -= dt) <= 0) {
          wakeT = 0.22;
          const back = vx > 0 ? m.xl : m.xr, w = Math.abs(m.xr - m.xl);
          mist(back, m.z, 2, w * 0.35, { speed: [20, 90] });
          drops(back, m.z, 5, { speed: [120, 300], size: [14, 24], area: w * 0.12, up: [30, 120] });
          world.splashAt(back, sea, clamp(w * 0.28, 120, 420), m.z + 20);
        }
      }
      lastX = cr.x;
      // ---- the breach ----
      const b = cr.breach;
      if (b !== lastBreach) { lastBreach = b; fired = { up: false, down: false }; }
      if (b && m !== undefined) {
        const bx = b.x, w = 1300, z = 30;
        if (b.phase === 'warn' && (bubT -= dt) <= 0) { // bubbles and ripples over the shadow
          bubT = 0.18;
          P.burst('drop', bx + (rnd() - 0.5) * 900, sea3, z + (rnd() - 0.5) * 500, 3, { dir: Math.PI / 2, spread: 0.5, speed: [60, 200], size: [10, 20], up: [40, 120] });
          if (rnd() < 0.4) world.splashAt(bx + (rnd() - 0.5) * 900, sea, 160 + rnd() * 200, z);
        }
        if (b.splashUp && !fired.up) { // it bursts up through the surface: a column of spray, a flash, rings
          fired.up = true;
          drops(bx, z, 60, { speed: [500, 1500], size: [22, 48], area: 500, up: [200, 500], spread: 0.5 });
          mist(bx, z + 40, 16, 1500, { size: [300, 520], life: [1.2, 2.0], speed: [30, 160], up: [100, 300], area: 600 });
          P.flash(bx, sea3 + 220, z + 80, 1300, '#e8fbff', { hdr: 1.7, alpha: 0.5 });
          world.splashAt(bx, sea, 900, z + 20); world.splashAt(bx, sea, 560, z + 90);
        }
        if (b.splashDown && !fired.down) { // it crashes back: the big one
          fired.down = true;
          drops(bx, z, 120, { speed: [600, 1800], size: [26, 56], area: 650, up: [250, 650], spread: 0.7 });
          mist(bx, z + 40, 26, 1800, { size: [380, 640], life: [1.4, 2.4], speed: [40, 200], up: [120, 340], area: 800 });
          P.flash(bx, sea3 + 260, z + 90, 1700, '#e8fbff', { hdr: 1.8, alpha: 0.55 });
          world.splashAt(bx, sea, 900, z); world.splashAt(bx - 260, sea, 700, z + 140); world.splashAt(bx + 260, sea, 700, z - 140); world.splashAt(bx, sea, 420, z + 220);
        }
        if (m && (b.phase === 'leap' || b.phase === 'fall') && made < 3) { // spray streams off the body while it moves through the surface
          const w2 = Math.abs(m.xr - m.xl), sp = Math.abs(m.speed || 0);
          if (sp > 400) {
            drops(m.xl, m.z, 4, { speed: [200, 600], size: [18, 34], dir: Math.PI / 2 + 0.5, spread: 0.45, up: [100, 300] });
            drops(m.xr, m.z, 4, { speed: [200, 600], size: [18, 34], dir: Math.PI / 2 - 0.5, spread: 0.45, up: [100, 300] });
            if (rnd() < 0.3) mist((m.xl + m.xr) / 2, m.z + 60, 1, w2 * 0.7);
          }
        }
      }
      // ---- the death ----
      if (cr.mode === 'dying') {
        if (lastMode !== 'dying') { // the flourish: it goes down in a burst of foam
          const x = cr.x;
          drops(x, 60, 70, { speed: [300, 1000], size: [22, 46], area: 700, up: [150, 450], spread: 0.8 });
          mist(x, 100, 14, 1600, { size: [300, 520], life: [1.2, 2.0] });
          world.splashAt(x, sea, 900, 60);
        }
        if ((bubT -= dt) <= 0) {
          bubT = 0.12 * slowK;
          const x = (m ? (m.xl + m.xr) / 2 : cr.x) + (rnd() - 0.5) * 900;
          P.burst('drop', x, sea3, 80 + (rnd() - 0.5) * 300, 3, { dir: Math.PI / 2, spread: 0.7, speed: [40 * slow, 160 * slow], size: [10, 22], up: [30, 110], life: [1.0 * slowK, 1.6 * slowK], alpha: 0.9 });
          if (rnd() < 0.5) mist(x, 100, 1, 500, { life: [1.2 * slowK, 2 * slowK], speed: [10, 40] });
        }
        if ((sinkRingT -= dt) <= 0) { sinkRingT = 0.7 * slowK; world.splashAt(cr.x + (rnd() - 0.5) * 600, sea, 300 + Math.min(500, (cr.sinkT || 0) * 100), 60); }
      }
      lastMode = cr.mode;
    },
    clear() { W.reset(); },
  };
  return W;
}
