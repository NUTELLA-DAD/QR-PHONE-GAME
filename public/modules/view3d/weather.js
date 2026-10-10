// WP12: WEATHER AND THE SEVEN ENVIRONMENTS in 3D (3D.md section 16). This file ties the pieces together and reads the game's state; it never writes it.
//   weatherFall.js   the falling layer (rain, snow, embers, motes, stars): ONE instanced mesh moved in the vertex shader (straight lines and gravity only)
//   weatherShip.js   what the weather puts on the ship: frost crusts (a per-part shader crust + ice lumps), the storm's lightning rods, the sea's pump and flood water: ONE merged mesh
//   weatherWorld.js  the lava of the Ember Forge, the Sunken Sea's waterspouts and survivors' rafts, the Aether's aurora
//   here             the numbers (the sim's storm / gust / blizzard / heat / smoke, mapped to densities and slants), the wet ship, the splashes (particles: bounces on the decks, rings on the sea), the gust streaks,
//                    the charge of a lightning strike, a rod catching a bolt, the lava's smoke plumes and vents, the clogged engines' puffs, the keel's spray, the survivor's rope
// What each environment shows (everything else is the sky, the clouds, the rock and the light rig that were already there):
//   Sky Isles: nothing new          Frost Peaks: snow (a blizzard thickens it and streaks it), crusts on the bag, the outdoor decks and the guns       Ember Forge: embers rising off the lava, the lava itself, smoke plumes, heat on the hull
//   Fungal Depths: puffs from clogged engines (the spores and glow are fungal.js)        The Aether: a drifting star field, slow motes, an aurora band       Storm Front: rain, a wet ship, rods, charge, gust streaks, bolts to the rod
//   Sunken Sea: waterspouts, rafts with waving survivors, the pump and the flood water, spray at the keel (and rain when a storm front crosses it)
// Rain falls in ANY environment while the sim's storm front is up (state.weather.storm), like the 2D game.
// Switch it all off with ?look=noweather. No Math.random (particles.js's seeded generator), no sine.
import { THREE, look } from './style.js';
import { config } from '../../config.js';
import { createFall } from './weatherFall.js';
import { createWeatherShip } from './weatherShip.js';
import { createLava, createSeaThings, makeAurora } from './weatherWorld.js';
import { setWet } from './parts3d/kit.js';
import { rnd } from './particles.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fin = Number.isFinite;
const hashN = (n, salt = 0) => { let h = Math.imul(((n | 0) ^ 0x9e3779b1) + salt * 0x27d4eb2d, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const wrap1 = (v, s) => v - s * Math.floor(v / s);
const rr = (a, b) => a + (b - a) * rnd();

export function createWeather({ parent, state, world, models, vfx, renderer }) {
  const W3 = () => (config.LOOK3D && config.LOOK3D.WEATHER) || {};
  let envNow = 'skyisles';
  const cfg = (name) => ({ ...(W3()[name] || {}), ...(((config.LOOK3D && config.LOOK3D[envNow] && config.LOOK3D[envNow].wx) || {})[name] || {}) });
  const fall = createFall(parent, 700);
  const ship = createWeatherShip({ state, models, parent });
  const lava = createLava(parent);
  const sea = createSeaThings(parent, 48);
  const P = () => (vfx && vfx.P && look.vfx ? vfx.P : null);
  const S = { mode: 'none', density: 0, rain: 0, snow: 0, embers: 0, motes: 0, stars: 0, rods: 0, crusts: 0, frostParts: 0, pump: 0, lava: 0, spouts: 0, rafts: 0, spores: 0, clogs: 0, gale: 0, wet: 0, aurora: 0, calls: 0, ms: 0, bolts: 0 };
  const W = { stats: S };
  const cur = { mode: 'none', dens: 0, slant: 0, wind: 0, wetV: 0, blizz: 0, heat: 0, boxX: 5000, boxY: 3000, lastBolt: null, aurora: null, acc: {}, plume: new Map(), tier: 'medium', t: 0, dt: 0, night: 0, c: null };
  const tierK = (tier) => { const D = W3().DENSITY || {}; return D[tier && tier.name] != null ? D[tier.name] : 0.7; };
  const white = new THREE.Color('#ffffff'), _tint = new THREE.Color();

  const MODE_ID = { rain: 0, snow: 1, ember: 2, mote: 3 };

  // ---- which falling thing, how thick -------------------------------------------------------------------------------------------------------------------------------------------------
  function wanted(env, c) {
    const w = state.weather || {}, E = state.env || {}, tk = tierK(c.tier);
    const storm = clamp(fin(w.storm) ? w.storm : 0, 0, 1);
    if (storm > 0.08) return { mode: 'rain', d: storm * tk * (c.cave ? cfg('RAIN').CAVE : 1) };
    if (env === 'frost') { const S2 = cfg('SNOW'), b = clamp(fin(E.blizzard) ? E.blizzard : 0, 0, 1); return { mode: 'snow', d: tk * (S2.CALM + (S2.FULL - S2.CALM) * b) * (c.cave ? 0.5 : 1) }; }
    if (env === 'ember') { const M = cfg('EMBER'); return { mode: 'ember', d: tk * clamp(M.SHARE + M.HEAT * clamp(fin(E.heat) ? E.heat : 0, 0, 1) * 0.6, 0, 1) }; }
    if (env === 'aether') { const M = cfg('MOTE'); return { mode: 'mote', d: tk * M.SHARE }; }
    return { mode: 'none', d: 0 };
  }

  function setFall(mode, c, dt) {
    const U = fall.U, E = state.env || {}, w = state.weather || {};
    U.uMode.value = MODE_ID[mode] != null ? MODE_ID[mode] : 0;
    const wind = fin(E.wind) ? E.wind : 0;
    cur.wind += (wind - cur.wind) * Math.min(1, dt * 3);
    let vx = 0, vy = 0;
    if (mode === 'rain') {
      const R = cfg('RAIN'), E2 = (config.ENVIRONMENTS.storm || {}).RAIN || {};
      const target = (-(E2.SLANT || 30) + (E2.WIND_SLANT || 0.9) * cur.wind) / (R.SLANT || 90);
      cur.slant += (target - cur.slant) * Math.min(1, dt * 3);
      vx = cur.slant * R.SPEED; vy = -R.SPEED;
      U.uColor.value.set(R.COLOR); U.uAlpha.value = R.ALPHA; U.uAddk.value = 0; U.uSize.value = R.WIDTH; U.uLen.value = R.LEN; U.uHdr.value = 1;
    } else if (mode === 'snow') {
      const R = cfg('SNOW'), b = clamp(fin(E.blizzard) ? E.blizzard : 0, 0, 1);
      cur.blizz += (b - cur.blizz) * Math.min(1, dt * 2);
      vx = R.DRIFT + R.WIND * cur.wind; vy = -R.SPEED * (1 + cur.blizz * 0.8);
      U.uColor.value.set(R.COLOR); U.uAlpha.value = R.ALPHA; U.uAddk.value = 0; U.uSize.value = R.SIZE; U.uLen.value = cur.blizz * R.STREAK; U.uHdr.value = 1;
    } else if (mode === 'ember') {
      const R = cfg('EMBER');
      U.uColor.value.set(R.COLORS[0]); U.uColor2.value.set(R.COLORS[1]); U.uAlpha.value = R.ALPHA; U.uAddk.value = 0.86; U.uSize.value = R.SIZE; U.uHdr.value = R.HDR;
    } else if (mode === 'mote') {
      const R = cfg('MOTE'), sp = R.SPEED || [6, 4];
      vx = sp[0]; vy = sp[1];
      U.uColor.value.set(R.COLORS[0]); U.uColor2.value.set(R.COLORS[1]); U.uAlpha.value = R.ALPHA; U.uAddk.value = 0.85; U.uSize.value = R.SIZE; U.uHdr.value = R.HDR;
    }
    // the slide: an integral (a gust changes the slope, never the places), wrapped by whole numbers of boxes
    fall.phase.x += vx * dt; fall.phase.y += vy * dt;
    const bx4 = fall.box.x * 4, by4 = fall.box.y * 4;
    fall.phase.x = fall.phase.x - bx4 * Math.floor(fall.phase.x / bx4);
    fall.phase.y = fall.phase.y - by4 * Math.floor(fall.phase.y / by4);
    U.uPhase.value.set(fall.phase.x, fall.phase.y);
    const l = Math.hypot(vx, vy) || 1;
    U.uDir.value.set(vx / l, vy / l);
    void w;
  }

  // ---- the frame ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  // c = { t, dt, env, cave, night, tier, cam: { visW, visH }, target (THREE.Vector3: the camera's look-at), camera, sea (the sea level in the game's y or null), map }
  W.update = (c) => {
    const t0 = performance.now();
    const env = c.env || 'skyisles';
    envNow = env;
    cur.c = c; cur.t = c.t; cur.dt = c.dt; cur.night = c.night || 0; cur.tier = c.tier;
    const E = state.env || {}, w = state.weather || {};
    if (!look.weather) {
      fall.mesh.visible = false; ship.update({ t: c.t, env: 'none' }); lava.update(c.t, NaN, null, c.camera); sea.begin(); sea.end(); setWet(0); world.lights.setHeat(0); world.sky.setExtra(null);
      S.calls = 0; S.mode = 'off';
      return;
    }
    const dt = clamp(c.dt, 0, 0.05), vis = c.cam;
    // ---- the falling box follows what the screen shows, in big steps (so its places do not rescale all the time)
    const wantX = Math.max(2400, Math.ceil((vis.visW * (W3().BOX || 1.6)) / 400) * 400), wantY = Math.max(1600, Math.ceil((vis.visH * (W3().BOX || 1.6)) / 400) * 400);
    if (wantX > fall.box.x * 1.3 || wantX < fall.box.x * 0.78) fall.box.x = wantX;
    if (wantY > fall.box.y * 1.3 || wantY < fall.box.y * 0.78) fall.box.y = wantY;
    const U = fall.U;
    U.uBox.value.set(fall.box.x, fall.box.y);
    const Z = W3().Z || [-650, 300];
    U.uZ.value.set(Z[0], Z[1] - Z[0]);
    U.uC.value.set(c.target.x, c.target.y);
    U.uScale.value = clamp(vis.visH / 1500, 0.45, 3.2);
    U.uTime.value = c.t;
    renderer.getDrawingBufferSize(_sz);
    U.uRes.value.set(Math.max(2, _sz.x), Math.max(2, _sz.y));
    U.uPx.value = Math.max(0.6, _sz.y / 1080);
    // ---- which mode, how thick (a mode change thins the old one out first)
    const want = wanted(env, { ...c, tier: c.tier });
    if (cur.mode !== want.mode) { cur.dens += (0 - cur.dens) * Math.min(1, dt * 3); if (cur.dens < 0.02) { cur.dens = 0; cur.mode = want.mode; } }
    else cur.dens += (want.d - cur.dens) * Math.min(1, dt * (want.d > cur.dens ? 0.9 : 1.5));
    if (cur.mode !== 'none') setFall(cur.mode, c, dt);
    U.uDensity.value = cur.dens;
    // stars (the Aether) are independent of the near mode
    const starsOn = env === 'aether' ? cfg('STARS').SHARE * tierK(c.tier) : 0;
    U.uStars.value += (starsOn - U.uStars.value) * Math.min(1, dt * 1.5);
    // the lava (the embers' birth line) and the sea (nothing falls under water)
    const lavaY = env === 'ember' && fin(E.lavaY) ? E.lavaY : NaN;
    U.uLavaY.value = fin(lavaY) ? -lavaY : c.target.y - vis.visH * 0.42;
    U.uCut.value = env === 'sea' && c.sea != null && fin(c.sea) ? -c.sea : fin(lavaY) && cur.mode === 'rain' ? -lavaY : -1e9;
    // the light of the place on rain and snow: the hemisphere's colour, darker at night, whiter in a lightning flash
    const hm = world.hemi, flash = world.lights ? world.lights.flashAdd || 0 : 0;
    _tint.copy(hm.color).lerp(white, 0.55).multiplyScalar(clamp(1 - 0.6 * (c.night || 0), 0.3, 1) * (1 + 0.45 * flash / 2.2));
    U.uTint.value.copy(_tint);
    fall.mesh.visible = cur.mode !== 'none' && cur.dens > 0.004 || U.uStars.value > 0.01;
    S.mode = cur.mode; S.density = +cur.dens.toFixed(3); S.spores = env === 'fungal' ? (state.spores || []).length : 0;
    const nNear = fall.nNear;
    S.rain = cur.mode === 'rain' ? Math.round(cur.dens * nNear) : 0; S.snow = cur.mode === 'snow' ? Math.round(cur.dens * nNear) : 0;
    S.embers = cur.mode === 'ember' ? Math.round(cur.dens * nNear) : 0; S.motes = cur.mode === 'mote' ? Math.round(cur.dens * nNear) : 0;
    S.stars = Math.round(U.uStars.value * fall.nFar);
    // ---- the wet ship (rain soaks it in a quarter of a minute, it dries in a few)
    const WT = cfg('WET'), wetWant = cur.mode === 'rain' ? clamp(cur.dens / Math.max(0.2, tierK(c.tier)), 0, 1) : 0;
    cur.wetV += (wetWant - cur.wetV) * Math.min(1, dt * (wetWant > cur.wetV ? WT.RISE : WT.DRY));
    setWet(cur.wetV * WT.MAX);
    S.wet = +cur.wetV.toFixed(3);
    // ---- what is on the ship
    ship.update({ t: c.t, env });
    S.rods = ship.rods || 0; S.crusts = ship.crusts || 0; S.pump = ship.pump || 0; S.frostParts = ship.frostParts || 0;
    // ---- the lava, the heat
    lava.update(c.t, lavaY, c.map, c.camera);
    S.lava = lava.mesh.visible ? lava.spans : 0;
    cur.heat += ((env === 'ember' && fin(E.heat) ? E.heat : 0) - cur.heat) * Math.min(1, dt * 3);
    world.lights.setHeat(cur.heat);
    // ---- the sea's waterspouts and rafts
    sea.begin();
    if (env === 'sea' && state.sea && c.sea != null && fin(c.sea)) {
      const SS = state.sea, F = (config.ENVIRONMENTS.sea || {}), seaTop = -c.sea, cx = c.target.x, hw = vis.visW / 2 + 1800, K8 = Math.floor(c.t * 8), SP = cfg('SPOUT');
      for (const sp of SS.spouts || []) if (Math.abs(sp.x - cx) < hw) sea.spout(sp.x, seaTop, -120, sp.r || 70, (F.SPOUT && F.SPOUT.HEIGHT) || 950, K8 * (SP.STEP || 0.2) + (sp.id || 0));
      for (const sv of SS.survivors || []) if (!sv.saved && Math.abs(sv.mx - cx) < hw) sea.raft(sv.mx, seaTop + 4, 60, sv.n || 1, ((K8 >> 1) + (sv.id || 0)) & 1, false);
    }
    sea.end();
    S.spouts = sea.spouts; S.rafts = sea.rafts;
    // ---- the aurora
    if (env === 'aether') {
      if (!cur.aurora) cur.aurora = makeAurora();
      const A = cfg('AURORA');
      world.sky.setExtra({ texture: cur.aurora, key: 'aurora', z: -9300, h: A.HEIGHT || 2600, top: true, alpha: A.ALPHA == null ? 0.5 : A.ALPHA, drift: A.DRIFT == null ? 8 : A.DRIFT, additive: true });
      S.aurora = 1;
    } else { world.sky.setExtra(null); S.aurora = 0; }
    // ---- the model's gale (the gunship's pennant stands out in a gust, stepped)
    const gale = clamp(Math.max(fin(E.gale) ? E.gale : 0, w.gusting ? clamp(w.storm || 0, 0, 1) : 0), 0, 1);
    S.gale = +gale.toFixed(2);
    for (const e of models.values()) e.model.gale = gale;
    // ---- calls
    S.calls = (fall.mesh.visible ? 1 : 0) + (ship.visible ? 1 : 0) + (lava.mesh.visible ? 1 : 0) + (sea.mesh.visible ? 1 : 0) + (S.aurora ? 1 : 0);
    const ms = performance.now() - t0;
    S.ms = +(S.ms * 0.9 + ms * 0.1).toFixed(3);
  };
  const _sz = new THREE.Vector2();

  // ---- the particle effects: called from vfx.update (between P.begin and P.update) ------------------------------------------------------------------------------------------------
  W.emit = (t, dt) => {
    const Pp = P(), c = cur.c;
    if (!Pp || !c || !look.weather) return;
    const env = c.env, E = state.env || {}, w = state.weather || {}, vis = c.cam, K8 = Math.floor(t * 8), cx = c.target.x, cy = c.target.y;
    const acc = (k, rate) => { cur.acc[k] = (cur.acc[k] || 0) + rate * dt; let n = 0; while (cur.acc[k] >= 1 && n < 8) { cur.acc[k] -= 1; n++; } if (cur.acc[k] > 8) cur.acc[k] = 0; return n; };
    const hc = (hex, k = 1) => { const q = Pp.rgbOf(hex); return [q[0] * k, q[1] * k, q[2] * k]; };
    const main = state.ships[0], model = main && models.get(main.id) && models.get(main.id).model;
    const L = main && main.layout;
    // ============ rain: bounces on the outdoor decks, rings on the sea ============
    if (cur.mode === 'rain' && cur.dens > 0.05 && model && L) {
      const R = cfg('RAIN'), open = L.outdoorDecks();
      for (let i = acc('splash', R.SPLASH * cur.dens); i > 0 && open.length; i--) {
        const q = L.platforms[open[(rnd() * open.length) | 0]], x = rr(q.x0 + 20, q.x1 - 20), p = ship.shipPoint(x, q.y, rr(-60, 60));
        if (p) Pp.burst('drop', p.x, p.y + 2, p.z, 1, { dir: Math.PI / 2, spread: 0.7, speed: [30, 110], up: [70, 170], ay: -820, size: [4, 7], life: [0.22, 0.4], alpha: 0.75, color: '#dbe8f7', noRate: true });
      }
      if (env === 'sea' && c.sea != null && fin(c.sea)) for (let i = acc('rings', R.SEA * cur.dens); i > 0; i--) world.splashAt(cx + rr(-vis.visW / 2, vis.visW / 2), 0, rr(26, 60), rr(-500, 220));
    }
    // ============ the gust streaks (Storm Front): pale lines racing across ============
    const gale = S.gale;
    if (gale > 0.02 && (env === 'storm' || w.gusting)) {
      const G = cfg('GALE'), dir = (E.windDir || (w.gust > 0 ? -1 : 1)) >= 0 ? 1 : -1, left = cx - vis.visW / 2, top = cy + vis.visH / 2, a = Math.ceil(clamp(gale, 0, 1) * 3) / 3 * G.ALPHA, col = hc(G.COLOR);
      const n = Math.round(G.COUNT * Math.min(1, gale * 1.4));
      for (let i = 0; i < n; i++) {
        const sp = G.SPEED[0] + hashN(i, 1) * (G.SPEED[1] - G.SPEED[0]), span = vis.visW + 1600;
        const x = left + wrap1(hashN(i, 2) * span + dir * t * sp - left, span) - 800, y = top - hashN(i, 3) * vis.visH, len = G.LEN[0] + hashN(i, 4) * (G.LEN[1] - G.LEN[0]);
        Pp.sprite('spark', x - dir * len * 0.5, y, -120 + hashN(i, 5) * 520, 3.2 * c.cam.visH / 1500 + 1.4, col[0], col[1], col[2], a, { dx: dir, dy: -0.03, len });
      }
    }
    // ============ the lightning: the charge over the ship, and a rod catching a bolt ============
    const J = state.stormJob;
    if (env === 'storm' && J && J.charge && model) {
      const ch = J.charge, held = !!ch.held, R = cfg('ROD'), p = ship.shipPoint(ch.x, -330, 20);
      if (p) {
        const col = hc(held ? R.HELD : R.CHARGE, 2.2), f = clamp(ch.t / Math.max(0.1, ch.max), 0, 1), fq = Math.ceil(f * 8) / 8, pulse = K8 & 1 ? 1 : 0.8;
        Pp.sprite('flash', p.x, p.y, p.z, 110 * pulse, col[0] * 0.7, col[1] * 0.7, col[2] * 0.7, 0.8);
        Pp.sprite('ring', p.x, p.y, p.z, 2 * (40 + 90 * fq), col[0], col[1], col[2], 0.95);
        for (let i = 0; i < 5; i++) { // the crackle: five short streaks at angles that change in steps
          const a = hashN(i + K8 * 7, 701) * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
          Pp.sprite('spark', p.x + dx * 62, p.y + dy * 62, p.z + 6, 5, col[0], col[1], col[2], 0.95, { dx, dy, len: 60 });
        }
      }
    }
    const b = w.bolt;
    if (b !== cur.lastBolt) {
      cur.lastBolt = b;
      if (b && fin(b.x) && fin(b.y)) {
        S.bolts++;
        const tip = ship.tipNear(b.x);
        if (tip && Math.abs(tip.x - b.x) < 340) { // the rod takes it: a burst of sparks, a flash and a ring at its tip (cyan when somebody holds it)
          const R = cfg('ROD'), zap = tip.held ? R.ZAP : '#ffe9a8';
          Pp.burst('spark', tip.x, tip.y, tip.z + 20, 26, { speed: [220, 680], life: [0.3, 0.8], color: zap, noRate: true, force: true });
          Pp.flash(tip.x, tip.y, tip.z + 30, 420, zap, { hdr: 3.2, force: true });
          Pp.ring(tip.x, tip.y, tip.z + 30, 300, zap, 0.4, { force: true });
        }
      }
    }
    // ============ the Ember Forge: smoke banks and plumes, vents ============
    if (env === 'ember' && c.map && fin(E.lavaY)) {
      const LV = cfg('LAVA'), map = c.map, C = map.CELL, lavaTop = -E.lavaY, EL = (config.ENVIRONMENTS.ember || {}).LAVA || {};
      if ((E.smoke || 0) > 0.01) for (let i = acc('bank', LV.SMOKE * E.smoke); i > 0; i--) {
        const dir = rnd() < 0.5 ? -1 : 1;
        Pp.spawn('smoke', cx - dir * (vis.visW / 2 + 300), cy + rr(-0.45, 0.45) * vis.visH, rr(-300, 100), { size: [260, 420], size1: 1.5, life: [6, 9], vx: dir * rr(60, 110), speed: [0, 0], up: 0, drag: 0, alpha: 0.2 * E.smoke + 0.06, color: '#2a1614', warm: 0, force: true });
      }
      const step = EL.PLUME_EVERY || 900, j = Math.min(map.H - 1, Math.floor(E.lavaY / C) + 1);
      for (let p = Math.floor((cx - vis.visW / 2) / step) - 1; p <= Math.ceil((cx + vis.visW / 2) / step) + 1; p++) {
        if (hashN(p, 210) > 0.7) continue;
        const mx = p * step + hashN(p, 211) * step * 0.6, i = Math.floor(mx / C);
        if (i < 0 || i >= map.W || map.solid[j * map.W + i]) continue; // only where the lava is open to the air
        let a = cur.plume.get(p) || 0;
        a += dt * LV.PLUME * 4;
        while (a >= 1) { a -= 1; Pp.spawn('smoke', mx + rr(-30, 30), lavaTop + 30, rr(-200, -40), { size: [70, 110], size1: 3.2, life: [3.2, 4.6], up: [70, 110], speed: [0, 14], drag: 0.4, alpha: 0.32, color: '#2a1a1a', warm: 0.5, force: true }); }
        cur.plume.set(p, a);
      }
      if (cur.plume.size > 80) cur.plume.clear();
      for (let i = acc('vent', LV.VENT); i > 0; i--) { // a vent spits sparks up from the surface now and then
        const x = cx + rr(-0.5, 0.5) * vis.visW, k = Math.floor(x / C);
        if (k < 0 || k >= map.W || map.solid[j * map.W + k]) continue;
        Pp.burst('spark', x, lavaTop + 14, rr(-60, 80), 7, { dir: Math.PI / 2, spread: 0.45, speed: [240, 620], life: [0.8, 1.6], ay: -520, color: '#ffa43a', size: [5, 8], noRate: true, force: true });
      }
    }
    // ============ the Fungal Depths: clogged engines puff green spores ============
    if (env === 'fungal' && model && L) {
      let worst = 0;
      for (const cg of state.clogs || []) {
        worst = Math.max(worst, cg.lvl || 0);
        if ((cg.lvl || 0) < 0.3 || !L.platforms[cg.d]) continue;
        for (let i = acc('clog' + cg.name, 3.4 * cg.lvl); i > 0; i--) {
          const p = ship.shipPoint(cg.x + rr(-20, 20), L.platforms[cg.d].y + 6, rr(10, 60));
          if (p) Pp.spawn('smoke', p.x, p.y, p.z, { size: [26, 46], size1: 2.4, life: [0.9, 1.5], up: [30, 80], speed: [10, 50], drag: 0.8, alpha: 0.5, color: '#a6d65a', warm: 0 });
        }
      }
      S.clogs = worst;
    }
    // ============ the Sunken Sea: spray at the keel, the rope to a survivor ============
    if (env === 'sea' && state.sea && c.sea != null && fin(c.sea) && model && L) {
      const SS = state.sea, seaTop = -c.sea;
      if ((SS.spray || 0) > 0.05) for (let i = acc('spray', 30 * SS.spray); i > 0; i--) {
        const p = ship.shipPoint(460 + rnd() * 700, 900, rr(-30, 60));
        if (p) Pp.burst('drop', p.x, seaTop + 8, p.z + 20, 1, { dir: Math.PI / 2, spread: 0.55, speed: [120, 340], up: [100, 260], ay: -900, size: [8, 14], life: [0.5, 0.9], noRate: true });
      }
      if ((SS.spray || 0) > 0.3) for (let i = acc('keelring', 3 * SS.spray); i > 0; i--) { const p = ship.shipPoint(460 + rnd() * 700, 900, 40); if (p) world.splashAt(p.x, 0, rr(50, 90), 40); }
      const sv = SS.hook, door = L.bombBay;
      if (sv && door && !sv.saved) { // the rope from the bomb bay down to the survivor: dashes along a sagging curve
        const a = ship.shipPoint(door.x, door.y + 4, 0);
        if (a) {
          const bx = sv.mx, by = seaTop + 70, mx = (a.x + bx) / 2, my = Math.min(a.y, by) - 70, col = hc('#e6d6a8', 1.1), N = 14;
          for (let i = 0; i < N; i++) {
            const u0 = i / N, u1 = (i + 0.55) / N, q = (u) => [(1 - u) * (1 - u) * a.x + 2 * u * (1 - u) * mx + u * u * bx, (1 - u) * (1 - u) * a.y + 2 * u * (1 - u) * my + u * u * by];
            const p0 = q(u0), p1 = q(u1), dx = p1[0] - p0[0], dy = p1[1] - p0[1], l = Math.hypot(dx, dy) || 1;
            Pp.sprite('spark', (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, 70, 4.5, col[0], col[1], col[2], 0.95, { dx: dx / l, dy: dy / l, len: l });
          }
        }
      }
    }
  };
  if (vfx) vfx.hook = (t, dt) => W.emit(t, dt);
  W.dispose = () => {
    if (vfx && vfx.hook) vfx.hook = null;
    for (const p of [fall, ship, lava, sea]) { try { p.dispose(); } catch { /* (gone) */ } }
    try { world.sky.setExtra(null); } catch { /* (gone) */ }
  };
  return W;
}
