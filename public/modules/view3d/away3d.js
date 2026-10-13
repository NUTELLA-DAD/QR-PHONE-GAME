// THE AWAY TEAM IN 3D (CASTLE.md package A3; config.AWAY3D; the sim is host/ground.js and host/objectives.js, read only): what the crew who leave the ship use and do on the ground gets a real 3D look.
//   ROPE LADDER   a ladder of instanced cells (a rung and two rails) hanging from the hatch to near the ground; its foot sways in held sideways steps on 8 fps keys (a table, never a sine of time), a little more while
//                 the ship is flying fast. Wall ladders (and the wall walk's wooden ledge) stand while somebody is down there. A man on the ground, a wall or a ladder is the normal crew figure (crew.js) placed at the
//                 depth he stands at (placeCrew / specFor below); the climbing pose is crewPose.js's own, held while he is still.
//   FLARE         a red flare climbs over the man in 8 fps steps with a smoke trail and a glow, then hangs burning (flicker on the key, a halo, sparks and smoke) and sinks slowly for the rest of its life.
//   PICKUP        a gold dashed ring lying on the ground under where the hatch should hover, with a bobbing arrow over it; the words stay on the HUD (render.js).
//   OBJECTIVES    the winch (a drum with a crank that turns a step each key while it is held), the powder keg (a pile; carried on a man's chest by crew.js; planted with a sputtering fuse that burns down), the jammed
//                 ballista (garrison3d's broken pose, with smoke), the beacon (a stone brazier that lights with a big fire), the prisoner cage (the door swings open) with the prisoners in it, the great banner (planted, then
//                 on the carrier's back), and a small SIGN for each (a post and a board with the icon, the same drawings as the 2D markers); their words and bars stay on the HUD.
//   PRISONERS     freed men in plain clothes (crew figures with no colour cone), walking to the rope ladder and climbing it.
// Everything stands in the flat map frame (x = the game's x, y up = -y, z toward the viewer): the vertex shaders bend it with the ring like the castle. Cost: 1 call for the ladders, 1 for the props and sign posts (one-call
// ink), 1 for the sign pictures, 1 for the glows = 4 (the particles are the vfx's own), whatever is on screen. Drawing code never throws: update() is wrapped by the caller.
import { THREE, Batch, toonVCInkS, plainVCInk, depthVCInk, look } from './style.js';
import { config } from '../../config.js';
import { RB } from './ringBend.js';
import { createGlowSet, glowDiamond, clamp, fin, PI } from './castleKit.js';
import { buildLadderCell, makeIconAtlas, groundRing, arrowDown, signPost, kegAt, kegPile, fuseCord, fuseTip, winch, beacon, cage, greatBanner, plank } from './awayKit.js';

// where each objective's sign stands relative to its prop (the HUD asks signAt() so its words sit on the board)
const SIGNS = {
  winch: { dx: -95, up: 280, r: 50 }, charge: { dx: 0, up: 215, r: 50 }, fuse: { dx: 80, up: 215, r: 50 }, keg: { dx: 88, up: 140, r: 36 }, ballista: { dx: 0, up: 225, r: 50 },
  beacon: { dx: -115, up: 280, r: 50 }, cage: { dx: 0, up: 262, r: 50 }, banner: { dx: -105, up: 290, r: 50 },
};
const PROP_Z = 50;

export function createAway3d({ parent, state, P, bob }) {
  const K = () => config.AWAY3D || {};
  const getP = () => { try { return typeof P === 'function' ? P() : P; } catch { return null; } };
  const root = new THREE.Group();
  root.name = 'away3d';
  root.visible = false;
  parent.add(root);
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V3 = new THREE.Vector3(), S3 = new THREE.Vector3(), ZAXIS = new THREE.Vector3(0, 0, 1), CO = new THREE.Color();
  const stats = { cells: 0, props: 0, signs: 0, flares: 0, rebuilds: 0, ms: 0, calls: 0, prisoners: 0 };
  let broken = false, live = false, wasOn = false, lastKey = -1, sig = '', lastRing = null;
  let ladders = null, atlas = null, propGroup = null, glow = null, qMesh = null, qGeo = null;
  const held = new Map(); // objective id -> { prog, t } (when its bar last grew: somebody is working it)
  const flareSeen = new Map(); // flare id -> view time it first appeared (a re-lit flare restarts)
  const quads = []; // the sign pictures: { x, y, z, r, cell }

  // ---- the meshes (built on first use; if they cannot be, the HUD draws the 2D stand-ins) -----------------------------------------------------------------------------------------------------------------
  function build() {
    const cap = K().CAP || {};
    const cellGeo = buildLadderCell();
    ladders = new THREE.InstancedMesh(cellGeo, toonVCInkS, cap.CELLS || 220);
    ladders.userData.toon = toonVCInkS; ladders.userData.plain = plainVCInk;
    ladders.customDepthMaterial = depthVCInk;
    if (!look.toon) ladders.material = plainVCInk;
    ladders.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    ladders.setColorAt(0, CO.set('#ffffff')); ladders.instanceColor.setUsage(THREE.DynamicDrawUsage);
    ladders.frustumCulled = false; ladders.castShadow = false; ladders.receiveShadow = false; ladders.count = 0; ladders.visible = false; ladders.name = 'awayLadders';
    root.add(ladders);
    glow = createGlowSet(root, glowDiamond(), 90, false);
    atlas = makeIconAtlas();
    const nq = cap.QUADS || 24;
    qGeo = new THREE.BufferGeometry();
    qGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nq * 12), 3));
    qGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(nq * 8), 2));
    const idx = new Uint16Array(nq * 6);
    for (let i = 0; i < nq; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    qGeo.setIndex(new THREE.BufferAttribute(idx, 1));
    qGeo.setDrawRange(0, 0);
    const qMat = new THREE.MeshBasicMaterial({ map: atlas.texture, transparent: true, alphaTest: 0.04, toneMapped: false, fog: false });
    qMesh = new THREE.Mesh(qGeo, qMat);
    qMesh.frustumCulled = false; qMesh.name = 'awaySigns'; qMesh.renderOrder = 3;
    root.add(qMesh);
  }
  function dropProps() {
    if (propGroup) { propGroup.removeFromParent(); propGroup.traverse((o) => o.geometry && o.geometry.dispose()); propGroup = null; }
  }
  function hide() {
    root.visible = false; live = false;
    if (ladders) { ladders.count = 0; ladders.visible = false; }
    if (qGeo) qGeo.setDrawRange(0, 0);
    if (glow) { glow.begin(); glow.end(); }
    dropProps(); sig = '';
  }

  // ---- helpers ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const ringNow = () => (state.course && state.course.ring) || null;
  const palette = () => { const k = config.RING3D || {}, r = ringNow(); return (k.ART || {})[(r && r.variant) || 'fortress'] || (k.ART || {}).fortress || {}; };
  const onGround = () => Object.values(state.players).some((p) => p.on && p.on.away && p.on.mode !== 'home');
  // where an objective's sign board is: the board's centre as a map point (x, y DOWN like the sim's) and its radius; the HUD puts its words and its bar there
  function signAt(ob) {
    const sp = SIGNS[ob.kind === 'charge' && ob.state === 'fuse' ? 'fuse' : ob.kind] || SIGNS.charge;
    return { x: ob.x + sp.dx, y: ob.y - sp.up, r: sp.r };
  }
  const iconOf = (ob) => (ob.state === 'done' ? 'tick' : ob.kind === 'charge' && ob.state === 'fuse' ? 'fuse' : ob.kind);

  // A flare's height over the man's feet at a given age: it climbs in RISE seconds (fast, then slowing), hangs, and sinks a little for the rest of its life. Stepped: the key is the age in 1/8 s.
  const flareKey = (f) => { const LIFE = (config.AWAY.FLARE && config.AWAY.FLARE.LIFE) || 55; return Math.floor(clamp(LIFE - f.t, 0, LIFE) * 8) / 8; };
  function flareH(a) { const FC = K().FLARE || {}, LIFE = (config.AWAY.FLARE && config.AWAY.FLARE.LIFE) || 55, RISE = FC.RISE || 1, H = FC.H || 520, SINK = FC.SINK || 70; return a < RISE ? 30 + (H - 30) * (1 - (1 - a / RISE) * (1 - a / RISE)) : H - SINK * clamp((a - RISE) / Math.max(1, LIFE - RISE), 0, 1); }
  const flareAt = (f) => ({ x: f.x, y: f.y - flareH(flareKey(f)) }); // (as a map point, y DOWN: where the HUD puts the word FLARE)
  // The crew layer's record for an away man: where he stands in depth, and what he carries (the great banner on his back, a powder crate as a keg)
  function specFor(p) {
    const o = p.on;
    if (!o || !o.away || o.mode === 'home' || K().ENABLED === false || !live) return null;
    const Z = K().Z || {};
    const z = o.mode === 'rope' ? Z.ROPE : o.mode === 'ladder' ? Z.LADDER : o.deck ? Z.DECK : Z.GROUND;
    const S = state.away, B = S && S.obj && S.obj.banner;
    const carry = B && B.carrier === p.id ? 'banner' : p.carry === 'crate' ? 'keg' : p.carry;
    return { z: Number.isFinite(z) ? z : 70, rec: carry === p.carry ? p : { ...p, carry } };
  }
  // Freed prisoners and the men in the cage, placed in the crew layer (index.js calls it between crew.begin and crew.end)
  function placeCrew(crew) {
    const S = state.away;
    if (!live || !S || !S.on || !S.obj || !S.obj.on) return;
    const O = S.obj, PR = K().PRISONERS || {}, Z = K().Z || {}, R = S.rope;
    const sp = PR.SPECIES || ['bulldog'], co = PR.COLORS || ['#b8b2a2'];
    let n = 0;
    for (const pr of O.prisoners) {
      if (pr.state === 'aboard' || !fin(pr.x) || !fin(pr.y)) continue;
      const dir = pr.state === 'walk' ? (R.x >= pr.x ? 1 : -1) : pr.state === 'climb' ? 1 : (R.x >= pr.x ? 1 : -1);
      const moving = pr.state === 'walk' || pr.state === 'climb';
      crew.placeFly('pr' + pr.id, { id: 'pr' + pr.id, x: pr.x, y: pr.y, face: dir, species: sp[pr.id % sp.length], color: co[pr.id % co.length], plain: true, moving, climb: pr.state === 'climb', phase: pr.id }, { z: pr.state === 'climb' ? Z.ROPE : Z.GROUND });
      n++;
    }
    for (const ob of O.list) { // the cage's three, sitting behind the bars until it opens
      if (ob.kind !== 'cage' || ob.state !== 'ready' || ob.live === false || !near(ob.x)) continue;
      for (let i = 0; i < 3; i++) crew.placeFly('cg' + ob.id + i, { id: 'cg' + ob.id + i, x: ob.x + (i - 1) * 38, y: ob.y, face: i === 1 ? -1 : 1, species: sp[(i + 1) % sp.length], color: co[i % co.length], plain: true, moving: false, phase: i }, { z: PROP_Z - 6 + (i & 1) * 8 });
      n += 3;
    }
    stats.prisoners = n;
  }
  let camX = 0;
  const near = (x) => Math.abs(x - camX) <= (RB.on ? 1.5 * (RB.R || 2500) : 7000);

  // ---- the frame ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  function update({ on, t = 0, dt = 0.016, night = 0, tier = null }) {
    const t0 = performance.now();
    const S = state.away, A3 = K();
    if (broken || A3.ENABLED === false || !S || !S.on) { if (wasOn) { wasOn = false; hide(); } live = false; return; }
    if (!ladders) { try { build(); } catch (e) { console.warn('view3d away build failed', e); broken = true; hide(); return; } }
    wasOn = true;
    const ring = ringNow();
    if (ring !== lastRing) { lastRing = ring; held.clear(); flareSeen.clear(); sig = ''; }
    root.visible = true; live = true;
    dt = clamp(dt, 0, 0.1);
    const k8 = Math.floor(t * 8), k4 = Math.floor(t * 4), newKey = k8 !== lastKey;
    lastKey = k8;
    const C = A3.COL || {}, A = palette(), Pt = getP(), nightK = clamp(Number(night) || 0, 0, 1), vfx = look.vfx !== false && !!Pt;
    const R = S.rope, O = S.obj && S.obj.on ? S.obj : null, SHOW = (config.AWAY && config.AWAY.OBJECTIVES && config.AWAY.OBJECTIVES.SHOW) || 3000;
    camX = RB.on ? RB.xc : (fin(R.x) ? R.x : 0);
    const down = onGround();
    glow.begin();

    // -- the ladders: the rope from the hatch, the wall ladders while somebody is down there
    let nc = 0;
    const cap = (A3.CAP && A3.CAP.CELLS) || 220, RC = A3.ROPE || {}, CELL = RC.CELL || 40, Z = A3.Z || {};
    const putCell = (x, y, z, ang, sy, shade) => {
      if (nc >= cap) return;
      Q.setFromAxisAngle(ZAXIS, ang); M4.compose(V3.set(x, y, z), Q, S3.set(1, sy, 1));
      ladders.setMatrixAt(nc, M4); ladders.setColorAt(nc, CO.setRGB(shade[0], shade[1], shade[2])); nc++;
    };
    if (R.out && R.len > 4 && fin(R.x) && fin(R.y) && near(R.x)) {
      const n = Math.max(1, Math.round(R.len / CELL)), cell = R.len / n, tab = RC.SWAY || [0], sv = tab[((k8 % tab.length) + tab.length) % tab.length] || 0;
      const sh = state.ships && state.ships[0], vx = sh && sh.pose ? Math.abs(sh.pose.vx || 0) : 0;
      const amp = ((RC.AMP || 7) + (RC.AMP_MOVE || 14) * clamp(vx / 450, 0, 1)) * (sv / 2); // (px of sideways offset at the foot this key)
      const top = -R.y - (fin(bob && bob()) ? bob() : 0), off = (i) => amp * Math.pow(i / n, 1.4);
      for (let i = 0; i < n; i++) putCell(R.x + off(i), top - i * cell, Z.ROPE_BODY || 55, Math.atan2(off(i + 1) - off(i), cell) * -1, cell / CELL, [1.1, 1.04, 0.95]);
    }
    const showWall = down && ring && S.decks.length > 0;
    if (showWall) for (const l of S.ladders) {
      if (!near(l.x)) continue;
      const h = l.y1 - l.y0, n = Math.max(1, Math.round(h / CELL));
      for (let i = 0; i < n; i++) putCell(l.x, -l.y0 - i * (h / n), A3.WALL_Z == null ? 0 : A3.WALL_Z, 0, h / n / CELL, [0.82, 0.76, 0.68]);
    }
    ladders.count = nc; ladders.visible = nc > 0; ladders.instanceMatrix.needsUpdate = true; if (ladders.instanceColor) ladders.instanceColor.needsUpdate = true;
    stats.cells = nc;

    // -- who is being worked now (a bar that grew within the last quarter second)
    if (O) for (const ob of O.list) {
      const h = held.get(ob.id) || { prog: 0, t: -9 };
      if (ob.prog > h.prog + 1e-4) h.t = t;
      h.prog = ob.prog;
      held.set(ob.id, h);
    }
    const isHeld = (ob) => { const h = held.get(ob.id); return !!h && t - h.t < 0.25 && ob.prog > 0; };

    // -- the props and signs: a batch rebuilt only when what it shows changes (a crank step, a fuse step, a flag pose, an object done)
    const parts = [];
    const items = []; // what to draw this frame, in order
    if (showWall) for (const dk of S.decks) if (near((dk.x0 + dk.x1) / 2)) { parts.push('D' + dk.id); items.push({ k: 'deck', dk }); }
    if (O) for (const ob of O.list) {
      if (ob.live === false || ob.state === 'taken' || !near(ob.x) || Math.abs(ob.x - (fin(R.x) ? R.x : camX)) > SHOW * 1.5) continue;
      let sub = ob.state;
      if (ob.kind === 'winch' && ob.state === 'ready') sub += isHeld(ob) ? 'h' + (k8 & 7) : 'r';
      else if (ob.kind === 'charge' && ob.state === 'fuse') sub += Math.floor(clamp(ob.t, 0, 99) * 8);
      else if (ob.kind === 'banner' && ob.state === 'ready') sub += k4 % 3;
      parts.push(ob.id + ':' + sub + ':' + Math.round(ob.x));
      items.push({ k: 'ob', ob });
    }
    for (const pk of S.pickups) {
      if (!fin(pk.gx) || !fin(pk.gy) || !near(pk.gx)) continue;
      const gy = pk.prisoners && fin(R.ground) ? R.ground : pk.gy; // (freed men walk, then climb the rope: the ring stays on the ground under it)
      parts.push('P' + pk.id + ':' + (k8 & 3) + ((k8 >> 1) & 1) + ':' + Math.round(pk.gx) + ':' + Math.round(gy));
      items.push({ k: 'pick', pk, gy });
    }
    const newSig = parts.join('|');
    if (newSig !== sig) {
      sig = newSig;
      try { rebuild(items, { A, C, A3, k8, k4, isHeld, ring }); } catch (e) { console.warn('view3d away rebuild failed', e); dropProps(); broken = true; hide(); return; }
    }

    // -- fire, smoke, sparks and glows (the particles are the vfx's; the glows are this set's)
    const flick = [0.9, 1, 1.12][k8 % 3];
    if (O) for (const ob of O.list) {
      if (ob.live === false || !near(ob.x)) continue;
      const x = ob.x, y0 = -ob.y;
      if (ob.kind === 'charge' && ob.state === 'fuse') { // the sputtering fuse: a spark at its burning end
        const tip = fuseTip(x, y0, ob.t / Math.max(1, (config.AWAY.OBJECTIVES.CHARGE || {}).FUSE || 8));
        glow.add(tip.x, tip.y, PROP_Z + 6, 6 * flick, 9 * flick, 6, '#fff0c0', 3.2);
        if (vfx && newKey) Pt.spawn('flash', tip.x, tip.y, PROP_Z + 4, { size: 44 * flick, life: 0.13, size1: 1, color: C.FIRE || '#ff8a2a', hdr: 1.6, alpha: 0.9 });
        if (vfx && newKey) { Pt.burst('spark', tip.x, tip.y, PROP_Z + 8, 2, { speed: [40, 190], life: [0.2, 0.45], size: [3, 6], color: '#ffd23f', up: [20, 90] }); if (k8 % 2) Pt.burst('smoke', tip.x, tip.y + 8, PROP_Z, 1, { size: [14, 22], size1: 2.4, life: [0.6, 1.0], color: C.SMOKE || '#59534f', alpha: 0.5, speed: [2, 10], up: [14, 34] }); }
      } else if (ob.kind === 'beacon' && (ob.state === 'done' || ob.prog > 0.02)) { // the beacon burns: tongues of fire, a glow, smoke
        const lit = ob.state === 'done', s = lit ? 1 : 0.35 + 0.65 * clamp(ob.prog, 0, 1), by = y0 + 178;
        glow.add(x, by + 30 * s, PROP_Z + 8, 22 * s * flick, 50 * s * flick, 20, '#ffe3a0', 2.4);
        if (vfx && newKey) Pt.spawn('flash', x, by + 60 * s, PROP_Z + 6, { size: (300 + 120 * nightK) * s, life: 0.13, size1: 1, color: C.FIRE || '#ff8a2a', hdr: 1.0, alpha: 0.4 + 0.2 * nightK });
        if (vfx && newKey) {
          Pt.burst('fire', x, by, PROP_Z, lit ? 4 : 1, { size: [150 * s + 20, 230 * s + 30], size1: 0.55, life: [0.45, 0.75], speed: [4, 30], up: [80, 190], area: 34 * s + 8, drag: 1.3, hdr: 1.7 });
          if (lit && k8 % 2 === 0) Pt.burst('smoke', x, by + 150, PROP_Z, 1, { size: [90, 130], size1: 2.4, life: [1.6, 2.4], color: '#6b625c', alpha: 0.55, speed: [8, 26], up: [40, 90], area: 24 });
          if (lit && nightK > 0.15) Pt.spawn('flash', x, by + 60, PROP_Z + 20, { size: 420 + 160 * nightK, life: 0.13, size1: 1, color: '#ff9a3a', hdr: 1.1, alpha: 0.55 * nightK });
        }
      }
    }
    if (ring) for (const f of ring.faces) { // a sabotaged ballista smokes (garrison3d draws its broken pose)
      const sp = f.special;
      if (!sp || sp.kind !== 'ballista' || !sp.silent || sp.dead || f.down || !near(sp.x)) continue;
      if (vfx && newKey && k8 % 2 === 0) Pt.burst('smoke', sp.x + 70, -sp.y + 150, -10, 1, { size: [40, 64], size1: 2.6, life: [1.0, 1.7], color: C.SMOKE || '#59534f', alpha: 0.6, speed: [4, 16], up: [24, 60], area: 14 });
      glow.add(sp.x + 40, -sp.y + 112, 4, 6 * flick, 8 * flick, 6, C.FIRE || '#ff8a2a', 1.6);
    }
    // -- the flares
    const FC = A3.FLARE || {}, RISE = FC.RISE || 1;
    stats.flares = S.flares.length;
    for (const f of S.flares) {
      if (!fin(f.x) || !fin(f.y)) continue;
      if (!flareSeen.has(f.id) || f.t > (flareSeen.get(f.id).t || 0) + 1) flareSeen.set(f.id, { t0: t, t: f.t }); else flareSeen.get(f.id).t = f.t;
      const ka = flareKey(f), hAt = flareH;
      const px = f.x, py = -f.y + hAt(ka), z = 52, rising = ka < RISE;
      glow.add(px, py, z + 2, 12 * flick, 30 * flick, 12, FC.CORE || '#fff0c0', 3.4);
      if (rising) for (let j = 1; j <= 4; j++) { const a = ka - j / 8; if (a < 0) break; glow.add(px, -f.y + hAt(a), z, (24 - 5 * j) * flick, (44 - 9 * j) * flick, 12, FC.COLOR || '#ff4a2e', 2.1 - 0.35 * j); }
      if (vfx && newKey) {
        Pt.spawn('ball', px, py, z - 2, { size: 62 * (k8 & 1 ? 1 : 0.85), life: 0.13, size1: 1, color: FC.COLOR || '#ff4a2e', hdr: 1.5, alpha: 1 });
        Pt.spawn('flash', px, py, z - 4, { size: (520 + 280 * nightK) * (k8 & 1 ? 1 : 0.88), life: 0.13, size1: 1, color: FC.COLOR || '#ff4a2e', hdr: 1.2, alpha: 0.55 + 0.2 * nightK });
        if (rising || k8 % 2 === 0) Pt.burst('smoke', px, py - 22, z - 6, 1, { size: rising ? [44, 66] : [26, 40], size1: 2.4, life: rising ? [1.3, 1.9] : [1.8, 2.6], color: FC.SMOKE || '#d8cfc6', alpha: 0.7, speed: [2, 12], up: [-6, 8], ay: -4 });
        if (!rising && k8 % 2) Pt.burst('spark', px, py - 14, z, 1, { speed: [10, 50], life: [0.5, 0.9], size: [3, 5], color: '#ffb347', dir: -PI / 2, spread: 0.7, ay: -160 });
      }
    }
    glow.end();
    root.updateMatrixWorld(true);
    stats.ms = performance.now() - t0;
    void on; void tier; void dt;
  }

  // ---- the batch of props (rebuilt on a new signature) ---------------------------------------------------------------------------------------------------------------------------------------------
  function rebuild(items, { A, C, A3, k8, k4, isHeld }) {
    dropProps();
    quads.length = 0;
    const B = new Batch(), SG = A3.SIGN || {}, SP = A3.SPOT || {}, PL = A3.PLANK || {};
    for (const it of items) {
      if (it.k === 'deck') { const dk = it.dk; plank(B, C, dk.x0, dk.x1, -dk.y, PL.Z == null ? 8 : PL.Z, PL.DEPTH || 66, PL.THICK || 13); continue; }
      if (it.k === 'pick') { const pk = it.pk, RG = A3.RING || {}, gy = it.gy; groundRing(B, RG.COLOR || '#ffd23f', pk.gx, -gy, Z70(A3), RG.R || 96, RG.DASHES || 14, (k8 & 3) * 0.25, 10, 0.5, 1.1); arrowDown(B, RG.COLOR || '#ffd23f', pk.gx, -gy + (RG.ARROW_UP || 250) + ((k8 >> 1) & 1) * 12, Z70(A3), RG.ARROW || 1.5); continue; }
      const ob = it.ob, x = ob.x, y0 = -ob.y, z = PROP_Z, ready = ob.state === 'ready';
      if (ob.kind === 'winch') winch(B, C, x, y0, z, ready && isHeld(ob) ? (k8 & 7) * (PI / 4) : 0.6);
      else if (ob.kind === 'keg') { if (ready) kegPile(B, C, x, y0, z); }
      else if (ob.kind === 'charge') {
        if (ob.state === 'fuse') { kegAt(B, C, x, y0, z, 1); fuseCord(B, C, x, y0, z, ob.t / Math.max(1, (config.AWAY.OBJECTIVES.CHARGE || {}).FUSE || 8)); }
      } else if (ob.kind === 'beacon') beacon(B, A, C, x, y0, z, ob.state === 'done');
      else if (ob.kind === 'cage') cage(B, A, C, x, y0, z, ob.state === 'done' ? 1 : 0);
      else if (ob.kind === 'banner' && ready) greatBanner(B, A, C, x, y0, z, k4 % 3);
      if (ready && (ob.kind === 'charge' || ob.kind === 'ballista')) groundRing(B, ob.color || '#ffd23f', x, y0, z, SP.R || 52, SP.DASHES || 10, 0, 7, 0.5, 0.9); // (a spot to stand on)
      const sg = signAt(ob), z0 = SG.Z == null ? 60 : SG.Z;
      signPost(B, C, sg.x, y0, z0, ob.y - sg.y, sg.r);
      quads.push({ x: sg.x, y: -sg.y, z: z0 + 3.4, r: sg.r * 0.98, cell: iconOf(ob) });
    }
    if (!B.empty) {
      propGroup = B.build({ cast: false, receive: false, one: true, small: true });
      propGroup.name = 'awayProps';
      propGroup.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
      root.add(propGroup);
    }
    const pos = qGeo.attributes.position, uv = qGeo.attributes.uv, nq = Math.min(quads.length, (A3.CAP && A3.CAP.QUADS) || 24);
    for (let i = 0; i < nq; i++) {
      const q = quads[i], c = atlas.cell(q.cell);
      pos.setXYZ(i * 4, q.x - q.r, q.y - q.r, q.z); pos.setXYZ(i * 4 + 1, q.x + q.r, q.y - q.r, q.z); pos.setXYZ(i * 4 + 2, q.x + q.r, q.y + q.r, q.z); pos.setXYZ(i * 4 + 3, q.x - q.r, q.y + q.r, q.z);
      uv.setXY(i * 4, c[0], c[1]); uv.setXY(i * 4 + 1, c[2], c[1]); uv.setXY(i * 4 + 2, c[2], c[3]); uv.setXY(i * 4 + 3, c[0], c[3]);
    }
    pos.needsUpdate = true; uv.needsUpdate = true;
    qGeo.setDrawRange(0, nq * 6);
    stats.rebuilds++; stats.props = items.length; stats.signs = nq;
  }
  const Z70 = (A3) => (A3.Z && A3.Z.GROUND) || 70;

  return {
    update, placeCrew, specFor, signAt, flareAt, stats, root,
    get live() { return live; },
    dispose() { dropProps(); if (ladders) { ladders.removeFromParent(); ladders.geometry.dispose(); } if (qMesh) { qMesh.removeFromParent(); qGeo.dispose(); qMesh.material.dispose(); } if (atlas) atlas.texture.dispose(); if (glow) glow.dispose(); },
  };
}
