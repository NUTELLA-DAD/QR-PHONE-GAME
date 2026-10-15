// THE SWORD FIGHTS IN 3D (CASTLE.md package A4; config.DUEL3D; the sim is host/duel.js, read only: state.away.duel and each man's p.on.dl): the soldiers who step out of a squad's block to fight one man are real 3D men in the garrison's
// own style (duelKit.js), and the man himself holds a cutlass in his hand with poses for a swing, a guard, a parry and a hit (crewPose.js). The HUD layer (host/duelArt.js) draws nothing of it while this is live; the words stay.
//   SOLDIERS  two instanced meshes (the men facing right, the men facing left), a draw call each however many men and whatever poses: guard (ready / after a blow), tell (the sword raised over his shoulder, a red "!" key over his head with a ring that closes on the moment the
//             blow lands, the same time the phone's cue ring takes), strike, stagger (thrown back, gold stars circling), down (lying), run (two strides), flee (hands up, the shield on his back). Held poses on 8 fps keys.
//             A hit makes him flash white for two keys; the hits he has left are pips over his head.
//   BLADES    a soldier who goes down drops his sword: it spins away and lies on the ground for a few seconds (the same mesh, the "blade" pose).
//   FX        a block (a small cool spark and ring), a PARRY (a big gold clash, rays and a ring, a bright flash), a hit (a white flash and a few rays), a soldier's blow on a man (a red slash), a FLANK (a gold glint: a four point star,
//             a ring and sparkles), a KO (stars rising, dust); the guard of a man is a thin arc in front of him, gold while a blow landing now would be a parry and blue after. All in held steps of 1/8 s of the sim's own clock.
//   THE MAN   rec(p, rec0) hands the crew layer his record with a cutlass in his hand and a dlPose (ready, guard, parry, hurt) while he is in a fight and for HOLD seconds after; crewPose.js does the arms.
// Everything stands in the flat map frame (the vertex shaders bend it with the ring like the castle). Cost: 4 draw calls (the men who face right and the swords, the men who face left, the lines, the glows), whatever is on screen. Drawing code never throws:
// update() is wrapped by the caller, and a kit that cannot be built just leaves the HUD's own shapes drawing.
import { THREE, look } from './style.js';
import { config } from '../../config.js';
import { createLines } from './lines3d.js';
import { createGlowSet, glowDisc, clamp, fin, PI } from './castleKit.js';
import { buildDuelKit, duelMaterials, POSES, KEY } from './duelKit.js';

const ALIVE = new Set(['run', 'ready', 'draw', 'tell', 'recover', 'stagger']);
const IDX = Object.fromEntries(POSES.map((n, i) => [n, i]));
const NSEG = 28;
const COS = [], SIN = []; // (a circle of NSEG steps, starting at the top, clockwise on the screen)
for (let i = 0; i <= NSEG; i++) { const a = PI / 2 - (i / NSEG) * PI * 2; COS.push(Math.cos(a)); SIN.push(Math.sin(a)); }
const STAR = []; // (the three stars that circle a staggered man's head: 8 held positions)
for (let j = 0; j < 8; j++) STAR.push([0, 1, 2].map((i) => { const a = j + i * 2.1; return [Math.cos(a), Math.sin(a) * 0.3]; }));
const DROP_X = [30, 46, 58, 66, 70, 72, 72], DROP_H = [96, 132, 134, 104, 58, 18, 3], DROP_R = [1.2, 0.5, -0.2, -0.9, -1.6, -2.3, -3.0]; // (a dropped sword: forward px, height px, turn, at each key)

export function createDuel3d({ parent, state, P }) {
  const K = () => config.DUEL3D || {};
  const getP = () => { try { return typeof P === 'function' ? P() : P; } catch { return null; } };
  const root = new THREE.Group();
  root.name = 'duel3d';
  root.visible = false;
  parent.add(root);
  const lines = createLines(root, 900, { depth: false, order: 9 });
  const glow = createGlowSet(root, glowDisc(), 200, false);
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V3 = new THREE.Vector3(), S3 = new THREE.Vector3(), EU = new THREE.Euler(), CO = new THREE.Color();
  const stats = { fighters: 0, swords: 0, fx: 0, lines: 0, glows: 0, tris: 0, kits: 0, ms: 0, hurts: 0, parries: 0, men: 0 };
  let kit = null, kitKey = '', broken = false, live = false, wasOn = false, lastKey = -1, lastT = 0, lastRing = null, lineup = null;
  const mem = new Map(); // soldier id -> { st, hitT, flashK, seen }
  const drops = []; // lying and falling swords: { x, y, face, k0, t0, done }
  const born = new WeakSet(), flanked = new WeakSet(); // the effects whose particles have been spawned; the hits that took the flank bonus
  const men = new Map(); // player id -> the view time up to which he still holds his sword
  let lastFlanks = -1, frameNo = 0;

  // ---- the instanced men --------------------------------------------------------------------------------------------------------------------------------------------------------------
  function disposeKit() {
    if (!kit) return;
    for (const m of [kit.R, kit.L]) { m.mesh.removeFromParent(); m.mesh.geometry.dispose(); }
    kit.mats.toon.dispose(); kit.mats.plain.dispose();
    kit = null; kitKey = '';
  }
  function buildKit(ring) {
    const k = config.RING3D || {}, A = (k.ART || {})[ring ? ring.variant : 'fortress'] || (k.ART || {}).fortress || {}, C = (k.GAR || {}).COL || {}, cap = Math.max(...Object.values(K().CAP || { high: 32 }), 12);
    disposeKit();
    const { right, left, tris } = buildDuelKit(A, C, K());
    const mats = duelMaterials();
    const make = (geo, name) => { // (one instanced mesh for the men who face right, one for those who face left)
      const ip = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
      ip.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('iPose', ip);
      const mesh = new THREE.InstancedMesh(geo, mats.toon, cap);
      mesh.userData.toon = mats.toon; mesh.userData.plain = mats.plain;
      if (!look.toon) mesh.material = mats.plain;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.setColorAt(0, CO.set('#ffffff')); mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false; mesh.count = 0; mesh.visible = false; mesh.name = name;
      root.add(mesh);
      return { mesh, ip, n: 0 };
    };
    kit = { R: make(right, 'duelMenR'), L: make(left, 'duelMenL'), mats, cap, tris };
    kitKey = ring ? ring.variant : 'fortress';
    stats.kits++; stats.tris = tris;
  }
  // one man (dir > 0: facing right; the lone blade is always in the right-hand mesh) into the next free instance of his mesh
  const put = (dir, x, y, z, rz, s, pose, flash) => {
    const m = dir > 0 ? kit.R : kit.L;
    if (m.n >= kit.cap) return;
    EU.set(0, 0, rz); Q.setFromEuler(EU); M4.compose(V3.set(x, y, z), Q, S3.set(s, s, s));
    m.mesh.setMatrixAt(m.n, M4); m.ip.setX(m.n, pose); m.mesh.setColorAt(m.n, CO.setScalar(flash ? 2.4 : 1)); m.n++;
  };
  function hide() {
    root.visible = false;
    if (kit) for (const m of [kit.R, kit.L]) { m.mesh.count = 0; m.mesh.visible = false; }
    glow.begin(); glow.end(); lines.begin(); lines.end();
    mem.clear(); drops.length = 0; men.clear(); lastFlanks = -1;
  }

  // ---- the man himself: a cutlass in his hand and a pose, for the crew layer (index.js asks for every man on the ground) ---------------------------------------------------------------------
  function parryNear(p, D) { for (const fx of D.fx) if (fx.k === 'spark' && fx.size === 'big' && fx.t < 0.3 && Math.abs(fx.x - p.x) < 140) return true; return false; }
  function rec(p, rec0) {
    try {
      const S = state.away, D = S && S.duel, DU = config.AWAY.DUEL;
      if (broken || K().ENABLED === false || !D || !D.on || !p.on || !p.on.away || p.on.mode !== 'walk' || p.ko > 0 || rec0.carry) return rec0;
      const dl = p.on.dl;
      let fighting = !!dl && (dl.cd > 0 || dl.guard > 0 || dl.wind > 0);
      if (!fighting) for (const F of D.foes) if (ALIVE.has(F.st) && (F.tgt === p.id || (Math.abs(F.x - p.x) <= DU.AIM + 80 && Math.abs(F.y - p.y) <= DU.DY))) { fighting = true; break; }
      if (fighting) men.set(p.id, lastT + (K().HOLD == null ? 1.5 : K().HOLD));
      else if ((men.get(p.id) || 0) <= lastT) return rec0;
      let pose = 'ready';
      if (p.hurtT > (K().HURT_AT == null ? 0.4 : K().HURT_AT)) pose = 'hurt';
      else if (parryNear(p, D)) pose = 'parry';
      else if (dl && dl.guard > 0) pose = 'guard';
      return { ...rec0, carry: 'cutlass', dlPose: pose };
    } catch { return rec0; }
  }

  // ---- the frame --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  function update({ on, t = 0, dt = 0.016, night = 0, tier = null }) {
    const t0 = performance.now();
    lastT = t;
    const S = state.away, D = S && S.duel, G = K();
    const sim = !!(S && S.on && D && D.on);
    if (broken || G.ENABLED === false || (!sim && !lineup)) { if (wasOn) { wasOn = false; hide(); } live = false; return; }
    const ring = state.course && state.course.ring && state.course.ring.gar ? state.course.ring : null;
    if (ring !== lastRing) { lastRing = ring; mem.clear(); drops.length = 0; }
    if (!kit || kitKey !== (ring ? ring.variant : 'fortress')) {
      try { buildKit(ring); } catch (e) { console.warn('view3d duel build failed', e); disposeKit(); broken = true; hide(); return; }
    }
    wasOn = true; live = true; root.visible = true; frameNo++;
    dt = clamp(dt, 0, 0.1);
    const k8 = Math.floor(t * 8), newKey = k8 !== lastKey;
    lastKey = k8;
    const C = G.COL || {}, FO = (config.AWAY.DUEL || {}).FOE || {}, Pt = getP(), vfx = look.vfx !== false && !!Pt, nightK = clamp(Number(night) || 0, 0, 1);
    const H = (G.H || 150) / 118, cap = Math.min(kit.cap, (G.CAP || {})[(tier && tier.name) || 'medium'] ?? 24);
    lines.begin(); glow.begin();
    let n = 0, nPips = 0, nDrop = 0;
    kit.R.n = 0; kit.L.n = 0;

    if (lineup) { // the dev page's line-up: every pose, facing right (row 1) and left (row 2), then the blade
      for (let i = 0; i < POSES.length; i++) {
        put(1, lineup.x + i * 170, lineup.y, lineup.z, POSES[i] === 'blade' ? 0.3 : 0, H, i, false);
        if (POSES[i] !== 'blade') put(-1, lineup.x + i * 170, lineup.y - 230, lineup.z, 0, H, i, false);
      }
    }
    const foes = sim ? D.foes : [], seen = new Set();
    for (const F of foes) {
      if (!fin(F.x) || !fin(F.y) || n >= cap) continue;
      seen.add(F.id);
      let m = mem.get(F.id);
      if (!m) { m = { st: F.st, hitT: 0, flashK: -1 }; mem.set(F.id, m); }
      if (F.hitT > m.hitT + 0.01) m.flashK = k8 + 2; // (a hit: he flashes for two keys)
      m.hitT = F.hitT;
      if (F.st === 'down' && m.st !== 'down') { // dropped: the sword leaves his hand
        drops.push({ x: F.x, y: F.y, face: F.face >= 0 ? 1 : -1, k0: k8, t0: t, done: false });
        if (vfx) Pt.burst('dust', F.x, -F.y + 20, 60, 6, { size: [30, 52], size1: 2.2, life: [0.5, 0.9], color: '#c9a875', alpha: 0.7, speed: [20, 90], up: [10, 60] });
      }
      m.st = F.st;
      const dir = (F.st === 'flee' ? F.fleeDir : F.face) >= 0 ? 1 : -1, alt = (k8 + F.id) & 1;
      let pose;
      switch (F.st) {
        case 'tell': pose = IDX.tell; break;
        case 'recover': pose = (FO.RECOVER || 0.7) - F.t < 0.36 ? IDX.strike : IDX.guard; break;
        case 'stagger': pose = IDX.stagger; break;
        case 'down': pose = IDX.down; break;
        case 'run': case 'home': pose = alt ? IDX.runB : IDX.runA; break;
        case 'flee': pose = alt ? IDX.fleeB : IDX.fleeA; break;
        default: pose = IDX.guard;
      }
      const s = H * (1 + (((F.id * 7) % 5) - 2) * 0.02), x = F.x, y = -F.y, z = (G.Z == null ? 46 : G.Z) + (((F.id * 7) % 3) - 1) * (G.ZSPREAD == null ? 14 : G.ZSPREAD);
      put(dir, x, y + ((F.st === 'run' || F.st === 'home' || F.st === 'flee') && alt ? 4 : 0), z, 0, s, pose, k8 < m.flashK);
      n++;
      if (F.st === 'tell') { // the ring that closes on the moment of the blow (held in eighths of the wait)
        const left = F.tmax ? clamp(F.t / F.tmax, 0, 1) : 1, lq = Math.ceil(left * 8) / 8, kx = x + dir * KEY.x * s, ky = y + KEY.y * s, kz = z + KEY.z * s + 8, r0 = (KEY.r + 3.2) * s, r1 = (KEY.r + 5 + 24 * lq) * s;
        const hot = F.t <= (config.AWAY.DUEL.BLOCK.PARRY + (config.AWAY.DUEL.CUE || {}).LEAD + 0.1) && (k8 & 1), done = Math.round(NSEG * (1 - lq));
        for (let i = 0; i < NSEG; i++) {
          lines.seg(kx + COS[i] * r1, ky + SIN[i] * r1, kx + COS[i + 1] * r1, ky + SIN[i + 1] * r1, 5.5 * s, C.RING || '#fff7e0', 0.95, kz);
          if (i < done) lines.seg(kx + COS[i] * r1, ky + SIN[i] * r1, kx + COS[i + 1] * r1, ky + SIN[i + 1] * r1, 3.4 * s, hot ? '#ffffff' : C.GOLD || '#ffd23f', 1, kz + 1);
        }
        void r0;
      } else if (F.st === 'stagger') { // gold stars circle his head
        const sj = STAR[(k8 >> 1) & 7];
        for (const [cx, cy] of sj) glow.add(x - dir * 30 * s + cx * 28 * s, y + 122 * s + cy * 28 * s, z + 40, 6.5 * s, 6.5 * s, 3, C.STAR || '#ffd23f', 1.8);
      }
      if (F.st !== 'run' && F.st !== 'home' && F.st !== 'flee' && F.st !== 'down' && F.st !== 'tell' && F.max > 0) { // the hits he has left
        for (let i = 0; i < F.max; i++) { glow.add(x + (i - (F.max - 1) / 2) * 17 * s, y + 146 * s, z + 40, 5.6 * s, 5.6 * s, 3, i < F.hp ? C.PIP_ON || '#ff4a3a' : C.PIP_OFF || '#3a3a3a', 1); nPips++; }
      }
    }
    for (const id of mem.keys()) if (!seen.has(id)) mem.delete(id);
    stats.fighters = n;

    // -- dropped swords: a held arc for DROP_X.length keys, then lying where they fell until DROP.LIFE s are up
    const LIFE = (G.DROP || {}).LIFE || 8;
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      if (t - d.t0 > LIFE || t < d.t0 || !fin(d.x)) { drops.splice(i, 1); continue; }
      if (kit.R.n >= kit.cap) break;
      const kk = Math.min(DROP_X.length - 1, Math.max(0, k8 - d.k0));
      if (kk === DROP_X.length - 1 && !d.done) { d.done = true; if (vfx) Pt.burst('dust', d.x + d.face * DROP_X[kk], -d.y + 8, 70, 3, { size: [18, 30], size1: 2, life: [0.4, 0.7], color: '#c9a875', alpha: 0.6, speed: [10, 50], up: [6, 30] }); }
      put(1, d.x + d.face * DROP_X[kk], -d.y + DROP_H[kk], 56, d.face * DROP_R[kk], H, IDX.blade, false);
      nDrop++;
    }
    stats.swords = nDrop;

    // -- the guards of the men on the ground: a thin arc in front of each, gold while a blow landing now would be a parry
    if (sim) for (const m of Object.values(state.players)) {
      const dl = m.on && m.on.dl;
      if (!dl || !(dl.guard > 0) || !m.on.away || m.on.mode !== 'walk' || m.ko > 0 || !fin(m.x) || !fin(m.y)) continue;
      const f = (m.face || 1) >= 0 ? 1 : -1, parry = dl.age <= config.AWAY.DUEL.BLOCK.PARRY, col = parry ? C.GUARD_OK || '#ffd23f' : C.GUARD_LATE || '#6fb3e8', cx = m.x + f * 54, cy = -m.y + 76, rx = 14, ry = 48;
      for (let i = 0; i < NSEG; i++) lines.seg(cx + COS[i] * rx, cy + SIN[i] * ry, cx + COS[i + 1] * rx, cy + SIN[i + 1] * ry, 7, col, parry ? 0.95 : 0.7, 100);
      if (parry && (k8 & 1)) glow.add(cx, cy, 104, 11, 11, 3, '#fff7e0', 2.2);
    }

    // -- the effects: held in steps of 1/8 s of the sim's own clock
    let nfx = 0;
    if (sim) {
      const fl = D.stats ? D.stats.flanks : 0;
      if (lastFlanks >= 0 && fl > lastFlanks) { let k = fl - lastFlanks; for (let i = D.fx.length - 1; i >= 0 && k > 0; i--) if (D.fx[i].k === 'hit' && !flanked.has(D.fx[i])) { flanked.add(D.fx[i]); k--; } } // (a hit that took the flank bonus: gold)
      lastFlanks = fl;
      for (const fx of D.fx) {
        if (!fin(fx.x) || !fin(fx.y)) continue;
        const k = Math.min(7, Math.floor(fx.t * 8)), fresh = !born.has(fx), x = fx.x, y = -fx.y, f = fx.face >= 0 ? 1 : -1, z = 110, a = 1 - k * 0.26;
        nfx++;
        if (fresh) born.add(fx);
        const rays = (cnt, r0, r1, w, col, al, turn = 0) => { for (let i = 0; i < cnt; i++) { const an = (i / cnt) * PI * 2 + turn, c = Math.cos(an), s = Math.sin(an); lines.seg(x + c * r0, y + s * r0, x + c * r1, y + s * r1, w, col, al, z); } };
        const circle = (r, w, col, al) => { for (let i = 0; i < NSEG; i++) lines.seg(x + COS[i] * r, y + SIN[i] * r, x + COS[i + 1] * r, y + SIN[i + 1] * r, w, col, al, z); };
        if (fx.k === 'spark' && fx.size === 'big') { // the PARRY: a bright clash
          if (fresh) { stats.parries++; if (vfx) { Pt.ring(x, y, z, 380, '#ffd23f', 0.36); Pt.burst('spark', x, y, z, 14, { speed: [220, 760], life: [0.25, 0.6], size: [4, 8], color: '#ffe9a8' }); Pt.spawn('flash', x, y, z - 4, { size: 360, size1: 1.2, life: 0.1, color: '#fff6dc', hdr: 3, alpha: 1 }); } }
          if (k < 3) glow.add(x, y, z, 34 - k * 9, 34 - k * 9, 3, '#ffffff', 3);
          rays(10, 20 + k * 14, 52 + k * 26, 9 - k * 1.5, C.PARRY || '#ffd23f', a);
          rays(10, 14 + k * 10, 34 + k * 18, 5, '#ffffff', a, 0.31);
          circle(24 + k * 24, 6.5 - k * 0.7, C.PARRY || '#ffd23f', a);
        } else if (fx.k === 'spark') { // a block: small and cool
          if (fresh && vfx) Pt.burst('spark', x, y, z, 5, { speed: [120, 380], life: [0.2, 0.4], size: [3, 5], color: '#cfe6ff' });
          if (k < 2) glow.add(x, y, z, 15 - k * 5, 15 - k * 5, 3, '#cfe6ff', 2.4);
          rays(6, 10 + k * 6, 30 + k * 12, 5, '#cfe6ff', a);
          circle(14 + k * 12, 4, '#9fdcff', a * 0.9);
        } else if (fx.k === 'hit') { // a hit: a small white flash
          if (fresh && vfx) Pt.burst('dust', x, y - 14, 60, 4, { size: [22, 40], size1: 2, life: [0.4, 0.7], color: '#c9a875', alpha: 0.65, speed: [20, 90], up: [10, 50] });
          if (k < 3) glow.add(x, y, z, 23 - k * 6, 23 - k * 6, 3, '#fff7e0', 2.6);
          rays(6, 10 + k * 6, 24 + k * 11, 4.5, '#fff7e0', a);
          if (flanked.has(fx)) { // a FLANK: a gold glint, a four point star, a ring and sparkles
            if (fresh && vfx) Pt.burst('spark', x, y, z, 8, { speed: [120, 420], life: [0.3, 0.6], size: [3, 6], color: '#ffd23f', up: [40, 160] });
            const L = 62 - k * 7;
            lines.seg(x - L, y, x + L, y, 6, C.FLANK || '#ffd23f', a, z + 1); lines.seg(x, y - L, x, y + L, 6, C.FLANK || '#ffd23f', a, z + 1);
            lines.seg(x - L * 0.55, y - L * 0.55, x + L * 0.55, y + L * 0.55, 4, '#fff7e0', a, z + 1); lines.seg(x - L * 0.55, y + L * 0.55, x + L * 0.55, y - L * 0.55, 4, '#fff7e0', a, z + 1);
            glow.add(x, y, z + 2, 22, 22, 3, C.FLANK || '#ffd23f', 3);
            circle(30 + k * 14, 4.5, C.FLANK || '#ffd23f', a);
            for (const [dx, dy] of [[-44, 30], [48, 38], [-30, -40], [40, -32]]) if ((k + dx) & 1) glow.add(x + dx, y + dy + k * 4, z + 2, 5, 5, 3, '#ffe9a8', 2.6);
          }
        } else if (fx.k === 'slash') { // a soldier's blow lands on a man: two red slashes
          if (k < 5) { for (const o of [-9, 9]) lines.seg(x - f * 34 + o, y + 38 - Math.abs(o), x + f * 34 + o, y - 38 - Math.abs(o), 8, '#ff5a4a', a, z); lines.seg(x - f * 30, y + 34, x + f * 30, y - 34, 4, '#ffffff', a, z + 1); }
          if (k < 2) glow.add(x, y, z, 24 - k * 8, 24 - k * 8, 3, '#ffd0c0', 2.4);
        } else if (fx.k === 'ko') { // a KO: stars rise from him and a little dust
          if (fresh && vfx) Pt.burst('dust', x, y + 20, 60, 5, { size: [28, 48], size1: 2.2, life: [0.5, 0.9], color: '#c9a875', alpha: 0.7, speed: [20, 100], up: [10, 60] });
          for (let i = 0; i < 4; i++) glow.add(x + (i - 1.5) * 26 + ((k + i) & 1) * 4, y + 80 + k * 9 + (i & 1) * 12, z, 7, 7, 3, C.STAR || '#ffd23f', 1.9);
        }
      }
    }
    stats.fx = nfx;
    stats.lines = lines.count; stats.glows = glow.count;
    for (const m of [kit.R, kit.L]) { const m4 = m.mesh; m4.count = m.n; m4.visible = m.n > 0; m4.instanceMatrix.needsUpdate = true; if (m4.instanceColor) m4.instanceColor.needsUpdate = true; m.ip.needsUpdate = true; }
    lines.end(); glow.end();
    stats.ms = performance.now() - t0;
    void on; void dt; void newKey; void nightK; void nPips;
  }

  return {
    update, rec, stats, root,
    get live() { return live && !!kit; },
    lineup(x, y, z = 40) { lineup = Number.isFinite(x) ? { x, y, z } : null; }, // (dev: every pose in two rows at a world point, y up; lineup() with no number puts it away)
    dispose() { disposeKit(); glow.dispose(); lines.dispose(); parent.remove(root); },
  };
}
