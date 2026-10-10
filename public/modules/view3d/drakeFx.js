// THE CINDER DRAKE'S FIRE (3D.md section 22): everything that burns, glows or splashes round the dragon, apart from its own body.
//   createFireVolumes(parent, P)  ONE additive mesh that draws several FIRE VOLUMES: each is four nested cones (red, orange, yellow, a white-hot core) of lumpy tongues whose shape is one of four fixed
//                                 frames swapped at 8 a second (no noise, no sine of time), faded along their length. The breath is one volume, each erupting lava spout another.
//   createDrakeFx(opts)           the per-frame events: the BREATH (the cone from cr.flame, cut short where it meets a hull as the simulation's own breathBurn does; layered fire sprites, sparks and embers
//                                 streaming down it; a warm point light on the ship that grows with the flame, capped by the quality tier; scorch marks on the hull and a burst where it bites), the throat's
//                                 wind-up (embers, a glow), the LAVA SPOUTS (a bubbling patch, then a column of fire; a tow into one is a big fire burst), the CRASH (a burst of dust and embers where it lands, one where
//                                 a wing tears off, a trail of fire behind the falling wing), the PERCH (dust when it lands), and the DEATH (a huge ember splash where it falls into the lava, embers while it sinks).
// All of it is read-only on the simulation (cr.flame, cr.drake, cr.chunks...) and goes through WP4's particles (`view.vfx.P`, y up) and the damage view's marks. Colours and sizes: config.CREATURE3D.DRAKE.
import { THREE } from './style.js';
import { config } from '../../config.js';
import { rngOf } from './creatureKit.js';
import { toShipX, toShipY } from '../host/pose.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fin = Number.isFinite;

// ---- the fire volumes -------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export function createFireVolumes(parent, FL, { max = 4, sides = 9, rings = 8 } = {}) {
  const LAY = 4, per = LAY * (rings + 1) * sides, total = per * max, FR = 4;
  const pos = new Float32Array(total * 3), col = new Float32Array(total * 4);
  const idx = [];
  for (let v = 0; v < max; v++) for (let l = 0; l < LAY; l++) for (let r = 0; r < rings; r++) for (let s = 0; s < sides; s++) {
    const a = v * per + (l * (rings + 1) + r) * sides + s, b = v * per + (l * (rings + 1) + r) * sides + ((s + 1) % sides), c = a + sides, d = b + sides;
    idx.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setIndex(idx);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  mat.toneMapped = false;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 22;
  mesh.visible = false;
  parent.add(mesh);
  // the four fixed frames of tongue lumps: [frame][layer][ring][side], coherent along the cone (a lump persists a few rings) and between neighbours
  const R = rngOf(77), jit = [];
  for (let f = 0; f < FR; f++) {
    const fl = [];
    for (let l = 0; l < LAY; l++) {
      const rr = [];
      let prev = new Array(sides).fill(1);
      for (let r = 0; r <= rings; r++) { const cur = prev.map((p, s) => clamp(0.62 + (p - 0.62) * 0.35 + R() * 0.55 + (r % 2 ? 0.08 : -0.04) * (s % 2 ? 1 : -1), 0.55, 1.18)); rr.push(cur); prev = cur; }
      fl.push(rr);
    }
    jit.push(fl);
  }
  const hex = (h, k) => { const c = new THREE.Color(h); return [c.r * k, c.g * k, c.b * k]; };
  const COLS = [hex(FL.outer, FL.hdr[0]), hex(FL.mid, FL.hdr[1]), hex(FL.inner, FL.hdr[2]), hex(FL.core, FL.hdr[3])];
  const LK = [1, 0.74, 0.5, 0.26], LL = [1, 0.9, 0.72, 0.52]; // (each inner layer is thinner and shorter)
  let n = 0;
  const api = {
    mesh,
    begin() { n = 0; },
    // o = { x, y, z, ang (the 3D direction, radians, y up), len, r0, r1 (the radius at the far end), zk (depth squash), frame, power (0..1) }
    add(o) {
      if (n >= max || !fin(o.x) || !fin(o.y) || !(o.len > 1)) return false;
      const f = ((o.frame | 0) % FR + FR) % FR, flicker = f;
      const dx = Math.cos(o.ang), dy = Math.sin(o.ang), px = -dy, py = dx;
      const pw = clamp(o.power == null ? 1 : o.power, 0, 1.2), base = n * per;
      for (let l = 0; l < LAY; l++) {
        const L = o.len * LL[l] * (0.55 + 0.45 * pw), [cr, cg, cb] = COLS[l];
        for (let r = 0; r <= rings; r++) {
          const t = r / rings, s = L * Math.pow(t, 1.12);
          const rad = (o.r0 + (o.r1 - o.r0) * Math.pow(t, 0.85)) * LK[l] * (r === rings ? 0.18 : 1) * (0.7 + 0.3 * pw);
          const fade = (t < 0.08 ? 0.35 + 0.65 * (t / 0.08) : 1) * Math.pow(1 - t, 0.85);
          const a = FL.alpha[l] * fade * clamp(pw, 0, 1);
          for (let sd = 0; sd < sides; sd++) {
            const phi = (sd / sides) * Math.PI * 2, j = jit[flicker][l][r][sd] * (r === 0 ? 0.4 : 1), cs = Math.cos(phi) * rad * j, sn = Math.sin(phi) * rad * j * (o.zk == null ? 0.5 : o.zk);
            const i = base + (l * (rings + 1) + r) * sides + sd;
            pos[i * 3] = o.x + dx * s + px * cs; pos[i * 3 + 1] = o.y + dy * s + py * cs; pos[i * 3 + 2] = o.z + sn;
            col[i * 4] = cr; col[i * 4 + 1] = cg; col[i * 4 + 2] = cb; col[i * 4 + 3] = a;
          }
        }
      }
      n++;
      return true;
    },
    end() {
      for (let v = n; v < max; v++) { pos.fill(0, v * per * 3, (v + 1) * per * 3); col.fill(0, v * per * 4, (v + 1) * per * 4); }
      geo.getAttribute('position').needsUpdate = true;
      geo.getAttribute('color').needsUpdate = true;
      mesh.visible = n > 0;
    },
    dispose() { mesh.removeFromParent(); geo.dispose(); mat.dispose(); },
  };
  return api;
}

// ---- the events --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export function createDrakeFx({ parent, P, getP, getDamage }) {
  const FL = P.FLAME, LT = P.LIGHT || {};
  const vol = createFireVolumes(parent, FL);
  const light = new THREE.PointLight(LT.color || '#ff9a3a', 0, LT.range || 3400, 0);
  light.visible = true;
  parent.add(light);
  const S = { prev: null, lastMode: '', sawChunks: new Set(), acc: {}, hullT: 0, marks: 0, markT: 0, deathDone: false, lavaDone: false, landed: false, perchLanded: false, roastT: 0, lastRoast: 0, rng: rngOf(913), spoutWas: [], glowT: 0, nostrilT: 0, cone: null, lastFlame: false, stepKey: -1 };
  const rnd = S.rng;
  const acc = (key, per, dt) => { const v = (S.acc[key] || 0) + per * dt; const k = Math.floor(v); S.acc[key] = v - k; return k; };
  const CR = () => config.CREATURES.DRAKE;

  // where the breath meets a hull: the cone's length cut at the first hull the simulation would burn (the same march as creatureBreath.js breathBurn), plus the penetration
  function clipFlame(state, fl) {
    const B = CR().BREATH, ship = state.ships && state.ships[0];
    if (!ship || !ship.sim || !ship.sim.hitsShip || !ship.layout) return { len: fl.len, hit: null };
    const dx = Math.cos(fl.ang), dy = Math.sin(fl.ang), step = 36, n = Math.ceil(fl.len / step);
    for (let k = 1; k <= n; k++) {
      const r = k * step, x = fl.x + dx * r, y = fl.y + dy * r;
      let hit = false;
      try { hit = ship.sim.hitsShip(toShipX(ship, x), toShipY(ship, y)); } catch { hit = false; }
      if (hit) return { len: Math.min(fl.len, r + B.PENETRATE), hit: { x, y, sx: toShipX(ship, x), sy: toShipY(ship, y), ship } };
    }
    return { len: fl.len, hit: null };
  }

  const API = {
    vol, light, S,
    // f = { cr, state, dt, t, zMouth (the depth of the mouth), zBody, mouth3 {x, y} (the mouth's 3D place), tier, night, lavaY (game y or null), chunks (view's chunk records), tierK }
    update(f) {
      const { cr, state, dt, t } = f, dk = cr.drake, Pt = getP(), tierK = f.tierK == null ? 1 : f.tierK;
      const key = Math.floor(t * 8), frame = key & 3;
      vol.begin();
      let lightI = 0, lx = 0, ly = 0, lz = 300;
      const m = f.mouth3;
      // ---- the throat winds up: embers and a swelling glow ----
      const glow = dk.glow || 0;
      if (glow > 0.05 && !cr.flame && m && Pt) {
        const k = acc('ember', 14 * glow, dt);
        if (k) Pt.burst('ember', m.x, m.y, f.zMouth + 30, k, { dir: Math.PI / 2, spread: 1.1, speed: [30, 200], up: [20, 110], size: [10, 18], life: [0.6, 1.1], area: 60 });
        if (key !== S.glowT) { S.glowT = key; Pt.flash(m.x, m.y, f.zMouth + 60, 120 + 340 * glow, '#ffb04a', { hdr: 1.2, alpha: 0.28 + 0.4 * glow, life: 0.13 }); }
        lightI = Math.max(lightI, 0.35 * glow);
        lx = m.x; ly = m.y;
      }
      // ---- the breath ----
      const fl = cr.flame;
      if (fl && fin(fl.x) && fin(fl.y)) {
        const clip = clipFlame(state, fl), L = clip.len, ang = -fl.ang, half = fl.half, ramp = clamp(fl.t / 0.28, 0.25, 1);
        vol.add({ x: fl.x, y: -fl.y, z: f.zMouth, ang, len: L, r0: 60, r1: Math.max(110, Math.tan(half) * L * 1.45), zk: 0.5, frame, power: ramp });
        const dx = Math.cos(ang), dy = Math.sin(ang);
        if (Pt) { // fire streaming down the cone: tongues, embers, a little smoke; the number follows the tier's rate (the burst multiplies it)
          const rate = Pt.rate || 1, nf = acc('fire', 150 * ramp * rate, dt);
          for (let i = 0; i < nf; i++) {
            const s = L * (0.02 + 0.9 * Math.pow(rnd(), 1.3)), lat = (rnd() * 2 - 1) * Math.tan(half) * s * 0.72;
            Pt.spawn('fire', fl.x + dx * s - dy * lat, -fl.y + dy * s + dx * lat, f.zMouth + (rnd() - 0.5) * 140, { dir: ang, spread: 0.05, speed: [1100, 1800], up: 0, size: [150 + s * 0.05, 260 + s * 0.09], size1: 1.5, life: [0.28, 0.5], hdr: 1.6, vx: 0, vy: 0 });
          }
          const ne = acc('spark', 40 * ramp, dt);
          if (ne) Pt.burst('ember', fl.x + dx * L * 0.3, -fl.y + dy * L * 0.3, f.zMouth, ne, { dir: ang, spread: 0.2, speed: [500, 1500], up: [0, 60], size: [9, 15], life: [0.5, 1.0], area: L * 0.18, noRate: true });
          const ns = acc('smoke', 26 * ramp * (Pt.rate || 1), dt);
          if (ns) Pt.burst('smoke', fl.x + dx * L * 0.8, -fl.y + dy * L * 0.8, f.zMouth - 40, ns, { dir: ang, spread: 0.3, speed: [100, 300], up: [50, 140], size: [160, 260], size1: 2.4, life: [1.2, 2.0], color: '#3a3030', alpha: 0.55, warm: 0.6, area: L * 0.12 });
        }
        // the hull it bites: sparks and fire at the contact, scorch marks on the hull (a few a breath)
        if (clip.hit) {
          const h = clip.hit, ex = h.x, ey = -h.y;
          if (Pt) {
            const nb = acc('bite', 22 * ramp, dt);
            if (nb) Pt.burst('fire', ex, ey, f.zMouth + 80, nb, { dir: ang + Math.PI, spread: 1.0, speed: [200, 700], up: 0, size: [90, 170], life: [0.25, 0.45], hdr: 1.6 });
            const nk = acc('biteSpark', 18, dt);
            if (nk) Pt.burst('spark', ex, ey, f.zMouth + 80, nk, { dir: ang + Math.PI, spread: 1.2, speed: [300, 900], size: [5, 8], life: [0.3, 0.7] });
            if (key !== S.stepKey && (key & 3) === 0) Pt.flash(ex, ey, f.zMouth + 100, 360, '#ffb860', { hdr: 1.3, alpha: 0.55, life: 0.1 });
          }
          const dmg = getDamage();
          if (dmg && dmg.mark && (S.markT -= dt) <= 0 && S.marks < 7) { S.markT = 0.34; S.marks++; dmg.mark(h.ship, h.sx, h.sy, 1.4, 'scorch'); }
          lx = ex; ly = ey; lz = 360;
        } else { lx = fl.x + dx * L * 0.55; ly = -fl.y + dy * L * 0.55; lz = 300; }
        lightI = Math.max(lightI, 1);
        S.lastFlame = true;
      } else if (S.lastFlame) { S.lastFlame = false; S.marks = 0; S.markT = 0; }
      light.intensity = (LT.intensity == null ? 2.2 : LT.intensity) * tierK * lightI;
      if (lightI > 0) light.position.set(lx, ly, lz);
      // ---- the lava spouts ----
      const H = CR().SPOUT.H, W = CR().SPOUT.W;
      (dk.spouts || []).forEach((sp, i) => {
        if (sp.st === 'erupt') {
          const rise = clamp(sp.t / 0.5, 0.35, 1);
          vol.add({ x: sp.x, y: -sp.y + 10, z: -30, ang: Math.PI / 2, len: H * rise * (0.92 + 0.08 * ((key + i) % 2)), r0: W * 0.46, r1: W * 0.16, zk: 0.7, frame: frame + i, power: 1 });
          if (Pt) {
            const nf = acc('sp' + i, 70 * (Pt.rate || 1), dt);
            for (let q = 0; q < nf; q++) Pt.spawn('fire', sp.x + (rnd() - 0.5) * W * 0.7, -sp.y + 20, -30 + (rnd() - 0.5) * 160, { dir: Math.PI / 2, spread: 0.12, speed: [700, 1500], up: 0, size: [200, 340], size1: 1.4, life: [0.5, 0.9], hdr: 1.6 });
            const ne = acc('spe' + i, 30, dt);
            if (ne) Pt.burst('ember', sp.x, -sp.y + 100, -30, ne, { dir: Math.PI / 2, spread: 0.5, speed: [200, 900], up: [100, 400], size: [9, 15], life: [0.9, 1.8], area: W * 0.3, noRate: true });
          }
          if (S.spoutWas[i] !== 'erupt' && Pt) { Pt.explosion(sp.x, -sp.y + 40, -30, 1.8, { smoke: '#3a2a26' }); }
        } else if (sp.st === 'warn' && Pt) { // it bubbles: blobs of fire at the vent and a ring now and then
          const nb = acc('spw' + i, 5, dt);
          if (nb) Pt.burst('ball', sp.x + (rnd() - 0.5) * W * 0.6, -sp.y + 14, -30, nb, { size: [60, 120], size1: 1.6, life: [0.3, 0.5], speed: [0, 30], up: [60, 160] });
          if (key !== S.stepKey && (key & 3) === 0) Pt.ring(sp.x, -sp.y + 12, -20, 420, '#ffa43a', 0.4);
        }
        S.spoutWas[i] = sp.st;
      });
      // ---- the tow into a spout: a big fire burst while it roasts ----
      const roast = cr.stats && fin(cr.stats.spouts) ? cr.stats.spouts : 0;
      if (roast > S.lastRoast + 1e-6 && Pt) {
        const first = S.roastT <= 0;
        S.roastT = 0.25;
        if (first) { Pt.explosion(cr.x, -cr.y - 100, f.zBody, 3.2, { smoke: '#3a2a26' }); }
        const nf = acc('roast', 60, dt);
        if (nf) Pt.burst('fire', cr.x, -cr.y, f.zBody + 40, nf, { dir: Math.PI / 2, spread: 0.7, speed: [400, 1300], up: 0, size: [200, 380], life: [0.4, 0.8], hdr: 1.7, area: 420 });
        const ne = acc('roaste', 40, dt);
        if (ne) Pt.burst('ember', cr.x, -cr.y, f.zBody + 40, ne, { dir: Math.PI / 2, spread: 0.9, speed: [200, 900], up: [100, 400], size: [10, 18], life: [0.9, 1.8], area: 520, noRate: true });
      } else if (S.roastT > 0) S.roastT -= dt;
      S.lastRoast = roast;
      // ---- modes: landing, perching, the wing coming off, the fall ----
      const mode = dk.mode;
      if (Pt && S.lastMode && mode !== S.lastMode) {
        if (mode === 'crawl' && S.lastMode === 'crash') { // it lands: dust, embers, a ring
          const gy = -(cr.y + 340);
          Pt.explosion(cr.x, gy + 80, f.zBody, 3.0, { smoke: '#5a4a44' });
          Pt.burst('dust', cr.x, gy + 40, f.zBody + 60, 26, { dir: Math.PI / 2, spread: 1.4, speed: [200, 900], up: [60, 260], size: [120, 240], size1: 2.4, life: [1.2, 2.2], color: '#8a7466', alpha: 0.7, area: 700 });
          Pt.burst('ember', cr.x, gy + 60, f.zBody + 60, 40, { dir: Math.PI / 2, spread: 1.3, speed: [300, 1100], up: [100, 500], size: [10, 18], life: [1.0, 2.0], area: 600, noRate: true });
          Pt.ring(cr.x, gy + 40, f.zBody + 100, 1400, '#ffb060', 0.5);
        }
        if (mode === 'crash') Pt.burst('smoke', cr.x, -cr.y, f.zBody, 8, { size: [140, 240], size1: 2.4, life: [1.4, 2.4], color: '#4a3c38', alpha: 0.6, area: 500 });
      }
      S.lastMode = mode;
      const pc = dk.perch;
      if (Pt && pc && pc.landed && !S.perchLanded) { // the thud: a ring of dust under its feet
        Pt.burst('dust', pc.wx, -pc.wy, f.zBody + 80, 18, { dir: Math.PI / 2, spread: 1.5, speed: [150, 600], up: [30, 160], size: [90, 190], size1: 2.4, life: [1.0, 1.8], color: '#d9cbb0', alpha: 0.6, area: 380 });
        Pt.ring(pc.wx, -pc.wy, f.zBody + 100, 900, '#ffe9a0', 0.4);
      }
      S.perchLanded = !!(pc && pc.landed);
      // a wing torn off (each new chunk): a burst at the tear, a trail of fire behind the falling piece
      for (const c of cr.chunks || []) {
        if (!S.sawChunks.has(c)) {
          S.sawChunks.add(c);
          if (Pt) { Pt.explosion(c.cx, -c.cy, f.zBody + 100, 1.6, { smoke: '#3a2a26' }); Pt.burst('spark', c.cx, -c.cy, f.zBody + 100, 36, { speed: [300, 1100], size: [6, 10], life: [0.5, 1.2] }); }
        }
      }
      if (Pt) for (const e of f.chunks || []) { // (the fall of a torn wing: fire and smoke from the body Rapier is tumbling)
        if (!e.holder || e.none || !e.holder.parent) continue;
        const p = e.holder.position, ca = acc('ct', 22, dt);
        if (ca) { Pt.burst('fire', p.x, p.y, p.z + 60, Math.min(3, ca), { speed: [20, 140], up: [40, 160], size: [100, 190], life: [0.35, 0.6], area: 260, hdr: 1.5 }); Pt.burst('smoke', p.x, p.y, p.z, 1, { size: [120, 200], size1: 2.4, life: [1.2, 2.0], color: '#3a3030', alpha: 0.55, warm: 0.5, area: 240 }); }
      }
      // ---- the death: a flourish of fire at the first frame, embers while it sinks, and the big splash where it meets the lava ----
      if (cr.mode === 'dying' && Pt) {
        if (!S.deathDone) { S.deathDone = true; Pt.explosion(cr.x, -cr.y, f.zBody + 60, 3.6, { smoke: '#3a2a26' }); Pt.explosion(cr.x - 500, -cr.y + 200, f.zBody + 60, 2.4, { smoke: '#3a2a26' }); }
        const slow = clamp(state.slow || 1, 0.25, 1);
        const ne = acc('dm', 24 * slow, dt);
        if (ne) Pt.burst('ember', cr.x, -cr.y, f.zBody + 40, ne, { dir: Math.PI / 2, spread: 1.2, speed: [100 * slow, 600 * slow], up: [60, 260], size: [10, 18], life: [1.0 / slow, 1.8 / slow], area: 700, noRate: true });
        if (f.lavaY != null && fin(f.lavaY)) {
          const into = cr.y + 300 - f.lavaY; // how far the torso's belly is under the lava line
          if (!S.lavaDone && into > 0) { // the huge ember splash
            S.lavaDone = true;
            const ly0 = -f.lavaY, x = cr.x;
            Pt.explosion(x, ly0 + 100, f.zBody + 100, 5, { smoke: '#4a3430' });
            Pt.explosion(x - 700, ly0 + 40, f.zBody + 60, 3.2, { smoke: '#4a3430' });
            Pt.explosion(x + 700, ly0 + 40, f.zBody + 60, 3.2, { smoke: '#4a3430' });
            Pt.burst('fire', x, ly0 + 40, f.zBody + 80, 70, { dir: Math.PI / 2, spread: 0.9, speed: [500, 1900], up: 0, size: [220, 460], life: [0.7, 1.4], hdr: 1.7, area: 900, force: true });
            Pt.burst('ember', x, ly0 + 60, f.zBody + 80, 160, { dir: Math.PI / 2, spread: 1.0, speed: [400, 2000], up: [100, 700], size: [10, 20], life: [1.5, 3.2], area: 900, noRate: true, force: true });
            Pt.burst('ball', x, ly0 + 60, f.zBody + 90, 14, { size: [200, 380], size1: 1.9, life: [0.5, 0.9], speed: [100, 600], up: [100, 500], area: 800 });
            Pt.ring(x, ly0 + 30, f.zBody + 100, 2800, '#ffb060', 0.8); Pt.ring(x, ly0 + 30, f.zBody + 100, 1700, '#ffe08a', 0.6);
          }
          if (S.lavaDone && into > 0 && (S.sinkT = (S.sinkT || 0) - dt) <= 0) { S.sinkT = 0.12 / slow; Pt.burst('ember', cr.x + (rnd() - 0.5) * 1200, -f.lavaY + 60, f.zBody + 60, 5, { dir: Math.PI / 2, spread: 0.6, speed: [200, 800], up: [100, 500], size: [10, 16], life: [1.0 / slow, 2.0 / slow], noRate: true }); }
        }
      }
      // ---- crawling: it smoulders (embers off its back) and the stump of the torn wing drags a trail of dust and sparks along the shelf ----
      if (Pt && dk.mode === 'crawl' && !cr.dying) {
        const ne = acc('crawlE', 7 * (Pt.rate || 1), dt);
        if (ne) Pt.burst('ember', cr.x, -cr.y + 260, f.zBody + 60, ne, { dir: Math.PI / 2, spread: 0.9, speed: [20, 160], up: [60, 200], size: [9, 15], life: [0.9, 1.7], area: 700, noRate: true });
        if (f.drag && Math.abs(cr.mvx || 0) > 30) {
          const nd = acc('drag', 14 * (Pt.rate || 1), dt);
          if (nd) { Pt.burst('dust', f.drag.x, f.drag.y + 30, f.zBody + 80, nd, { dir: Math.PI / 2, spread: 1.2, speed: [30, 160], up: [20, 90], size: [70, 130], size1: 2.2, life: [0.8, 1.4], color: '#8a7466', alpha: 0.6, area: 120 }); Pt.burst('spark', f.drag.x, f.drag.y + 20, f.zBody + 80, 1, { speed: [100, 420], size: [5, 8], life: [0.3, 0.6] }); }
        }
      }
      // ---- the nostrils: a thin curl of ember smoke now and then while it flies ----
      if (Pt && m && cr.mode !== 'dying' && !cr.flame && (S.nostrilT -= dt) <= 0) { S.nostrilT = 0.6; Pt.burst('smoke', m.x, m.y + 30, f.zMouth, 1, { size: [40, 70], size1: 2.6, life: [0.9, 1.5], color: '#3a3030', alpha: 0.5, speed: [10, 40], up: [30, 70], warm: 0.5 }); }
      S.stepKey = key;
      vol.end();
    },
    reset() { S.sawChunks.clear(); S.deathDone = S.lavaDone = false; S.landed = false; S.lastMode = ''; S.lastRoast = 0; S.marks = 0; vol.begin(); vol.end(); light.intensity = 0; },
    dispose() { vol.dispose(); light.removeFromParent(); },
  };
  return API;
}
