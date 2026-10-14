// THE THUNDERBIRD'S STORM (3D.md section 26): everything that crackles, scatters or falls round the bird, apart from its own body.
//   ARCS      ONE additive mesh of lightning ribbons (a wide storm-blue glow and a thin white core): the crackle along the wings' feather tips and between the crest and the wings, the tether from its beak to the
//             rod it has called a bolt for, the rays round the glowing gizzard, the sputter as it dies. Every arc is a jagged line whose bends are picked by a seeded hash of the 8 a second KEY, so it flickers in
//             stepped frames (never a sine, never noise in time); its ends follow the feathers every frame.
//   FEATHERS  ONE instanced mesh of loose feathers: they scatter from a hit, a plucked wing, a take-off and the death, and drift down in stepped zigzags (a new drift every key, no sine).
//   EVENTS    the gust's streaks, the pass's trail, the swallowed bolt's flash, the landing's dust, the plucked wing's tear and trail, the slain bird's fall (feathers, sparks, smoke and a cloud at the end).
// All of it is read-only on the simulation (cr.bird, cr.gust, cr.chunks, state.weather, state.stormJob) and goes through WP4's particles (`view.vfx.P`, y up). Colours and sizes: config.CREATURE3D.THUNDERBIRD.
import { THREE, rimify, gradientMap, fx as lookFx } from './style.js';
import { featherGeometry } from './birdWings.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fin = Number.isFinite;
const hash = (a, b, c = 0) => { let h = Math.imul((a | 0) * 73856093 ^ (b | 0) * 19349663 ^ (c | 0) * 83492791, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const SEG = 7; // segments of an arc
const PER_ARC = 2 * (SEG + 1) * 2; // vertices of an arc: two ribbons (glow, core) of SEG + 1 points, two vertices each

export function createBirdFx({ parent, P, low, getP }) {
  const A = P.ARC, maxArcs = low ? 28 : 46;
  const hdr = (hex, k) => { const c = new THREE.Color(hex); return [c.r * k, c.g * k, c.b * k]; };
  // ---- the arcs ----
  const pos = new Float32Array(maxArcs * PER_ARC * 3), col = new Float32Array(maxArcs * PER_ARC * 4), idx = [];
  for (let a = 0; a < maxArcs; a++) for (let r = 0; r < 2; r++) for (let s = 0; s < SEG; s++) {
    const o = a * PER_ARC + r * (SEG + 1) * 2 + s * 2;
    idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
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
  let nArc = 0, nightK = 1, wk = 1; // (wk: arcs and feathers grow with the camera's distance, so they read at TV zoom: the same factor as the ink)
  const CG = hdr(A.COLOR, A.HDR), CC = hdr(A.CORE, A.HDR * 0.9);
  // one arc from a to b (3D points), `amp` the biggest bend (world units), `w` its width, `seed` picks the bends, `power` 0..1 its strength
  function arc(ax, ay, az, bx, by, bz, amp, w, seed, power = 1) {
    if (nArc >= maxArcs || !fin(ax + ay + az + bx + by + bz)) return false;
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    if (!(len > 8)) return false;
    const px = -dy / len, py = dx / len, base = nArc * PER_ARC;
    const pw = clamp(power, 0, 1.2);
    for (let r = 0; r < 2; r++) {
      const ww = (r === 0 ? w : w * (A.CORE_WIDTH / A.WIDTH)) * wk, c = r === 0 ? CG : CC, al = r === 0 ? 0.62 * pw : pw;
      for (let s = 0; s <= SEG; s++) {
        const u = s / SEG, env = 4 * u * (1 - u), j = (hash(seed, s, r ? 0 : 0) * 2 - 1) * amp * env + (hash(seed, s, 9) - 0.5) * 0.15 * amp * env;
        const x = ax + dx * u + px * j, y = ay + dy * u + py * j, z = az + (bz - az) * u, k = base + r * (SEG + 1) * 2 + s * 2;
        const tw = ww * (0.35 + 0.65 * Math.min(1, env * 2.2)) * 0.5;
        for (let side = 0; side < 2; side++) {
          const i = k + side, sg = side ? -1 : 1;
          pos[i * 3] = x + px * tw * sg; pos[i * 3 + 1] = y + py * tw * sg; pos[i * 3 + 2] = z;
          col[i * 4] = c[0] * nightK; col[i * 4 + 1] = c[1] * nightK; col[i * 4 + 2] = c[2] * nightK; col[i * 4 + 3] = al;
        }
      }
    }
    nArc++;
    return true;
  }
  const begin = (night) => { nArc = 0; nightK = 0.85 + 0.35 * clamp(night || 0, 0, 1); wk = clamp(lookFx.uInkScale.value || 1, 1, 3); };
  const end = () => {
    if (nArc < maxArcs) { pos.fill(0, nArc * PER_ARC * 3, maxArcs * PER_ARC * 3); col.fill(0, nArc * PER_ARC * 4, maxArcs * PER_ARC * 4); }
    geo.getAttribute('position').needsUpdate = true;
    geo.getAttribute('color').needsUpdate = true;
    mesh.visible = nArc > 0;
  };

  // ---- the loose feathers ----
  const N = low ? 28 : P.CONFETTI || 56, FALL = P.FALL || 3.4;
  const fg = featherGeometry(P, 'loose', 250, 92, 7);
  fg.translate(0, -125, 0);
  const fm = rimify(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap, side: THREE.DoubleSide, emissive: new THREE.Color(0.1, 0.12, 0.2) })); // (a little light of its own: a loose feather must not be a black cut-out in a dark sky)
  const cm = new THREE.InstancedMesh(fg, fm, N);
  cm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  cm.frustumCulled = false;
  cm.count = 0;
  cm.setColorAt(0, new THREE.Color('#ffffff'));
  cm.userData.toon = fm;
  parent.add(cm);
  const fe = [];
  for (let i = 0; i < N; i++) fe.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, a: 0, tilt: 0, life: 0, size: 1, drift: 0, seed: i + 1 });
  const TINTS = ['#ffffff', '#d4e0f6', '#9db5dc', '#f0c25a', '#7a90c4', '#ffffff'].map((h) => new THREE.Color(h));
  let nextF = 0, lastKey = -1;
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
  function feathers(x, y, z, n, { speed = 500, up = 150, spread = 1, area = 100, dir = Math.PI / 2, size = 1 } = {}) {
    for (let i = 0; i < n; i++) {
      const f = fe[nextF]; nextF = (nextF + 1) % N;
      const a = dir + (hash(f.seed, nextF, 31) * 2 - 1) * spread, sp = speed * (0.35 + 0.65 * hash(f.seed, nextF, 32));
      f.on = true; f.x = x + (hash(f.seed, nextF, 33) - 0.5) * area; f.y = y + (hash(f.seed, nextF, 34) - 0.5) * area; f.z = z + (hash(f.seed, nextF, 35) - 0.5) * 80;
      f.vx = Math.cos(a) * sp; f.vy = Math.sin(a) * sp + up * hash(f.seed, nextF, 36);
      f.a = hash(f.seed, nextF, 37) * 6.28; f.tilt = 0.4; f.life = FALL * (0.7 + 0.5 * hash(f.seed, nextF, 38)); f.size = size * (0.7 + 0.7 * hash(f.seed, nextF, 39)); f.drift = 0; f.k = nextF;
      f.col = TINTS[(hash(f.seed, nextF, 40) * TINTS.length) | 0];
      f.dirty = true;
    }
  }
  function stepFeathers(dt, key, slow) {
    const wm = 0.55 + 0.45 * wk; // (a loose feather grows with the camera's distance, but not as fast as a line does)
    const newKey = key !== lastKey;
    lastKey = key;
    let n = 0;
    for (let i = 0; i < N; i++) {
      const f = fe[i];
      if (!f.on) continue;
      f.life -= dt;
      if (f.life <= 0) { f.on = false; continue; }
      if (newKey) { // a new stepped drift: left or right, a new turn, a new flip
        f.drift = (hash(f.seed, key, 5) * 2 - 1) * 380;
        f.a += (hash(f.seed, key, 6) - 0.5) * 1.5;
        f.tilt = [0.25, 0.9, 1.35][(hash(f.seed, key, 7) * 3) | 0];
      }
      const e = Math.min(1, 3.2 * dt);
      f.vx += (f.drift - f.vx) * e;
      f.vy += (-230 - f.vy) * Math.min(1, 1.8 * dt);
      f.x += f.vx * dt * slow; f.y += f.vy * dt * slow;
      const fade = f.life < 0.6 ? Math.ceil((f.life / 0.6) * 3) / 3 : 1; // (it shrinks away in three steps)
      _e.set(f.tilt, 0, f.a);
      _q.setFromEuler(_e);
      _m.compose(_p.set(f.x, f.y, f.z), _q, _s.set(f.size * fade * wm, f.size * fade * wm, f.size * fade * wm));
      cm.setMatrixAt(n, _m);
      cm.setColorAt(n, _c.copy(f.col));
      n++;
    }
    cm.count = n;
    cm.visible = n > 0;
    cm.instanceMatrix.needsUpdate = true;
    if (cm.instanceColor) cm.instanceColor.needsUpdate = true;
  }

  // ---- the events ----
  const S = { hit: {}, sawChunks: new Set(), lastMode: '', lastBolt: null, landed: false, roosted: false, deathDone: false, gustBeat: false, acc: {}, flare: 0, zapped: 0, tetherOn: false, lastKey: -1, chunkT: 0, wasOpen: false, cloudDone: false, sinkT: 0 };
  const acc = (key, per, dt) => { const v = (S.acc[key] || 0) + per * dt; const k = Math.floor(v); S.acc[key] = v - k; return k; };

  // f = { cr, state, dt, t, key, chg (0..1), night, anchors, zBody, tierK, chunks (the view's chunk records), open (the gizzard is showing), ship3 (the charge point of the bolt it called: {x, y, z} | null), tether (0..1) }
  function update(f) {
    const { cr, state, dt, key, chg, anchors: an } = f, Pt = getP(), bd = cr.bird || {}, act = bd.act, dying = cr.mode === 'dying', slow = clamp(state.slow || 1, 0.25, 1);
    const kNew = key !== S.lastKey;
    S.lastKey = key;
    begin(f.night);
    const zb = f.zBody;
    // ---- the crackle: arcs between the feather tips of the wings, long ones along them, from the crest, round the tail ----
    const q = dying ? clamp(1 - (cr.sinkT || 0) / 2.4, 0, 1) : 1, power = chg * q + (S.flare > 0 ? 0.4 : 0);
    if (power > 0.02) {
      const lvl = Math.min(1, power);
      const stitches = Math.round(A.MAX_STITCH * Math.pow(lvl, 1.15)) + (lvl > 0.1 ? 1 : 0);
      for (let i = 0; i < stitches; i++) {
        const wi = i % 2, tips = an.tips[wi];
        if (!tips || tips.length < 2) continue;
        const j = Math.floor(hash(key, i, 11) * (tips.length - 1)), a = tips[j], b = tips[j + 1];
        arc(a.x, a.y, a.z + 6, b.x, b.y, b.z + 6, 55 + 30 * lvl, A.WIDTH * (0.7 + 0.3 * lvl), key * 131 + i * 17 + wi, 0.45 + 0.55 * lvl);
      }
      if (lvl >= 0.45) for (let wi = 0; wi < 2; wi++) { // a long arc from the wrist out to a feather tip, along the wing
        const tips = an.tips[wi], jn = an.joints[wi];
        if (!tips || !tips.length || !jn || jn.length < 3) continue;
        const a = jn[2], b = tips[Math.floor(hash(key, wi, 13) * tips.length)];
        arc(a.x, a.y, a.z + 40, b.x, b.y, b.z + 6, 170 * lvl, A.WIDTH * 1.1, key * 977 + wi * 31, 0.7 + 0.3 * lvl);
      }
      if (lvl >= 0.7 && an.crest && an.tips[0] && an.tips[0].length) { // from the crest to the near wing and the beak's glow
        const b = an.tips[0][Math.floor(hash(key, 3, 15) * an.tips[0].length)];
        arc(an.crest.x, an.crest.y, an.crest.z, b.x, b.y, b.z + 10, 220, A.WIDTH * 1.2, key * 53 + 7, 0.8);
        if (lvl >= 0.85 && an.beak) arc(an.beak.x, an.beak.y, an.beak.z + 20, an.crest.x, an.crest.y, an.crest.z, 90, A.WIDTH, key * 59 + 3, 0.9);
      }
      if (lvl >= 0.55 && an.tail && an.tail.length > 1) for (let i = 0; i < 2; i++) {
        const j = Math.floor(hash(key, i, 17) * (an.tail.length - 1));
        arc(an.tail[j].x, an.tail[j].y, an.tail[j].z + 6, an.tail[j + 1].x, an.tail[j + 1].y, an.tail[j + 1].z + 6, 60, A.WIDTH * 0.8, key * 71 + i, 0.6);
      }
    }
    // ---- the tether: a thread of lightning from its beak to the rod it has called a bolt for, growing as the bolt charges ----
    S.tetherOn = !!(f.ship3 && an.beak && !dying);
    if (S.tetherOn) {
      const w = A.TETHER * (0.4 + 0.6 * clamp(f.tether, 0, 1));
      arc(an.beak.x, an.beak.y, an.beak.z + 20, f.ship3.x, f.ship3.y, f.ship3.z, 110 + 120 * f.tether, w, key * 211 + 5, 0.55 + 0.45 * f.tether);
      if (Pt && kNew) Pt.flash(an.beak.x, an.beak.y, an.beak.z + 40, 220 + 260 * f.tether, '#bfe6ff', { hdr: 1.5, alpha: 0.4 + 0.4 * f.tether, life: 0.13 });
    }
    // ---- the gizzard: rays of lightning round the glowing stone ----
    if (f.open && an.gizzard && !dying) {
      for (let i = 0; i < 3; i++) {
        const a = hash(key, i, 21) * 6.283, r = 340 + 260 * hash(key, i, 22);
        arc(an.gizzard.x, an.gizzard.y, an.gizzard.z + 30, an.gizzard.x + Math.cos(a) * r, an.gizzard.y + Math.sin(a) * r, an.gizzard.z + 30, 55, A.WIDTH * 0.9, key * 311 + i * 7, 0.9);
      }
      if (Pt && kNew) Pt.flash(an.gizzard.x, an.gizzard.y, an.gizzard.z + 60, 360 + 200 * (key & 1), '#9fe8ff', { hdr: 1.4, alpha: 0.5, life: 0.13 });
      if (Pt && !S.wasOpen) { Pt.ring(an.gizzard.x, an.gizzard.y, an.gizzard.z + 80, 900, '#9fe8ff', 0.5); Pt.burst('spark', an.gizzard.x, an.gizzard.y, an.gizzard.z + 60, 24, { speed: [300, 1100], size: [5, 9], life: [0.3, 0.8], color: '#bfe6ff', noRate: true }); }
    }
    S.wasOpen = !!f.open;
    // a coil bolt into the glowing gizzard (the sim counts it in cr.zapped): a white flash, a ring and a burst of sparks at the stone, and the wings flare
    if ((cr.zapped || 0) > S.zapped && an.gizzard) {
      S.flare = Math.max(S.flare, 5);
      if (Pt) { Pt.flash(an.gizzard.x, an.gizzard.y, an.gizzard.z + 90, 1300, '#ffffff', { hdr: 2.4, alpha: 0.95, life: 0.22 }); Pt.ring(an.gizzard.x, an.gizzard.y, an.gizzard.z + 90, 1500, '#9fe8ff', 0.45); Pt.burst('spark', an.gizzard.x, an.gizzard.y, an.gizzard.z + 90, 32, { speed: [400, 1500], size: [6, 10], life: [0.4, 0.9], color: '#bfe6ff', noRate: true }); }
      feathers(an.gizzard.x, an.gizzard.y, an.gizzard.z + 100, 6, { speed: 800, up: 200, spread: 3.14, area: 300 });
    }
    S.zapped = cr.zapped || 0;
    end();
    if (S.flare > 0 && kNew) S.flare--;

    // ---- the storm's halo: a soft cold light round the bird so it never vanishes in the dark (stepped at 8 a second) ----
    if (Pt && kNew && !dying) Pt.flash(cr.x, -cr.y, zb - 60, 2500 + 900 * chg, '#6f9cf0', { hdr: 0.9, alpha: 0.07 + 0.12 * chg, life: 0.13 });

    // ---- hits: feathers fly off the part that was struck ----
    for (const p of cr.parts) {
      const was = S.hit[p.id] || 0, big = p.kind === 'wing' || p.kind === 'mantle' || p.kind === 'tail';
      if (p.hit > was + 1e-4 && p.segs && p.segs.length) {
        const s = p.segs[Math.min(p.segs.length - 1, Math.floor(p.segs.length / 2))], x = fin(s.x) ? s.x + Math.cos(s.ang) * s.len * 0.5 : cr.x, y = fin(s.y) ? -(s.y + Math.sin(s.ang) * s.len * 0.5) : -cr.y;
        feathers(x, y, zb + (p.layer === 'back' ? -250 : 250), big ? 8 : 5, { speed: 700, up: 220, spread: 3.14, area: 200 });
        if (Pt) Pt.burst('spark', x, y, zb + 200, 6, { speed: [200, 800], size: [5, 8], life: [0.25, 0.6], color: '#bfe6ff', noRate: true });
      }
      S.hit[p.id] = p.hit || 0;
    }
    // ---- a wing plucked (each new chunk): a cloud of feathers and sparks at the tear, then a trail behind the falling wing ----
    for (const c of cr.chunks || []) {
      if (S.sawChunks.has(c)) continue;
      S.sawChunks.add(c);
      feathers(c.cx, -c.cy, zb + 200, 12, { speed: 700, up: 250, spread: 3.14, area: 400, size: 1.2 });
      if (Pt) { Pt.flash(c.cx, -c.cy, zb + 200, 1000, '#ffffff', { hdr: 1.8, alpha: 0.8, life: 0.2 }); Pt.ring(c.cx, -c.cy, zb + 200, 1500, '#9fe8ff', 0.4); Pt.burst('spark', c.cx, -c.cy, zb + 200, 36, { speed: [300, 1200], size: [6, 10], life: [0.5, 1.2], color: '#bfe6ff' }); }
    }
    for (const e of f.chunks || []) { // the fall of a plucked wing (the body Rapier is tumbling): a feather now and then, sparks and a puff
      if (!e.holder || e.none || !e.holder.parent) continue;
      const p = e.holder.position;
      if (acc('ct', 9, dt) > 0) feathers(p.x, p.y, p.z + 60, 1, { speed: 160, up: 40, spread: 3.14, area: 300 });
      if (Pt && acc('cs', 14, dt) > 0) Pt.burst('spark', p.x, p.y, p.z + 60, 2, { speed: [40, 260], size: [5, 8], life: [0.3, 0.7], color: '#bfe6ff', area: 260 });
    }
    // ---- modes: take-off (driven off, or its time is up): feathers, a ring of dust and a screech of wind ----
    const mode = bd.mode, pc = bd.perch, rs = bd.roost;
    const lifting = (pc && pc.sub === 'lift') || (rs && rs.sub === 'lift');
    if (lifting && !S.lifting) {
      const x = cr.x, y = -cr.y - 100;
      feathers(x, y, zb + 200, 10, { speed: 800, up: 300, spread: 3.14, area: 600 });
      if (Pt) { Pt.ring(x, y - 200, zb + 100, 1600, '#e9eef9', 0.5); Pt.burst('dust', x, y - 200, zb + 100, 12, { dir: Math.PI / 2, spread: 1.4, speed: [200, 800], up: [60, 260], size: [90, 190], size1: 2.2, life: [1.0, 1.8], color: '#cfd6e6', alpha: 0.6, area: 500 }); }
    }
    S.lifting = lifting;
    if (Pt && pc && pc.landed && !S.landed) { // the thud on the bag: a ring and dust
      Pt.burst('dust', pc.wx, -pc.wy, zb + 80, 16, { dir: Math.PI / 2, spread: 1.5, speed: [150, 600], up: [30, 160], size: [90, 190], size1: 2.4, life: [1.0, 1.8], color: '#d9cbb0', alpha: 0.6, area: 380 });
      Pt.ring(pc.wx, -pc.wy, zb + 100, 900, '#cfe6ff', 0.4);
      feathers(pc.wx, -pc.wy + 200, zb + 200, 8, { speed: 500, up: 200, spread: 3.14, area: 500 });
    }
    S.landed = !!(pc && pc.landed);
    const onRock = !!(rs && rs.landed);
    if (Pt && onRock && !S.roosted) { Pt.burst('dust', cr.x, -cr.y - 380, zb + 80, 14, { dir: Math.PI / 2, spread: 1.5, speed: [150, 600], up: [30, 160], size: [90, 190], size1: 2.4, life: [1.0, 1.8], color: '#a8a0a0', alpha: 0.6, area: 380 }); Pt.ring(cr.x, -cr.y - 380, zb + 100, 1000, '#cfe6ff', 0.4); }
    S.roosted = onRock;
    // ---- the gust: it beats its wings down (streaks of wind) ----
    const gu = cr.gust;
    if (gu && gu.beat) {
      if (!S.gustBeat) { feathers(cr.x, -cr.y, zb + 250, 10, { speed: 900, up: 100, spread: 3.14, area: 800 }); if (Pt) Pt.ring(cr.x, -cr.y - 500, zb + 100, 2200, '#e9eef9', 0.45); }
      if (Pt && kNew) { const dirA = (gu.dir || 1) > 0 ? 0 : Math.PI; Pt.burst('spark', cr.x, -cr.y - 300, zb + 260, 12, { dir: dirA, spread: 0.07, speed: [1500, 2600], size: [6, 9], life: [0.4, 0.7], color: '#e1ebf8', area: 1500, noRate: true }); }
    }
    S.gustBeat = !!(gu && gu.beat);
    // ---- the pass: a trail of sparks and wind off the wing tips while it dives ----
    if (Pt && act && act.kind === 'pass' && act.sub === 'dive') {
      const n = acc('pass', 36, dt);
      if (n) {
        Pt.burst('spark', cr.x, -cr.y, zb + 250, n, { dir: Math.atan2(cr.mvy || 0, -(cr.mvx || 0)), spread: 0.35, speed: [500, 1400], size: [6, 10], life: [0.3, 0.7], color: '#bfe6ff', area: 900, noRate: true });
      }
    }
    // ---- dazed after its pass: little sparks round the head ----
    if (Pt && bd.dazed > 0 && kNew && an.head) Pt.burst('spark', an.head.x, an.head.y + 120, an.head.z + 100, 3, { speed: [60, 220], size: [8, 12], life: [0.25, 0.4], color: '#fff2a0', area: 160, noRate: true });
    // ---- the swallowed bolt (a strike at its own beak): a flash, a ring and sparks; the dive's bolt makes the wings flare ----
    const w = state.weather, b = w && w.bolt;
    if (b !== S.lastBolt) {
      S.lastBolt = b;
      if (b && fin(b.x) && fin(b.y) && an.beak) {
        const near = Math.hypot(b.x - an.beak.x, -b.y - an.beak.y) < 600;
        if (near && Pt) { Pt.flash(an.beak.x, an.beak.y, an.beak.z + 100, 900, '#ffffff', { hdr: 2.2, alpha: 0.9, life: 0.2 }); Pt.ring(an.beak.x, an.beak.y, an.beak.z + 100, 1500, '#9fe8ff', 0.5); Pt.burst('spark', an.beak.x, an.beak.y, an.beak.z + 100, 40, { speed: [400, 1500], size: [6, 10], life: [0.4, 1.0], color: '#bfe6ff', noRate: true }); S.flare = 5; }
        else { S.flare = 4; if (Pt && an.beak) Pt.flash(an.beak.x, an.beak.y, an.beak.z + 100, 700, '#ffffff', { hdr: 2, alpha: 0.8, life: 0.18 }); }
      }
    }
    // ---- the death: a flash and a cloud of feathers at the blow, then feathers, sparks and smoke while it falls, and a cloud at the end ----
    if (dying) {
      if (!S.deathDone) {
        S.deathDone = true;
        feathers(cr.x, -cr.y, zb + 250, 18, { speed: 800, up: 400, spread: 3.14, area: 800, size: 1.3 });
        if (Pt) { Pt.flash(cr.x, -cr.y, zb + 250, 2400, '#ffffff', { hdr: 2, alpha: 0.8, life: 0.25 }); Pt.ring(cr.x, -cr.y, zb + 200, 3200, '#9fe8ff', 0.7); S.flare = 6; }
      }
      const sk = cr.sinkT || 0;
      if (acc('df', 7 * slow, dt) > 0) feathers(cr.x, -cr.y, zb + 250, 1, { speed: 260, up: 60, spread: 3.14, area: 1100 });
      if (Pt) {
        const ns = acc('ds', 18 * slow * Math.max(0, 1 - sk / 3), dt);
        if (ns) Pt.burst('spark', cr.x, -cr.y, zb + 250, ns, { speed: [80, 500], size: [5, 9], life: [0.4, 0.9], color: '#bfe6ff', area: 1100, noRate: true });
        if (!S.cloudDone && sk > 5.2) { // the clouds close over it
          S.cloudDone = true;
          feathers(cr.x, -cr.y, zb + 250, 8, { speed: 500, up: 200, spread: 3.14, area: 1200 });
          Pt.ring(cr.x, -cr.y, zb + 100, 3000, '#cfe0ff', 0.7);
        }
      }
    }
    S.sinkT = cr.sinkT || 0;
    stepFeathers(dt, key, slow);
  }

  return {
    mesh, cm, arc, feathers, update, S,
    arcCount: () => nArc,
    reset() { S.sawChunks.clear(); S.hit = {}; S.deathDone = false; S.cloudDone = false; S.lastBolt = null; S.landed = S.roosted = S.lifting = S.gustBeat = false; S.flare = 0; S.zapped = 0; for (const f of fe) f.on = false; begin(0); end(); cm.count = 0; cm.visible = false; },
    dispose() { mesh.removeFromParent(); cm.removeFromParent(); geo.dispose(); mat.dispose(); fg.dispose(); fm.dispose(); cm.dispose(); },
  };
}
