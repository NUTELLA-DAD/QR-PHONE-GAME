// THE EMITTERS (WP4): they READ the game's state (never write it) and feed particles.js. Called once a frame from index.js after the ships have been placed.
//   fires on every ship (flame flipbook + licks + embers + a smoke column + a night glow), puffs (the sim's "something happened here" dust: grouped by place and colour and turned into explosions,
//   sparks, dust, splinters, steam, spray), flashes (the muzzle star), impact rings (+ the one-frame hit-stop flash on big ones), shells and bullets (tracers, smoke trails, a muzzle star at a
//   NEW shell), bombs (a trail), the boiler (chimney and vent steam by pressure, more in overdrive), engines (exhaust by each one's `pow`), the Kraken (splashes where the body crosses the sea,
//   a breach burst, spray where a tentacle grips), burning debris, the lightning coil's bolt. vfx.test() spawns a fire, a volley and an explosion for the dev page.
// Events are told apart from the old ones by identity (a WeakSet), so a frame that comes late does not make them twice, and the first frame only learns what is already there.
// The random numbers are particles.js's own (rnd): the view never draws from Math.random, which the simulation shares.
import { createParticles, rnd, rgbOf } from './particles.js';
import { config } from '../../config.js';
import { toShipX, toShipY } from '../host/pose.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fin = Number.isFinite;
const rr = (a, b) => a + (b - a) * rnd();
const V3 = () => config.VFX3D || {};
const Z_FX = 100; // where the world's events are drawn: a little in front of the gameplay plane

// what a puff's colour means (the sim paints every little effect with a colour): a memoised classification
const classMemo = new Map();
function classify(hex) {
  let c = classMemo.get(hex);
  if (c) return c;
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ''));
  if (!m) c = 'puff';
  else {
    const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16), mx = Math.max(r, g, b), mn = Math.min(r, g, b), lum = (r * 0.3 + g * 0.59 + b * 0.11) / 255, sat = mx ? (mn === mx ? 0 : (mx - mn) / mx) : 0;
    if (b > r && b >= g * 0.9 && sat > 0.12 && lum > 0.6) c = 'spray'; // cold, pale: water and aether
    else if (r >= g && g >= b && sat > 0.5 && r > 200) c = g / r > 0.76 ? 'gold' : 'fire';
    else if (r > 200 && g > 190 && b < r - 30 && lum > 0.7) c = 'gold'; // a pale yellow
    else if (sat < 0.14) c = lum > 0.78 ? 'steam' : 'smoke';
    else if (r >= g && g >= b && sat >= 0.14 && lum > 0.3) c = 'dust'; // brown
    else if (lum < 0.4) c = 'smoke';
    else c = 'puff';
  }
  classMemo.set(hex, c);
  return c;
}

const lumOf = (hex) => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || '')); return m ? (parseInt(m[1], 16) * 0.3 + parseInt(m[2], 16) * 0.59 + parseInt(m[3], 16) * 0.11) / 255 : 0.5; };

export function createVfx({ state, scene, world, models }) {
  const P = createParticles(scene);
  const C = () => V3();
  const seen = new WeakSet(); // puffs, flashes, rings, shells, bullets, bolts already handled
  const acc = new WeakMap(); // per object timers
  let primed = false, lastT = -1e9;
  const groups = new Map();
  const demo = { fires: [], shells: [], queue: [] };
  const crossSide = new Map(), crossAt = new Map(); // the Kraken's parts against the sea line
  const muzzles = []; // [x, y] muzzle stars made this frame (a flash and a new shell are the same shot)
  const _v = { x: 0, y: 0, z: 0 };
  const V = { P, particles: P, demo, counts: { splash: 0, puffGroups: 0, rings: 0, muzzles: 0 } }; // (counts: for the tools)

  // a point in a ship's local 3D (model.content) -> the world (3D)
  const toWorld = (model, lx, ly, lz) => {
    const m = model.content.matrixWorld.elements;
    _v.x = m[0] * lx + m[4] * ly + m[8] * lz + m[12]; _v.y = m[1] * lx + m[5] * ly + m[9] * lz + m[13]; _v.z = m[2] * lx + m[6] * ly + m[10] * lz + m[14];
    return _v;
  };
  const seaOf = () => (state.env && fin(state.env.seaY) ? state.env.seaY : null);
  const onShip = (x, y) => { // is a world point (the game's y) on a ship's hull or bag?
    for (const sh of state.ships) { try { if (sh.sim && sh.sim.hitsShip && sh.sim.hitsShip(toShipX(sh, x), toShipY(sh, y))) return sh; } catch { /* (a ship in the middle of a rebuild) */ } }
    return null;
  };

  // ---- fires --------------------------------------------------------------------------------------------------------------------------------------------------------------------
  function oneFire(key, wx, wy, wz, big, t, dt, vx, vy, smokeZ, night) {
    const F = C().FIRE || {}, size = (big ? F.BIG : F.SIZE) || (big ? 170 : 105), mul = big ? 1.8 : 1;
    let a = acc.get(key);
    if (!a) { a = { l: rnd(), e: rnd(), s: rnd(), ph: (rnd() * 4) | 0 }; acc.set(key, a); }
    const frame = (Math.floor(t * 8) + a.ph) & 3; // the flipbook, stepped at 8 fps
    const h = F.HDR || 1.7; // HDR: the pale core crosses the bloom threshold (more than this and the tone mapping bleaches the flame)
    P.sprite('fire', wx, wy, wz, size, h, h, h, 1, { frame });
    const hc = rgbOf(F.HALO || '#ff9a4a'); // a warm glow disc behind the flame; at night it is what lights the room
    P.sprite('flash', wx, wy + size * 0.38, wz - 8, size * 2.9, hc[0] * 1.4, hc[1] * 1.4, hc[2] * 1.4, (0.12 + 0.36 * night) * (big ? 1.2 : 1));
    const rate = P.rate;
    a.l += dt * (F.LICKS || 11) * mul * rate; a.e += dt * (F.EMBERS || 4) * mul * rate; a.s += dt * (F.SMOKE || 3.2) * mul * rate;
    while (a.l >= 1) { a.l -= 1; P.spawn('fire', wx + rr(-0.26, 0.26) * size, wy + 6, wz + rr(-12, 12), { size: [size * 0.36, size * 0.56], size1: 0.25, life: [0.4, 0.66], up: [110, 200], vx: vx * 0.92, vy: vy * 0.5, speed: [0, 20], drag: 1.6 }); }
    while (a.e >= 1) { a.e -= 1; P.spawn('ember', wx + rr(-0.3, 0.3) * size, wy + size * 0.45, wz + rr(-12, 12), { vx: vx * 0.9, vy: vy * 0.5, up: [110, 260], speed: [0, 60], size: [8, 13] }); }
    while (a.s >= 1) {
      a.s -= 1;
      P.spawn('smoke', wx + rr(-0.2, 0.2) * size, wy + size * 0.85, smokeZ + rr(-10, 10), { size: [size * 0.34, size * 0.5], size1: 2.3, life: [1.5, 2.5], color: big ? (C().SMOKE || {}).big || '#2f2c2e' : (C().SMOKE || {}).fire || '#5a5454', alpha: 1.0, up: [60, 100], vx: vx * 0.9, vy: vy * 0.4, warm: 0.45, speed: [0, 22] });
    }
  }
  function fires(t, dt, night) {
    for (const sh of state.ships) {
      const e = models.get(sh.id);
      if (!e) continue;
      const model = e.model, ctx = model.ctx, st = sh.ctx || state, list = st.fires || [];
      const vx = (sh.pose && sh.pose.vx) || 0, vy = -((sh.pose && sh.pose.vy) || 0);
      const one = (fr) => {
        const q = ctx.P[fr.d];
        if (!q || !fin(fr.x)) return;
        const w = toWorld(model, model.X(fr.x), model.Y(q.y), ctx.FZ + 40);
        if (!P.inView(w.x, w.y)) return;
        oneFire(fr, w.x, w.y, w.z, !!fr.big, t, dt, vx, vy, ctx.W + 50, night);
      };
      for (const fr of list) one(fr);
      for (const f of demo.fires) if (f.ship === sh.id) one(f); // (the dev page's test fires: a deck and a place on it, they ride the ship)
    }
    for (let i = demo.fires.length - 1; i >= 0; i--) if ((demo.fires[i].left -= dt) <= 0) demo.fires.splice(i, 1);
  }

  // ---- puffs: the sim's colour-coded "something happened here" ------------------------------------------------------------------------------------------------------------
  function puffGroup(g) {
    const cls = classify(g.c), n = g.n, x = g.x, y = -g.y, z = Z_FX, sea = seaOf();
    const ship = n >= 3 ? onShip(g.x, g.y) : null;
    switch (cls) {
      case 'fire':
        if (n <= 2) { P.burst('ember', x, y, z, n, { speed: [10, 60], up: [30, 110] }); break; }
        if (n >= 8) { // a real blast: round toon fireballs, then a few tongues
          P.burst('ball', x, y, z, clamp(n / 6, 1, 4), { size: [46 + n * 2.6, 78 + n * 3.6], size1: 1.8, life: [0.28, 0.5], speed: [0, 50 + n * 2], up: [0, 30], area: 6 + n, drag: 2 });
          P.burst('fire', x, y, z, clamp(n * 0.2, 1, 5), { size: [40 + n * 1.5, 64 + n * 2], size1: 0.3, life: [0.35, 0.6], speed: [10, 50], up: [50, 130], area: 6 + n * 0.8, drag: 1.4 });
        } else P.burst('fire', x, y, z, clamp(n * 0.5, 2, 16), { size: [30 + n * 1.5, 52 + n * 2.4], size1: 0.3, life: [0.3, 0.6], speed: [10, 60 + n * 3], up: [20, 110], area: 6 + n * 0.8, drag: 1.4 });
        P.burst('spark', x, y, z + 10, clamp(n * 0.9, 2, 26), { speed: [160, 440 + n * 10] });
        P.burst('smoke', x, y, z - 5, clamp(n * 0.2, 1, 6), { size: [44, 80], color: '#403c3c', warm: 0.8, life: [1.1, 2], speed: [10, 50], up: [30, 70] });
        if (n >= 10) P.flash(x, y, z + 30, 110 + n * 7, '#ffd9a0');
        if (n >= 18) P.hitFlash(x, y, z, 150 + n * 6);
        if (ship) P.splinters(x, y, z, clamp(n * 0.5, 2, 12), { kind: 'wood', speed: [120, 380] });
        break;
      case 'gold':
        P.burst('spark', x, y, z, clamp(n * (n <= 6 ? 0.9 : 1.3), 2, 20), { speed: [120, n <= 6 ? 380 : 520], life: [0.25, 0.55] });
        if (n >= 8) P.flash(x, y, z + 20, 90 + n * 4, '#fff0c0');
        if (ship && n >= 6) P.splinters(x, y, z, clamp(n * 0.4, 2, 7), { kind: 'iron', speed: [100, 300] });
        break;
      case 'smoke': P.burst('smoke', x, y, z, clamp(n, 1, 8), { size: [20 + Math.min(30, n * 3), 40 + Math.min(40, n * 4)], size1: 2.4, life: [0.9, 1.7], color: lumOf(g.c) < 0.4 ? '#3c3838' : '#6c6868', warm: 0.25, alpha: 0.7 }); break;
      case 'steam': P.burst('steam', x, y, z, clamp(n, 1, 8), { size: [22 + Math.min(24, n * 2.5), 40 + Math.min(30, n * 3)] }); break;
      case 'dust':
        P.burst('dust', x, y, z, clamp(n, 1, 8), { color: g.c });
        if (n >= 4) P.splinters(x, y, z, clamp(n * 0.5, 2, 6), { kind: ship ? 'wood' : 'rock', speed: [80, 260] });
        break;
      case 'spray':
        P.burst('drop', x, y, z, clamp(n * 1.5, 3, 16), { dir: Math.PI / 2, spread: 0.9 });
        P.burst('steam', x, y, z, clamp(n * 0.35, 1, 4), { size: [26, 44], alpha: 0.55 });
        if (sea !== null && Math.abs(g.y - sea) < 90 && n >= 2) world.splashAt(x, g.y, clamp(70 + n * 8, 80, 260), 40);
        break;
      default: P.burst('steam', x, y, z, clamp(n, 1, 6), { size: [20, 38], color: g.c, alpha: 0.7 });
    }
  }
  function puffs() {
    groups.clear();
    for (const p of state.puffs) {
      if (seen.has(p)) continue;
      seen.add(p);
      if (!primed || !fin(p.x) || !fin(p.y)) continue;
      const key = Math.round(p.x / 8) + ',' + Math.round(p.y / 8) + p.c;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { x: p.x, y: p.y, c: p.c, n: 0 }));
      g.n++;
    }
    for (const g of groups.values()) { puffGroup(g); V.counts.puffGroups++; }
  }

  // ---- flashes (the muzzle star), rings (an impact), the hit-stop flash ------------------------------------------------------------------------------------------------------------
  function flashes(dt) {
    let glow = 0;
    for (const f of state.flashes || []) {
      if (seen.has(f)) continue;
      seen.add(f);
      if (!primed || !fin(f.x) || !fin(f.y)) continue;
      const size = fin(f.size) ? f.size : 1, ang = fin(f.ang) ? -f.ang : 0, x = f.x, y = -f.y;
      if (f.glow) { // the flamethrower's cone: a few little flames along it (not one per flash: three per step is far too many)
        if (glow++ % 2 === 0) P.spawn('fire', x, y, Z_FX, { size: [60, 105], size1: 0.35, life: [0.3, 0.5], speed: 0, vx: Math.cos(ang) * 330, vy: Math.sin(ang) * 330, up: 0, drag: 0.4 });
        continue;
      }
      muzzles.push(x, y);
      P.muzzle(x, y, Z_FX + 40, ang, 70 + 60 * size, f.color || '#ffe9a8');
      if (size >= 2.2) P.flash(x, y, Z_FX + 30, 120 * size, '#ffd9a0');
    }
    void dt;
  }
  function rings() {
    const hit = C().HITSTOP_AT || 190;
    for (const r of state.rings || []) {
      if (seen.has(r)) continue;
      seen.add(r);
      if (!primed || !fin(r.x) || !fin(r.y)) continue;
      const size = fin(r.size) ? r.size : fin(r.r) ? r.r * 2 : 100;
      P.ring(r.x, -r.y, Z_FX + 20, size * 1.25, r.color || '#ffd23f', clamp(r.max || 0.3, 0.2, 0.6));
      if (size >= hit) { P.hitFlash(r.x, -r.y, Z_FX, size * 1.4); P.burst('spark', r.x, -r.y, Z_FX, 14, { speed: [220, 620] }); }
    }
  }

  // ---- shells, bullets, bombs ------------------------------------------------------------------------------------------------------------------------------------------------------
  function tracer(vx, vy, x, y, color, hdr, width, lenBase, key, dt, smoke) { // (x, y and the velocity are the game's: y down)
    const sp = Math.hypot(vx, vy);
    if (sp < 1) return;
    const dx = vx / sp, dy = -vy / sp, len = lenBase + sp * 0.05, c = rgbOf(color);
    if (P.inView(x, -y)) {
      P.sprite('spark', x - dx * len * 0.5, -y - dy * len * 0.5, Z_FX, width, c[0] * hdr, c[1] * hdr, c[2] * hdr, 1, { dx, dy, len }); // (the bright head is at the shell, the tail trails behind)
    }
    if (smoke && P.trails) {
      let a = acc.get(key) || 0;
      a += dt;
      if (a >= 0.03) { a = 0; P.spawn('smoke', x, -y, Z_FX - 10, { size: [14, 22], size1: 2.6, life: [0.45, 0.7], color: (C().SMOKE || {}).trail || '#8d8884', alpha: 0.5, speed: [0, 8], up: [0, 10], warm: 0.2 }); }
      acc.set(key, a);
    }
  }
  function shells(dt) {
    const K = C();
    const handle = (s, demoShell) => {
      if (!fin(s.x) || !fin(s.y) || s.life <= 0 || s.frag) return;
      const fresh = !seen.has(s);
      if (fresh) {
        seen.add(s);
        if (primed || demoShell) { // a NEW shell: a muzzle star where it left (unless a flash of the sim is already there)
          const near = (() => { for (let i = 0; i < muzzles.length; i += 2) if (Math.abs(muzzles[i] - s.x) < 150 && Math.abs(muzzles[i + 1] + s.y) < 150) return true; return false; })();
          if (!near && P.inView(s.x, -s.y)) { P.muzzle(s.x, -s.y, Z_FX + 40, Math.atan2(-s.vy, s.vx), s.primed ? 200 : 120, s.primed ? K.TRACER_PRIMED : '#ffe9a8'); muzzles.push(s.x, -s.y); }
        }
      }
      tracer(s.vx, s.vy, s.x, s.y, s.primed ? K.TRACER_PRIMED : K.TRACER || '#ffb838', 2.6, s.primed ? 24 : 15, s.primed ? 170 : 110, s, dt, true);
    };
    for (const s of state.shells) handle(s, false);
    for (const s of demo.shells) handle(s, true);
    for (const b of state.bullets) {
      if (!fin(b.x) || !fin(b.y) || b.life <= 0) continue;
      if (!seen.has(b)) seen.add(b);
      tracer(b.vx, b.vy, b.x, b.y, b.flak ? K.FLAK : K.BULLET, 2.4, b.flak ? 16 : 11, b.mortar ? 80 : 60, b, dt, !!b.mortar || !!b.flak);
    }
    // the test volley: shells in flight, then an impact where each one ends
    for (let i = demo.shells.length - 1; i >= 0; i--) {
      const s = demo.shells[i];
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      if (s.life <= 0) { demo.shells.splice(i, 1); P.explosion(s.x, -s.y, Z_FX, 0.9, { wood: true }); }
    }
    for (let i = demo.queue.length - 1; i >= 0; i--) {
      const q = demo.queue[i];
      if ((q.wait -= dt) <= 0) { demo.shells.push(q.shell); demo.queue.splice(i, 1); }
    }
  }
  function bombs(dt) {
    for (const list of [state.shipBombs, state.enemyBombs]) {
      for (const b of list || []) {
        if (!fin(b.x) || !fin(b.y) || !P.inView(b.x, -b.y)) continue;
        let a = acc.get(b) || 0;
        a += dt;
        if (a >= 0.05 && P.trails) { a = 0; P.spawn('smoke', b.x, -b.y + 14, Z_FX - 10, { size: [14, 24], size1: 2.4, life: [0.6, 0.9], color: (C().SMOKE || {}).fire || '#5a5454', alpha: 0.6, speed: [0, 10], up: [20, 40], warm: 0.2 }); if (rnd() < 0.5) P.spawn('ember', b.x, -b.y + 18, Z_FX, { up: [20, 60], speed: [0, 30], size: [6, 9] }); }
        acc.set(b, a);
      }
    }
  }

  // ---- the boiler (chimney and vents), the engines ------------------------------------------------------------------------------------------------------------------------------
  function steam(dt) {
    const K = C();
    for (const sh of state.ships) {
      const e = models.get(sh.id);
      if (!e) continue;
      const model = e.model, ctx = model.ctx, L = sh.layout, st = sh.ctx || state, ship = st.ship || state.ship || {};
      const press = fin(ship.press) ? ship.press : 50, over = fin(st.overdrive) ? st.overdrive : 0, warn = (config.BOILER && config.BOILER.WARN_AT) || 90;
      const vx = (sh.pose && sh.pose.vx) || 0, vy = -((sh.pose && sh.pose.vy) || 0);
      let a = acc.get(sh) || { c: 0, v: 0, x: 0 };
      // the chimney: a steady puff by pressure, thick and dark in overdrive
      let rate = (press > 20 ? 0.8 + 3.2 * clamp(press / 100, 0, 1) : 0) + 9 * over;
      a.c += dt * rate * P.rate;
      const boilers = (L.stations || []).filter((s) => s.kind === 'boiler' && ctx.P[s.d]);
      while (a.c >= 1 && boilers.length) {
        a.c -= 1;
        const b = boilers[(rnd() * boilers.length) | 0], w = toWorld(model, model.X(b.x), model.Y(ctx.P[b.d].y - 224), ctx.W * 0.9);
        if (!P.inView(w.x, w.y)) continue;
        const dark = over > 0.3 && rnd() < over;
        P.spawn(dark ? 'smoke' : 'steam', w.x, w.y, w.z, { size: [20 + 8 * over, 34 + 12 * over], size1: 2.8, life: [1.1, 1.8 + over], color: dark ? '#4a4646' : (K.SMOKE || {}).steam || '#f4f7f7', alpha: dark ? 0.7 : 0.6, up: [100 + 60 * over, 160 + 90 * over], vx: vx * 0.9, vy: vy * 0.4, speed: [0, 20], warm: dark ? 0.3 : 0 });
      }
      if (a.c > 3) a.c = 3;
      // vents: an open valve blows a big plume; a closed one hisses when the pressure is in the red
      const open = st.ventOpen || [];
      (L.vents || []).forEach((v, i) => {
        const isOpen = !!open[i], r = isOpen ? 20 : press >= warn ? 5 : 0;
        if (!r || !ctx.P[v.d]) return;
        a['v' + i] = (a['v' + i] || 0) + dt * r * P.rate;
        while (a['v' + i] >= 1) {
          a['v' + i] -= 1;
          const w = toWorld(model, model.X(v.x), model.Y(ctx.P[v.d].y - 112), ctx.W * 0.9);
          if (!P.inView(w.x, w.y)) continue;
          P.spawn('steam', w.x, w.y, w.z, { size: isOpen ? [34, 58] : [22, 36], size1: 3, life: isOpen ? [0.8, 1.3] : [0.6, 0.9], up: isOpen ? [190, 290] : [90, 140], speed: [0, 28], vx: vx * 0.9, vy: vy * 0.4, alpha: isOpen ? 0.7 : 0.55 });
        }
        if (a['v' + i] > 3) a['v' + i] = 3;
      });
      acc.set(sh, a);
      // engines: exhaust from the stubs, by each engine's own throttle (state.engines[i].pow, merged per engine)
      const live = st.engines || [];
      const pf = sh.pose && sh.pose.f === -1 ? -1 : 1;
      for (const en of model.dyn.engines) {
        const le = live.find((q) => q.name === en.name);
        let pow = le && fin(le.pow) ? le.pow : le && fin(le.thr) ? le.thr : 0.5;
        if (le && le.works === false) pow = 0;
        const k = 'e' + en.name;
        a[k] = (a[k] || 0) + dt * Math.abs(pow) * 7 * P.rate;
        while (a[k] >= 1) {
          a[k] -= 1;
          const m = en.group.matrixWorld.elements, lx = -en.out * 24, ly = 24; // (the exhaust stubs, behind the nacelle's centre)
          const wx = m[0] * lx + m[4] * ly + m[12], wy = m[1] * lx + m[5] * ly + m[13], wz = m[2] * lx + m[6] * ly + m[14];
          if (!P.inView(wx, wy)) continue;
          P.spawn('smoke', wx, wy, wz, { size: [14, 24], size1: 2.6, life: [0.7, 1.15], color: (C().SMOKE || {}).exhaust || '#8f8f8f', alpha: 0.5, up: [10, 30], vx: vx * 0.88 - pf * 50, vy: vy * 0.5, speed: [0, 14], warm: 0.1 });
        }
        if (a[k] > 3) a[k] = 3;
      }
    }
  }

  // ---- the Kraken: splashes where it crosses the sea line, a breach burst, spray at grips ------------------------------------------------------------------------------------------
  function kraken(dt) {
    const cr = state.creature, sea = seaOf();
    if (!cr || sea === null || !cr.parts) { crossSide.clear(); crossAt.clear(); return; }
    let made = 0;
    for (const p of cr.parts) {
      if (!p.segs || p.dead || p.hidden) continue;
      const mantle = p.kind === 'mantle', z = mantle ? 0 : p.layer === 'front' ? 360 : -360;
      p.segs.forEach((s, i) => {
        if (!fin(s.x) || !fin(s.y) || !fin(s.ang) || !fin(s.len)) return;
        const mx = s.x + Math.cos(s.ang) * s.len * 0.5, my = s.y + Math.sin(s.ang) * s.len * 0.5, key = (p.id || p.kind) + '#' + i;
        const side = my > sea + 6 ? 1 : my < sea - 6 ? 0 : -1;
        if (side < 0) return;
        const was = crossSide.get(key), wasY = crossAt.get(key + 'y'), ck = 'c' + (p.id || p.kind), cd = crossAt.get(ck) || 0;
        crossSide.set(key, side); crossAt.set(key + 'y', my);
        if (i === 0 && cd > 0) crossAt.set(ck, cd - dt); // (one cooldown for the whole limb: its first segment counts it down)
        if (was === undefined || was === side || cd > 0 || made >= 2) return;
        crossAt.set(ck, mantle ? 1.2 : 0.5);
        made++; V.counts.splash++;
        const spd = wasY === undefined ? 300 : Math.abs(my - wasY) / Math.max(dt, 0.008), k = clamp(spd / 450, 0.35, 1.8) * (mantle ? 1.6 : 1), w = Math.min(420, Math.max(60, (s.r || 20) * 2.4)) * (mantle ? 1.2 : 1);
        const sx = mx, sy = -sea, kk = Math.min(k, 2);
        P.burst('drop', sx, sy, z, Math.round(14 * k), { dir: Math.PI / 2, spread: 0.6, speed: [260 * kk, 560 * kk], size: mantle ? [28, 52] : [14, 26], area: w * 0.25, up: [60, 200] });
        P.burst('steam', sx, sy + 10, z, Math.round(2 + 1.5 * k), { size: [w * 0.22, w * 0.36], size1: 2.0, life: [0.8, 1.3], alpha: 0.55, speed: [10, 70], up: [20, 80], area: w * 0.3 });
        if (k > 1) P.flash(sx, sy + 30, z + 30, w * 1.4, '#e8fbff', { hdr: 1.6, alpha: 0.5 });
        world.splashAt(sx, sea, clamp(w * 1.2, 90, 520), z + 40);
      });
      if (p.grip && fin(p.grip.x) && fin(p.grip.y) && P.inView(p.grip.x, -p.grip.y)) { // a tentacle gripping the ship: spray and chips
        const a = acc.get(p) || 0;
        const q = a + dt;
        if (q >= 0.14) { acc.set(p, 0); P.burst('drop', p.grip.x, -p.grip.y, z + 20, 2, { spread: 1.2, speed: [60, 190], size: [8, 13] }); if (rnd() < 0.35) P.splinters(p.grip.x, -p.grip.y, z + 20, 2, { kind: 'wood', speed: [60, 200], up: [30, 100] }); } else acc.set(p, q);
      }
    }
  }

  // ---- debris on fire, the coil's bolt ---------------------------------------------------------------------------------------------------------------------------------------------------
  function debris(dt) {
    for (const d of state.debris || []) {
      if (!d.burn || !fin(d.x) || !fin(d.y) || !P.inView(d.x, -d.y)) continue;
      let a = acc.get(d) || 0;
      a += dt * 9 * P.rate;
      while (a >= 1) { a -= 1; P.spawn('fire', d.x + rr(-0.3, 0.3) * (d.w || 80), -d.y + rr(-0.2, 0.2) * (d.h || 60), Z_FX, { size: [48, 84], size1: 0.3, life: [0.35, 0.6], up: [60, 140], vx: d.vx * 0.6, vy: -d.vy * 0.6, speed: [0, 20], drag: 1.2 }); }
      acc.set(d, a);
    }
  }
  function coil() {
    const bolt = state.coil && state.coil.bolt;
    if (!bolt || !bolt.pts || bolt.t <= 0) return;
    const K = C(), c = rgbOf(K.LIGHTNING || '#9fd8ff'), pts = bolt.pts, pw = clamp(bolt.power || 0.5, 0.2, 1);
    if (!seen.has(bolt)) {
      seen.add(bolt);
      if (primed && pts[0]) { P.flash(pts[0][0], -pts[0][1], Z_FX + 30, 260 + 160 * pw, '#cfe8ff'); P.hitFlash(pts[0][0], -pts[0][1], Z_FX, 200 + 200 * pw); for (let i = 1; i < pts.length; i += 2) P.burst('spark', pts[i][0], -pts[i][1], Z_FX, 4, { color: '#b8e0ff', speed: [120, 380] }); }
    }
    const fade = clamp(bolt.t / 0.5, 0, 1);
    for (let i = 1; i < pts.length; i++) { // the jagged bolt: a bright streak between neighbouring points (drawn this frame only)
      const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dy = -(b[1] - a[1]), len = Math.hypot(dx, dy);
      if (!(len > 1) || !fin(len)) continue;
      P.sprite('spark', (a[0] + b[0]) / 2, -(a[1] + b[1]) / 2, Z_FX + 20, 16 + 16 * pw, c[0] * 3.6, c[1] * 3.6, c[2] * 3.6, fade, { dx: dx / len, dy: dy / len, len: len * 1.25 });
    }
  }

  // ---- the dev page's VFX test: a fire, a volley, an explosion ------------------------------------------------------------------------------------------------------------------------
  V.test = (what = 'all') => {
    const main = state.ships[0], e = main && models.get(main.id);
    if (!e) return false;
    const model = e.model, ctx = model.ctx, f = main.pose.f === -1 ? -1 : 1, L = main.layout;
    const mid = toWorld(model, model.X(L.midPoint.x), model.Y(L.midPoint.y), 0), rp = { x: mid.x, y: mid.y }; // (the middle of the hull, in the world)
    if (what === 'all' || what === 'fire') {
      let d = ctx.P.findIndex((p) => p.id === 'main');
      if (d < 0) d = 0;
      const q = ctx.P[d];
      if (q) for (const [k, big] of [[0.3, false], [0.55, true], [0.78, false]]) demo.fires.push({ ship: main.id, d, x: q.x0 + (q.x1 - q.x0) * k, big, left: 14 });
    }
    if (what === 'all' || what === 'volley') {
      for (let i = 0; i < 6; i++) { // six shells from the bow, fanned a little, one after another
        const w = toWorld(model, model.X(L.bounds.x1 + 20), model.Y(L.midPoint.y - 60 - (i % 3) * 38), 0), ang = (f > 0 ? 0.03 : Math.PI - 0.03) + (i - 2.5) * 0.035 * f; // (game angles, y down)
        demo.queue.push({ wait: i * 0.1, shell: { x: w.x, y: -w.y, vx: Math.cos(ang) * 900, vy: (i - 2.5) * 36, life: 0.95, owner: null, demo: true } });
      }
    }
    if (what === 'all' || what === 'explosion') {
      const x = rp.x - f * 140, y = rp.y - 20;
      P.explosion(x, y, 90, 2.2, { wood: true });
      P.splinters(x, y, 90, 14, { kind: 'iron', speed: [200, 520] });
    }
    return true;
  };

  // ---- the frame ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  // c = { cam: { x, y, hw, hh } (the look-at point and half the visible size, 3D units), night, hemi (the hemisphere light) }
  V.update = (dt, t, c) => {
    if (t < lastT - 0.01 || t - lastT > 0.6) primed = false; // (a restart or a long gap: learn what is there, make nothing)
    lastT = t;
    dt = clamp(dt, 0, 0.05);
    P.begin();
    muzzles.length = 0;
    if (c && c.cam) P.setView(c.cam.x, c.cam.y, c.cam.hw, c.cam.hh); else P.setView(null);
    if (c && c.hemi) P.setAmbient(c.hemi.color, c.hemi.groundColor, c.hemi.intensity, c.night);
    const night = c ? clamp(c.night || 0, 0, 1) : 0;
    fires(t, dt, night);
    puffs();
    flashes(dt);
    rings();
    shells(dt);
    bombs(dt);
    steam(dt);
    kraken(dt);
    debris(dt);
    coil();
    primed = true;
    P.update(dt, t);
  };
  V.setTier = (tier) => P.setTier(tier);
  V.stats = () => P.stats();
  V.clear = () => { P.clear(); demo.fires.length = demo.shells.length = demo.queue.length = 0; };
  V.dispose = () => P.dispose();
  return V;
}
