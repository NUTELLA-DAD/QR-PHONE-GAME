// THE GARRISON IN 3D (CASTLE.md package D2; config.RING3D.GAR; the sim is host/garrison.js and ring.js, read only): the castle's defenders get a real 3D look on the ring maps. The 2D fallback is ringArt.js.
//   SOLDIERS    instanced in five held poses (stand, aim, cheer, run, give up with a white flag): one draw call a pose however many men (garrisonKit.js, style.js one-call ink). Plaza squads stand in two rows with a
//               standard behind them (the Ember Pact's flame, oxblood and gold), archers stand on their wall-walk posts, a gun's crew beside the gun (a dead crew is simply not there: an empty gun). The poses
//               switch on 8 fps keys (a cheer bounces on them, a run bobs); the standards hold one of three poses of their cloth, 4 a second, phased per squad. Capped per quality tier, nearest the camera first.
//   ARROWS      the volleys' arrows and the ballista's bolts are instanced (state.bullets with arrow / bolt): a plain arrow is thin, a fire arrow carries a glowing head (and, in the dark, a halo and a trail of
//               fire), a bolt is the same shape three times as long and thick and dark. They replace the generic tracer for these kinds (vfx.js and index.js skip them).
//   TELEGRAPH   the amber dashed arc from the archer to where the volley will land, brighter as it nears, a landing ring, a "!" over the archer, the horn's rings and the flag on the gatehouse. Only one arc at a time (the sim's own rule).
//   BALLISTA    its low bastion is in the strip (castleStrip.js); here the ballista itself turns to its target on 8 fps keys and draws its bow in four steps while it locks; its pale dashed aim-line goes solid
//               and hot for the last 0.4 s (the sim freezes it) and runs on past the ship.
//   BOOM CHAIN  a heavy chain hanging down the lane to a spiked log on a bridle, a gold glow column with bright pulses running down it on 8 fps steps; it goes red while a ship is snagged; broken, its top half hangs
//               from the anchor and the log with the lower half falls away (stepped).
//   GRAPPLES    a squad swings a hook (the tell), then the rope runs from the plaza to a hook on the keel with a man climbing it (ring.zips with grapple: true; ringCastle.js leaves them to this).
//   WHITE FLAGS when the crown falls the men hold white flags, the standards turn white, and a white flag goes up on every gatehouse and wall tower.
//   NIGHT       fire arrows and the gatehouse braziers throw a halo in the dark (the vfx's own flash particles).
// Everything stands in the flat map frame (the vertex shaders bend it with the ring like the castle). Cost: 5 men + 3 standards + 1 arrows + 1 glow + 1 lines + 1 dynamic batch (+1 a ballista, +1 a falling chain) = 11 to 13 calls.
// Drawing code never throws: update() is wrapped by the caller, and a kit that cannot be built just leaves the garrison undrawn.
import { THREE, toonVC, plainVC, toonVCInk, toonVCInkS, plainVCInk, depthVCInk, Batch, look } from './style.js';
import { config } from '../../config.js';
import { RB } from './ringBend.js';
import { createLines } from './lines3d.js';
import { createGlowSet, glowDiamond, clamp, fin, PI } from './castleKit.js';
import { buildMen, buildBanners, buildArrow, buildBallista, ARROW_TIP, GAR_LIVE } from './garrisonKit.js';

const POSES = ['stand', 'aim', 'cheer', 'run', 'give'];
const TELL_FALLBACK = 1.2;

export function createGarrison3d({ parent, state, P }) {
  const K = () => config.RING3D || {};
  const GC = () => K().GAR || {};
  const getP = () => { try { return typeof P === 'function' ? P() : P; } catch { return null; } };
  const root = new THREE.Group();
  root.name = 'garrison3d';
  root.visible = false;
  parent.add(root);
  const lines = createLines(root, 900, { depth: false, order: 7 });
  const glow = createGlowSet(root, glowDiamond(), 160, false);
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V3 = new THREE.Vector3(), S3 = new THREE.Vector3(), EU = new THREE.Euler(), CO = new THREE.Color();
  const stats = { men: 0, menCap: 0, banners: 0, arrows: 0, fire: 0, bolts: 0, balls: 0, falls: 0, ms: 0, kits: 0, calls: 0, dynBuilds: 0 };
  let kit = null, kitKey = '', broken = false, dyn = null, dynSig = '';
  const ballistas = [];
  const chainInfo = new Map(); // chain -> { intact: seen whole, t0: when the view saw it break }
  const falls = [];
  let lastKey = -1, lastRing = null, wasOn = false;

  // ---- instanced meshes --------------------------------------------------------------------------------------------------------------------------------------------------------------
  function inst(geometry, max, { ink = true, small = true } = {}) {
    const toon = ink ? (small ? toonVCInkS : toonVCInk) : toonVC;
    const mesh = new THREE.InstancedMesh(geometry, toon, max);
    mesh.userData.toon = toon;
    mesh.userData.plain = ink ? plainVCInk : plainVC;
    if (ink) mesh.customDepthMaterial = depthVCInk;
    if (!look.toon) mesh.material = mesh.userData.plain;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.count = 0; mesh.visible = false; mesh.name = 'garrison';
    root.add(mesh);
    return mesh;
  }
  const put = (mesh, i, x, y, z, ry, sx, sy, sz, rz = 0) => { EU.set(0, ry, rz); Q.setFromEuler(EU); M4.compose(V3.set(x, y, z), Q, S3.set(sx, sy, sz)); mesh.setMatrixAt(i, M4); };
  const finish = (mesh, n) => { mesh.count = n; mesh.visible = n > 0; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; };

  function disposeKit() {
    if (!kit) return;
    for (const m of [...Object.values(kit.men), ...kit.banners, kit.arrows]) { if (m) { m.removeFromParent(); if (m.geometry) m.geometry.dispose(); } }
    for (const b of ballistas) { b.group.removeFromParent(); b.group.traverse((o) => o.geometry && o.geometry.dispose()); }
    ballistas.length = 0;
    kit = null; kitKey = '';
  }
  function buildKit(ring) {
    const k = K(), G = GC(), A = (k.ART || {})[ring.variant] || (k.ART || {}).fortress || {}, C = G.COL || {};
    disposeKit();
    const men = buildMen(A, C), ban = buildBanners(A, C, G.BANNER || { POLE: 270, W: 36, CLOTH: 96 });
    const cap = Math.max(...Object.values(G.CAP || { high: 110 }), 24);
    const out = { A, C, G, men: {}, banners: [], arrows: null, arrowGeo: buildArrow(C) };
    for (const p of POSES) out.men[p] = inst(men[p], cap);
    for (const white of [false, true]) ban[white ? 'white' : 'red'].forEach((g, i) => { out.banners[(white ? 3 : 0) + i] = inst(g, 28); });
    const arrows = new THREE.InstancedMesh(out.arrowGeo, toonVC, G.ARROWS || 140);
    arrows.userData.toon = toonVC; arrows.userData.plain = plainVC;
    if (!look.toon) arrows.material = plainVC;
    arrows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    arrows.setColorAt(0, CO.set('#ffffff')); arrows.instanceColor.setUsage(THREE.DynamicDrawUsage);
    arrows.frustumCulled = false; arrows.castShadow = false; arrows.receiveShadow = false; arrows.count = 0; arrows.visible = false; arrows.name = 'garrisonArrows';
    root.add(arrows);
    out.arrows = arrows;
    out.ban = ban;
    kit = out; kitKey = ring.variant; stats.kits++;
    void men;
  }

  const onGallery = (f, p) => !!(f.gal && !f.down && p.x >= f.gal.x0 && p.x <= f.gal.x1);
  // ---- the dynamic batch: archers' steps and stumps, the boom chains --------------------------------------------------------------------------------------------------------------------
  const torusGeo = new THREE.TorusGeometry(1, 0.32, 4, 8);
  const compose = (x, y, z, rz, ry, sx, sy, sz) => { // (a link: turned about its own long axis by ry, then tilted by rz)
    EU.set(0, ry, 0); const q1 = new THREE.Quaternion().setFromEuler(EU); EU.set(0, 0, rz); const q2 = new THREE.Quaternion().setFromEuler(EU);
    return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q2.multiply(q1), new THREE.Vector3(sx, sy, sz));
  };
  function chainRun(B, C, A, x0, y0, x1, y1, z, link, wid, ow = 2) { // a run of links from (x0, y0) to (x1, y1) (the picture's plane)
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
    if (len < 4) return;
    const pitch = link * 0.72, n = Math.max(1, Math.round(len / pitch)), rz = Math.atan2(-dx, dy);
    for (let i = 0; i < n; i++) {
      const s = (i + 0.5) / n;
      B.geo(C.CHAIN || '#77737b', torusGeo, compose(x0 + dx * s, y0 + dy * s, z, rz, i & 1 ? PI / 2 : 0, wid, link / 2, wid), ow);
    }
  }
  function chainBoom(B, C, A, cx, yBar, z) { // the spiked log on its bridle, with glowing studs (the studs are drawn by the glow set)
    const G = GC().CHAIN || {}, half = 150;
    B.box(A.woodDark || '#563c28', cx, yBar, z, half * 2.4, 44, 44, 2.6);
    for (const dx of [-half, -half / 2, 0, half / 2, half]) B.box(A.iron || '#3f3b3e', cx + dx, yBar, z, 16, 52, 52, 1.6);
    for (const dx of [-half * 0.75, -half * 0.25, half * 0.25, half * 0.75]) B.cone(A.iron || '#3f3b3e', cx + dx, yBar - 38, z, 10, 40, 1.2, PI);
    chainRun(B, C, A, cx, yBar + 190, cx - half, yBar + 26, z, (G.LINK || 82) * 0.62, (G.THICK || 17) * 0.8, 1.6);
    chainRun(B, C, A, cx, yBar + 190, cx + half, yBar + 26, z, (G.LINK || 82) * 0.62, (G.THICK || 17) * 0.8, 1.6);
    B.sphere(C.CHAIN || '#77737b', cx, yBar + 196, z, 26, 26, 26, 2, true);
  }
  function buildDynamic(ring) {
    const k = K(), A = kit.A, C = kit.C, G = GC(), M = G.MAN || {}, CH = G.CHAIN || {}, Wl = k.WALL || {};
    const B = new Batch(), wallTop = (Wl.H || 520) + 12;
    for (const f of ring.faces) {
      const base = -f.y;
      for (const p of f.posts || []) {
        if (onGallery(f, p)) continue;
        const z = M.POST_Z == null ? -258 : M.POST_Z, gy = -p.y, h = Math.max(20, gy - (base + wallTop));
        if (p.dead) { // a broken step and a few stones
          B.box(A.shade || '#7f7c84', p.x, base + wallTop + 14, z, 100, 28, 90, 2, 0, 0.3, 0.07);
          B.box(A.stone || '#a09da2', p.x + 26, base + wallTop + 36, z + 4, 44, 26, 40, 1.6, 0.2, 0.6, -0.2);
        } else {
          B.box(A.stone || '#a09da2', p.x, base + wallTop + h / 2, z, 104, h, 96, 2.4);
          B.box(A.trim || '#68656e', p.x, gy - 6, z, 112, 12, 104, 0.8);
          for (const s of [-1, 1]) B.box(A.stone || '#a09da2', p.x + s * 42, gy + 14, z + 40, 20, 28, 14, 1.2); // low merlons on its front
        }
      }
      const sp = f.special;
      if (sp && sp.kind === 'ballista' && !sp.dead) { // (the bastion's wooden trestle under the pivot)
        const sb = -sp.y;
        B.rod(A.woodDark || '#563c28', V3.set(sp.x - 26, sb + 84, -15).clone(), V3.set(sp.x, sb + 100, -15).clone(), 5, 1.2);
        B.rod(A.woodDark || '#563c28', V3.set(sp.x + 26, sb + 84, -15).clone(), V3.set(sp.x, sb + 100, -15).clone(), 5, 1.2);
      }
    }
    const L = CH.LINK || 82, W = CH.THICK || 17;
    for (const c of (ring.gar && ring.gar.chains) || []) {
      const yT = -c.yTop, yB = -c.yLow, z = -10;
      if (!c.broken) {
        const yL = Math.min(yT, yB + 190 + 2400); chainRun(B, C, A, c.x, yB + 190, c.x, yL, z, L, W); if (yT > yL) B.rod(C.CHAIN || "#77737b", V3.set(c.x, yL, z).clone(), V3.set(c.x, yT, z).clone(), 4, 0); // (links where the camera can see; a plain rod up to the anchor)
        chainBoom(B, C, A, c.x, yB, z);
      } else {
        const yBreak = yB + (CH.HANG || 1100);
        const yL = Math.min(yT, yBreak + 1300), whip = !!(chainInfo.get(c) && chainInfo.get(c).top); if (!whip) chainRun(B, C, A, c.x, yBreak, c.x, yL, z, L, W); if (yT > yL) B.rod(C.CHAIN || "#77737b", V3.set(c.x, yL, z).clone(), V3.set(c.x, yT, z).clone(), 4, 0); // the top half, hanging from the anchor, its last links ragged (D3: while it whips after the snap it is a mesh of its own, buildTop)
        if (!whip) chainRun(B, C, A, c.x + 6, yBreak - 40, c.x + 14, yBreak - 130, z, L * 0.9, W * 0.9);
      }
    }
    const g = B.parts.length ? B.build({ one: true, cast: false, receive: false, small: true }) : null;
    if (g) { g.name = 'garrisonDyn'; g.traverse((o) => { if (o.isMesh) o.frustumCulled = false; }); }
    return g;
  }
  function snapFx(c, Pt, stage) { // D3: the moment a chain parts: a white flash, a ring, a shower of sparks and iron chips at the break (stage 0), a second smaller shower at the end of the falling half (stage 1)
    if (!Pt || look.vfx === false) return;
    const S = (K().SET || {}).CHAIN || {}, x = c.x, yBreak = -c.yLow + ((GC().CHAIN || {}).HANG || 1100), y = stage === 0 ? yBreak : yBreak - 170, n = S.SPARKS || 30;
    Pt.burst('spark', x, y, 24, stage === 0 ? n : Math.round(n * 0.5), { speed: [220, 900], life: [0.3, 0.8], size: [5, 9], color: '#ffd37a' });
    if (stage === 0) {
      Pt.spawn('flash', x, y, 40, { size: 560, size1: 1.2, life: 0.1, color: '#fff0c8', hdr: 3, alpha: 1 });
      Pt.ring(x, y, 30, 560, '#ffd23f', 0.36);
      Pt.splinters(x, y, 30, 8, { kind: 'iron', speed: [200, 560], up: [40, 220], area: 30 });
    } else Pt.spawn('flash', x, y, 40, { size: 300, size1: 1.1, life: 0.08, color: '#ffd37a', hdr: 2, alpha: 0.8 });
    Pt.burst('smoke', x, y, 10, 2, { size: [40, 60], size1: 2.2, life: [0.8, 1.3], color: '#555050', alpha: 0.6, speed: [10, 50], up: [20, 60] });
  }
  function buildTop(c) { // D3: the top half of a snapped chain as a mesh of its own, so it can whip about its upper end (SET.CHAIN.WHIP) before it settles into the dynamic batch
    const CH = GC().CHAIN || {}, A = kit.A, C = kit.C, B = new Batch(), L = CH.LINK || 82, W = CH.THICK || 17;
    const yT = -c.yTop, yB = -c.yLow, z = -10, yBreak = yB + (CH.HANG || 1100), yL = Math.min(yT, yBreak + 1300);
    chainRun(B, C, A, c.x, yBreak, c.x, yL, z, L, W);
    chainRun(B, C, A, c.x + 6, yBreak - 40, c.x + 14, yBreak - 130, z, L * 0.9, W * 0.9);
    const g = B.build({ one: true, cast: false, receive: false, small: true });
    g.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    g.name = 'chainWhip';
    root.add(g);
    return { g, pivotY: yL };
  }
  function buildFall(c) { // the log and the lower half of a snapped chain, to be moved down
    const CH = GC().CHAIN || {}, A = kit.A, C = kit.C, B = new Batch();
    const yT = -c.yTop, yB = -c.yLow, z = -10, yBreak = yB + (CH.HANG || 1100);
    chainRun(B, C, A, c.x, yB + 190, c.x - 10, yBreak - 150, z, CH.LINK || 82, CH.THICK || 17);
    chainBoom(B, C, A, c.x, yB, z);
    void yT;
    const g = B.build({ one: true, cast: false, receive: false, small: true });
    g.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    root.add(g);
    return g;
  }

  // ---- the ballistas ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
  function ballistaFor(i) {
    let b = ballistas[i];
    if (!b) { const group = buildBallista(kit.A, kit.C); group.name = 'ballista3d'; group.traverse((o) => { if (o.isMesh) o.frustumCulled = false; }); root.add(group); b = ballistas[i] = { group, ang: 0.55, pose: 0, key: -1 }; }
    return b;
  }

  // ---- the frame -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  function hide() {
    root.visible = false; GAR_LIVE.on = false;
    if (kit) { for (const m of Object.values(kit.men)) finish(m, 0); for (const m of kit.banners) finish(m, 0); finish(kit.arrows, 0); }
    glow.begin(); glow.end(); lines.begin(); lines.end();
  }
  function update({ on, t = 0, dt = 0.016, night = 0, tier = null, castle = null }) {
    const t0 = performance.now();
    const ring = on && state.course && state.course.ring && state.course.ring.gar ? state.course.ring : null;
    const G = GC();
    if (!ring || G.ENABLED === false || broken) { if (wasOn) { wasOn = false; hide(); } if (castle) castle.garrison = false; return; }
    wasOn = true;
    if (ring !== lastRing) { lastRing = ring; dynSig = ''; chainInfo.clear(); for (const f of falls.splice(0)) { if (f.mesh) { f.mesh.removeFromParent(); f.mesh.traverse((o) => o.geometry && o.geometry.dispose()); } if (f.top) { f.top.g.removeFromParent(); f.top = null; } } } // (a new stop: a new ring object)
    if (!kit || kitKey !== ring.variant) {
      try { buildKit(ring); dynSig = ''; chainInfo.clear(); } catch (e) { console.warn('view3d garrison build failed', e); disposeKit(); broken = true; hide(); return; }
    }
    root.visible = true; GAR_LIVE.on = true;
    if (castle) castle.garrison = true; // (the grapples are ours now)
    dt = clamp(dt, 0, 0.1);
    const k8 = Math.floor(t * 8), k4 = Math.floor(t * 4), newKey = k8 !== lastKey;
    lastKey = k8;
    const col = G.COL || {}, M = G.MAN || {}, BN = G.BANNER || {}, AR = G.ARROW || {}, CH = G.CHAIN || {};
    const xc = RB.xc, reach = (G.REACH || 1.5) * ring.R, surrender = !!ring.crown;
    const Pt = getP(), nightK = clamp(Number(night) || 0, 0, 1);
    const near = (x) => Math.abs(x - xc) <= reach;

    // -- the dynamic batch (steps, stumps, chains): rebuilt only when a post falls, a face falls or a chain snaps
    const dSig = ring.faces.map((f) => (f.down ? 'x' : 'a') + (f.posts || []).map((p) => (p.dead ? 'd' : 'a')).join('') + (f.special && f.special.kind === 'ballista' && !f.special.dead ? 'b' : '')).join(',') + '|' + ((ring.gar && ring.gar.chains) || []).map((c) => (c.broken ? 'b' : 'a')).join('');
    for (const c of (ring.gar && ring.gar.chains) || []) { // (a chain the view saw whole and now sees broken: the lower half falls from here)
      let info = chainInfo.get(c);
      if (!info) { info = { intact: !c.broken, t0: -1, mesh: null }; chainInfo.set(c, info); }
      if (info.top && info.t0 >= 0 && Math.floor((t - info.t0) * 8) >= (((K().SET || {}).CHAIN || {}).WHIP || []).length) { info.top.g.removeFromParent(); info.top.g.traverse((o) => o.geometry && o.geometry.dispose()); info.top = null; } // (the whip is over: the top half goes back into the dynamic batch, below)
      if (!c.broken) info.intact = true;
      else if (info.intact && info.t0 < 0) {
        info.t0 = t;
        try { info.mesh = buildFall(c); falls.push(info); stats.falls++; } catch (e) { console.warn('view3d garrison fall failed', e); }
        try { // D3: the snap: sparks, a flash and a ring at the break, the top half whips (stepped), the falling half kicks away
          if ((((config.RING3D || {}).SET || {}).ENABLED) !== false) { info.top = buildTop(c); info.c = c; snapFx(c, Pt, 0); stats.snaps = (stats.snaps || 0) + 1; }
        } catch (e) { console.warn('view3d chain snap failed', e); info.top = null; }
      }
    }
    const dSig2 = dSig + '|' + (((ring.gar && ring.gar.chains) || []).map((c) => (chainInfo.get(c) && chainInfo.get(c).top ? 'w' : '-')).join('')); // (a snapped chain's top half is a mesh of its own while it whips)
    if (dSig2 !== dynSig) {
      dynSig = dSig2;
      if (dyn) { dyn.removeFromParent(); dyn.traverse((o) => o.geometry && o.geometry.dispose()); dyn = null; }
      try { dyn = buildDynamic(ring); if (dyn) root.add(dyn); stats.dynBuilds++; } catch (e) { console.warn('view3d garrison dynamic failed', e); dyn = null; }
    }
    const SC = (K().SET || {}).CHAIN || {}, WHIP = SC.WHIP || [], KICK = SC.KICK || [];
    for (let i = falls.length - 1; i >= 0; i--) { // the falling halves: stepped on the 8 fps key
      const f = falls[i], kk = Math.floor((t - f.t0) * 8), u = (kk / 8) / (CH.FALL_FOR || 2.4);
      if (f.top) { // D3: the top half whips about its upper end (a held angle each key, dying away), the falling half kicks away from the break and then drops
        const pivX = f.c.x;
        if (kk >= WHIP.length) { f.top.g.removeFromParent(); f.top.g.traverse((o) => o.geometry && o.geometry.dispose()); f.top = null; }
        else { const a = WHIP[Math.max(0, kk)] || 0, cs = Math.cos(a), sn = Math.sin(a); f.top.g.rotation.z = a; f.top.g.position.set(pivX - (pivX * cs - f.top.pivotY * sn), f.top.pivotY - (pivX * sn + f.top.pivotY * cs), 0); }
        if (kk === 1 && !f.fx1) { f.fx1 = true; snapFx(f.c, Pt, 1); }
      }
      if (u >= 1 || u < 0) { if (f.mesh) { f.mesh.removeFromParent(); f.mesh.traverse((o) => o.geometry && o.geometry.dispose()); f.mesh = null; } if (f.top) { f.top.g.removeFromParent(); f.top.g.traverse((o) => o.geometry && o.geometry.dispose()); f.top = null; } falls.splice(i, 1); continue; }
      const ka = f.c ? KICK[Math.min(Math.max(0, kk), KICK.length - 1)] || 0 : 0, py = f.c ? -f.c.yLow + (CH.HANG || 1100) - 150 : 0, px = f.c ? f.c.x : 0, c2 = Math.cos(ka), s2 = Math.sin(ka);
      f.mesh.rotation.z = ka;
      f.mesh.position.set(f.c ? px - (px * c2 - py * s2) : 0, (f.c ? py - (px * s2 + py * c2) : 0) - (CH.FALL_PX || 2400) * u * u, 0);
    }

    // -- the men
    const men = [];
    const man = (pose, x, y, z, ry, s, d) => men.push({ pose, x, y, z, ry, s, d });
    const gapX = M.GAP || 38, rows = M.ROWS || [-48, -78];
    let nBanner = 0;
    const swings = [];
    const bn = [[], [], [], [], [], []]; // standards per mesh: [x, y, z, scale]
    const banner = (white, phase, x, y, z, s) => { const m = (white ? 3 : 0) + (((phase % 3) + 3) % 3); if (bn[m].length < 28 && near(x)) { bn[m].push([x, y, z, s]); nBanner++; } };
    for (const f of ring.faces) {
      for (const p of f.posts || []) {
        if (p.dead || f.down || !near(p.x)) continue;
        const dir = p.aim ? (Math.sign(p.aim.x - p.x) || 1) : (p.k ? 1 : -1), aiming = p.mode === 'tell' || p.mode === 'loose';
        const gal = onGallery(f, p); // (a post behind the covered gallery stands on its deck instead: the hoarding would hide him on the wall)
        man(surrender ? 'give' : aiming ? 'aim' : 'stand', p.x, gal ? -f.gal.y : -p.y, gal ? 40 : M.POST_Z == null ? -258 : M.POST_Z, aiming && !surrender ? (dir > 0 ? 0 : PI) : (p.k ? -0.3 : 0.3), gal ? 1 : 1.12, Math.abs(p.x - xc));
      }
      for (const q of f.squads || []) {
        if (q.state === 'dead' || !near(q.x)) continue;
        const n = clamp(q.n | 0, 0, 12), crew = q.kind === 'gun', st = surrender ? 'surrender' : q.state, d = Math.abs(q.x - xc);
        const pose = st === 'surrender' ? 'give' : st === 'flee' ? 'run' : st === 'cheer' ? 'cheer' : 'stand';
        const dir = q.fleeTo > q.x ? 1 : -1, gap = st === 'flee' ? gapX * 1.35 : crew ? gapX * 0.9 : gapX;
        for (let i = 0; i < n; i++) {
          const x = q.x + (crew ? (M.GUN_DX == null ? 70 : M.GUN_DX) - 70 : 0) + (i - (n - 1) / 2) * gap, z = crew ? (M.GUN_Z == null ? -20 : M.GUN_Z) : (rows[i & 1] ?? -48);
          let y = -q.y;
          if (pose === 'cheer') y += (((k8 >> 1) + i + q.id) & 1) * 10; // (a stepped hop)
          else if (pose === 'run') y += ((k8 + i + q.id) & 1) * 6;
          man(pose, x, y, z, pose === 'run' ? (dir > 0 ? 0 : PI) : (((i + q.id) % 3) - 1) * 0.3, 1 + (((i * 7 + q.id * 3) % 5) - 2) * 0.025, d);
        }
        if (q.kind === 'plaza' && st !== 'flee') banner(st === 'surrender', q.id + k4, q.x, -q.y, BN.Z == null ? -86 : BN.Z, 1);
        if (q.swing && st !== 'surrender' && st !== 'flee' && near(q.x)) { // the tell of a grapple: a hook swung on a rope over his head
          const hx = q.x + 30, hy = -q.y + 150, a = k8 * 0.9, kx = hx + Math.cos(a) * 62, ky = hy + 36 + Math.sin(a) * 62;
          swings.push([hx, hy, kx, ky]);
        }
      }
      if (!surrender && !f.down && f.flag > 0 && near(f.x)) banner(false, f.i + k4, f.x + 330, -f.y + 820, -50, 0.75); // the flag on the gatehouse
    }
    if (surrender && castle && castle.flagSpots) { // a white flag on every gatehouse and wall tower
      for (const sp of castle.flagSpots) {
        if (!near(sp.x)) continue;
        const fi = sp.f < 99 ? Math.floor(sp.f / 2) : -1;
        if (fi >= 0 && ring.faces[fi] && ring.faces[fi].down) continue;
        banner(true, sp.f + k4, sp.x, sp.y - 70, sp.z, (sp.scale || 1.4) >= 1.8 ? 0.55 : 0.45);
      }
    }
    for (const z of ring.zips || []) { // a man climbing a grapple's rope
      if (!z.grapple || !fin(z.x) || !fin(z.y)) continue;
      man('cheer', z.x, -z.y - 126, 30, 0, 1, 0);
    }
    const cap = (G.CAP || {})[(tier && tier.name) || 'medium'] ?? 64;
    men.sort((a, b) => a.d - b.d);
    const nMen = Math.min(men.length, cap), counts = { stand: 0, aim: 0, cheer: 0, run: 0, give: 0 };
    for (let i = 0; i < nMen; i++) {
      const m = men[i], mesh = kit.men[m.pose], s = (M.H || 118) / 118 * m.s;
      put(mesh, counts[m.pose]++, m.x, m.y, m.z, m.ry, s, s, s);
    }
    for (const p of POSES) finish(kit.men[p], counts[p]);
    stats.men = nMen; stats.menCap = cap;
    bn.forEach((list, mi) => {
      const mesh = kit.banners[mi];
      list.forEach((b, i) => put(mesh, i, b[0], b[1], b[2], 0, b[3], b[3], b[3]));
      finish(mesh, list.length);
    });
    stats.banners = nBanner;

    // -- arrows and bolts
    const am = kit.arrows;
    let na = 0, nfire = 0, nbolt = 0;
    const maxA = G.ARROWS || 140;
    lines.begin(); glow.begin();
    for (const [hx, hy, kx, ky] of swings) { // (the hooks being swung)
      lines.seg(hx, hy, kx, ky, 4, col.ROPE || '#8a6a44', 1, 40);
      lines.seg(kx - 12, ky - 12, kx, ky, 7, '#2a2630', 1, 41); lines.seg(kx, ky, kx + 12, ky - 12, 7, '#2a2630', 1, 41);
    }
    for (const b of state.bullets) {
      if (!(b.arrow || b.bolt) || !(b.life > 0) || !fin(b.x) || !fin(b.y) || !fin(b.vx) || !fin(b.vy) || na >= maxA) continue;
      if (!near(b.x)) continue;
      const sp = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / sp, uy = -b.vy / sp, bolt = !!b.bolt;
      const len = bolt ? AR.BOLT_LEN || 300 : AR.LEN || 112, th = bolt ? AR.BOLT_THICK || 15 : AR.THICK || 7, tipX = b.x, tipY = -b.y;
      put(am, na, tipX - ux * ARROW_TIP * len, tipY - uy * ARROW_TIP * len, 14, 0, len, th, th, Math.atan2(uy, ux));
      am.setColorAt(na, bolt ? CO.setRGB(0.5, 0.46, 0.46) : b.burn ? CO.setRGB(1, 0.8, 0.62) : CO.setRGB(1, 1, 1));
      na++;
      if (bolt) { nbolt++; lines.seg(tipX - ux * len * 1.6, tipY - uy * len * 1.6, tipX - ux * len * 0.5, tipY - uy * len * 0.5, 9, col.LOCK || '#fff0c8', 0.28, 12); } // (a pale streak behind it)
      else {
        lines.seg(tipX - ux * len * 2.6, tipY - uy * len * 2.6, tipX - ux * len * 0.7, tipY - uy * len * 0.7, 7, b.burn ? col.FIRE || '#ff8a2a' : '#fff2cc', b.burn ? 0.6 : 0.5, 12); // (a pale streak: the eye follows it)
      }
      if (!bolt && b.burn) {
        nfire++;
        glow.add(tipX, tipY, 16, 32 + 10 * nightK, 46 + 14 * nightK, 32, col.FIRE || '#ff8a2a', 1.9 + 0.6 * nightK);
        if (newKey && Pt && look.vfx !== false) {
          Pt.spawn('fire', tipX - ux * 40, tipY - uy * 40, 14, { size: [26, 40], size1: 0.5, life: [0.16, 0.28], speed: [0, 8], up: [8, 28], hdr: 1.5 });
          if (nightK > 0.15) Pt.spawn('flash', tipX, tipY, 24, { size: 150 + 90 * nightK, life: 0.13, size1: 1, color: '#ff9a3a', hdr: 1.2, alpha: 0.5 * nightK });
        }
      }
    }
    finish(am, na);
    stats.arrows = na; stats.fire = nfire; stats.bolts = nbolt;

    // -- the telegraph: one amber arc (the sim lets one post tell at a time), the "!" over the archer, the horn
    let shown = false;
    const tellMax = (config.GARRISON && config.GARRISON.ARCHER && config.GARRISON.ARCHER.TELL) || TELL_FALLBACK, pulse = k8 & 1;
    for (const f of ring.faces) {
      if (f.down) continue;
      for (const p of f.posts || []) {
        if (shown || p.dead || p.mode !== 'tell' || !p.aim || !fin(p.aim.x) || !fin(p.aim.y)) continue;
        shown = true;
        const kk = clamp(1 - p.telegraph / tellMax, 0, 1), x0 = p.x, y0 = -p.y + 95, x1 = p.aim.x, y1 = -p.aim.y, cx = (x0 + x1) / 2, cy = Math.max(y0, y1) + 380;
        let px = x0, py = y0;
        const N = 28;
        for (let i = 1; i <= N; i++) {
          const s = i / N, a = (1 - s) * (1 - s), b = 2 * s * (1 - s), c = s * s, qx = a * x0 + b * cx + c * x1, qy = a * y0 + b * cy + c * y1;
          if (((i + pulse) & 1) === 0) lines.seg(px, py, qx, qy, 9 + 7 * kk, col.AMBER || '#ffaa28', 0.4 + 0.5 * kk, 90);
          px = qx; py = qy;
        }
        const rr = 130 - 60 * kk; // the landing ring shrinks as the volley nears
        for (let i = 0; i < 14; i++) { const a0 = (i / 14) * PI * 2, a1 = ((i + 1) / 14) * PI * 2; if (i & 1) continue; lines.seg(x1 + Math.cos(a0) * rr, y1 + Math.sin(a0) * rr, x1 + Math.cos(a1) * rr, y1 + Math.sin(a1) * rr, 8, col.AMBER || '#ffaa28', 0.45 + 0.4 * kk, 90); }
        const hot = pulse ? 2.5 : 1.8; // the "!"
        glow.add(p.x, y0 + 130, 40, 12, 34, 8, col.AMBER || '#ffaa28', hot);
        glow.add(p.x, y0 + 82, 40, 9, 9, 8, col.AMBER || '#ffaa28', hot);
      }
      if (f.horn > 0 && !surrender && near(f.x)) { // the horn: rings of sound either side of the gatehouse's flag
        const hx = f.x + 330, hy = -f.y + 960, steps = Math.floor(f.horn * 8) / 8, al = clamp(f.horn / 1.5, 0, 1) * 0.8;
        for (let j = 0; j < 3; j++) {
          const r = 90 + (1.5 - steps) * 260 + j * 60;
          for (const s of [-1, 1]) for (let i = 0; i < 8; i++) { const a0 = -0.9 + (1.8 * i) / 8, a1 = -0.9 + (1.8 * (i + 1)) / 8; lines.seg(hx + s * Math.cos(a0) * r, hy + Math.sin(a0) * r, hx + s * Math.cos(a1) * r, hy + Math.sin(a1) * r, 6, col.HORN || '#ffc86a', al, 80); }
        }
      }
    }

    // -- the ballistas and their lines
    let bi = 0;
    for (const f of ring.faces) {
      const sp = f.special;
      if (!sp || sp.kind !== 'ballista' || sp.dead || f.down) continue;
      const b = ballistaFor(bi++), L = sp.lock;
      if (newKey || b.key < 0) {
        b.key = k8;
        if (L && fin(L.x1) && fin(L.y1)) b.ang = Math.atan2(-(L.y1 - L.y0), L.x1 - L.x0);
        const pull = L ? 1 - Math.max(0, L.t) / Math.max(0.01, L.max || 1.5) : 0;
        b.pose = clamp(Math.round(pull * 3), 0, 3);
        b.group.userData.show(b.pose);
        b.group.rotation.z = b.ang;
      }
      b.group.position.set(sp.x, -sp.y + 100, -15);
      b.group.visible = near(sp.x);
      if (L && b.group.visible && fin(L.x0) && fin(L.y0) && fin(L.x1) && fin(L.y1)) {
        const frozen = L.t <= ((config.GARRISON && config.GARRISON.BALLISTA && config.GARRISON.BALLISTA.FREEZE) || 0.4), kk = clamp(1 - Math.max(0, L.t) / Math.max(0.01, L.max || 1.5), 0, 1);
        const ax = L.x0, ay = -L.y0, ex = ax + (L.x1 - L.x0) * 1.6, ey = ay - (L.y1 - L.y0) * 1.6;
        if (frozen) lines.seg(ax, ay, ex, ey, 15, col.LOCK_HOT || '#ff5a3c', 0.85, 85);
        else lines.dashed(ax, ay, ex, ey, 9, col.LOCK || '#fff0c8', 40, 26, 0.3 + 0.5 * kk, 85, (k8 % 4) * 16);
        const rr = frozen ? 70 : 100 - 30 * kk; // a ring on the ship's aim point
        for (let i = 0; i < 12; i += 2) { const a0 = (i / 12) * PI * 2, a1 = ((i + 1) / 12) * PI * 2; lines.seg(L.x1 + Math.cos(a0) * rr, -L.y1 + Math.sin(a0) * rr, L.x1 + Math.cos(a1) * rr, -L.y1 + Math.sin(a1) * rr, 8, frozen ? col.LOCK_HOT || '#ff5a3c' : col.LOCK || '#fff0c8', 0.8, 85); }
      }
    }
    for (let i = bi; i < ballistas.length; i++) ballistas[i].group.visible = false;

    // -- the boom chains: a glow column and bright pulses running down it on 8 fps steps; red while a ship is snagged
    for (const c of (ring.gar && ring.gar.chains) || []) {
      // (both chains glow wherever they are: the far side of the ring is in the picture too)
      const hot = c.snagging, yT = -c.yTop, yB = -c.yLow, g0 = hot ? col.CHAIN_HOT || '#ff6a3c' : col.CHAIN_GLOW || '#ffc84a', st = k8 & 3;
      if (!c.broken) {
        lines.seg(c.x, yT, c.x, yB + 40, (CH.COLUMN || 150) * (1 + 0.06 * st), g0, hot ? 0.2 : 0.11, -35);
        lines.seg(c.x, yT, c.x, yB + 40, 46, g0, hot ? 0.34 : 0.2, -34);
        lines.dashed(c.x, yT, c.x, yB + 190, 12, '#fff2c0', 44, 150, 0.9, 6, -((k8 % 4) * 48));
        for (const dx of [-150, -75, 0, 75, 150]) glow.add(c.x + dx, yB, -10 + 24, 11, 11, 8, g0, 1.7 + 0.3 * st);
        glow.add(c.x, yB + 196, -10 + 22, 18, 18, 14, g0, 1.6);
      } else {
        const yBreak = yB + (CH.HANG || 1100);
        lines.seg(c.x, yT, c.x, yBreak, 40, g0, 0.1, -35);
        glow.add(c.x + 10, yBreak - 70, 8, 14, 14, 10, '#ff9a3a', 1.2 + 0.4 * st); // (the broken end smoulders)
        const inf = chainInfo.get(c), sk = inf && inf.t0 >= 0 ? Math.floor((t - inf.t0) * 8) : 99;
        if (sk >= 0 && sk < 3) glow.add(c.x, yBreak - 30, 30, 70 - 18 * sk, 70 - 18 * sk, 14, '#fff0c8', 3.2 - sk * 0.8); // D3: the snap's white-hot flare, three keys
      }
    }

    // -- the grapples: a rope from the plaza to the hook on the keel, sagging as the climber does (the sim's own arc)
    for (const z of ring.zips || []) {
      if (!z.grapple || !fin(z.x0) || !fin(z.y0) || !fin(z.x1) || !fin(z.y1)) continue;
      const x0 = z.x0, y0 = -z.y0, x1 = z.x1, y1 = -z.y1;
      let px = x0, py = y0;
      for (let i = 1; i <= 10; i++) {
        const s = i / 10, qx = x0 + (x1 - x0) * s, qy = y0 + (y1 - y0) * s - Math.sin(s * PI) * 60;
        lines.seg(px, py, qx, qy, 10, '#5b3d22', 1, 28);
        px = qx; py = qy;
      }
      lines.seg(x1 - 40, y1 - 40, x1, y1, 13, '#2a2630', 1, 29); lines.seg(x1 + 40, y1 - 40, x1, y1, 13, '#2a2630', 1, 29); // the hook
      lines.seg(x1, y1, x1, y1 + 22, 13, '#2a2630', 1, 29);
    }
    lines.end(); glow.end();

    // -- the gatehouse braziers in the dark: a halo each key (the castle's own fire is the vfx's)
    if (castle && castle.fires && Pt && look.vfx !== false && newKey && nightK > 0.15) {
      for (const b of castle.fires) { if (b.f && b.f.down) continue; if (!near(b.x)) continue; Pt.spawn('flash', b.x, b.y + 40, b.z + 30, { size: 300 + 120 * nightK, life: 0.13, size1: 1, color: '#ff9a3a', hdr: 1.1, alpha: 0.5 * nightK }); }
    }
    stats.ms = performance.now() - t0;
  }
  return {
    update, stats, root,
    dispose() { disposeKit(); if (dyn) { dyn.removeFromParent(); dyn.traverse((o) => o.geometry && o.geometry.dispose()); } for (const f of falls) { if (f.mesh) f.mesh.removeFromParent(); if (f.top) f.top.g.removeFromParent(); } glow.dispose(); lines.dispose(); parent.remove(root); },
  };
}
