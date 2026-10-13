// THE RING CASTLE (LOOP R1 placeholder -> R2 castle art v2, CASTLE.md). A ring map's castle is drawn here; the 2D fallback draws the faces itself (host/ringArt.js).
//   ON THE STRIP (the flat map frame; the vertex shaders bend it with the strip: ringBend.js): a GATEHOUSE at every face (drum towers with slate roofs, a gate arch, a PORTCULLIS that rises in four steps while the shutter
//   window is open, a DRAWBRIDGE that drops on the first window, braziers, banners), the CURTAIN WALL between them, the specials (a hangar arch, a ballista tower, a trebuchet frame, the covered gallery hoarding), the core
//   glows and warning lamps. castleStrip.js.
//   IN THE CAMERA FRAME (RB.axis(), materials with RING_SKIP): the floating ISLAND with its cliffs and two stepped waterfalls, the INNER WARD (4 towers on the fortress, 3 on the citadel, none on the tower) which
//   turns by -RB.thc about the axis so the towers slide past each other, rope bridges to the gatehouses, aether shards (citadel), and the slim KEEP set back behind the axis with its own CROWN group (the lantern, the
//   gold crown, the great banner) ready for D3's fall. castleWard.js.
//   The Flagship's MOORING ropes (citadel) and the gallery's ZIP-LINES are lines, as before.
// Cheap: ~18 draw calls (the strip: a batch + ink, the dynamic batch + ink, three flag meshes, a glow set; the ward: a batch + ink, the waterfalls, a glow set; the keep: batch + ink; the crown: batch + ink, lantern,
// banner), merged once per map. Rebuilt only when a face falls or a special is wrecked (the static strip) or a portcullis / drawbridge moves a step (the small dynamic batch). Nothing moves on a sine: the glows, the
// banners, the waterfalls and the fire are stepped 8 fps keys (the banners 4 a second).
import { THREE, look, glow } from './style.js';
import { config } from '../../config.js';
import { RB } from './ringBend.js';
import { createLines } from './lines3d.js';
import { createGlowSet, glowDisc, glowDiamond, clamp, fin } from './castleKit.js';
import { buildStrip, buildDynamic, poseFlags } from './castleStrip.js';
import { buildWard, buildFalls, poseFalls, buildKeep, buildCrown, keepRadius } from './castleWard.js';

export function createRingCastle({ parent, state, P }) {
  const K = () => config.RING3D || {};
  const getP = () => { try { return typeof P === 'function' ? P() : P; } catch { return null; } };
  const root = new THREE.Group();
  root.name = 'ringCastle';
  root.visible = false;
  parent.add(root);
  const lines = createLines(root, 40, { depth: true, order: 4 });
  const wardRoot = new THREE.Group(), keepRoot = new THREE.Group(); // (moved to the axis every frame; the ward turns with the ring)
  wardRoot.name = 'castleWardRoot'; keepRoot.name = 'castleKeepRoot';
  root.add(wardRoot, keepRoot);
  const stripGlow = createGlowSet(root, glowDisc(), 24, false), frameGlow = createGlowSet(wardRoot, glowDiamond(), 48, true);
  let ringRef = null, mapKey = '', staticSig = '', dynSig = '', base0 = 0;
  let strip = null, dyn = null, ward = null, falls = null, keep = null, crown = null;
  const eased = new Map(), bridge = new Map(); // face index -> how far the portcullis is up (0..1) / the drawbridge: { t0: the view time its drop began (null = not yet), idx: the held step shown } (D3: config RING3D.SET.BRIDGE.STEPS)
  const stats = { faces: 0, rebuilds: 0, dynRebuilds: 0, ms: 0, tris: 0, fireTried: 0, fireMade: 0, mapMs: 0, staticMs: 0 };
  let lastFire = -1, broken = false, garrisonDraws = false;

  const dropGroup = (g) => { if (!g) return; g.removeFromParent(); g.traverse((o) => { if (o.geometry && !o.userData.keepGeo) o.geometry.dispose(); }); };
  const dropStrip = () => {
    if (strip) { dropGroup(strip.group); for (const f of strip.flags) { f.mesh.removeFromParent(); f.mesh.geometry.dispose(); } }
    strip = null;
  };
  const disposeAll = () => {
    dropStrip(); dropGroup(dyn); dyn = null;
    if (ward) dropGroup(ward.group); ward = null;
    if (falls) { falls.mesh.removeFromParent(); falls.mesh.geometry.dispose(); falls.material.dispose(); } falls = null;
    if (keep) dropGroup(keep.group); keep = null;
    if (crown) { crown.group.removeFromParent(); crown.group.traverse((o) => { if (o.geometry && o !== crown.lantern) o.geometry.dispose(); }); } crown = null;
    staticSig = dynSig = mapKey = '';
  };

  const artOf = (ring) => (K().ART || {})[ring.variant] || (K().ART || {}).fortress || {};
  const gateLevel = (f) => Math.round(clamp(eased.get(f.i) || 0, 0, 1) * 3);
  const bridgeSteps = () => { const s = ((K().SET || {}).BRIDGE || {}).STEPS; return Array.isArray(s) && s.length > 1 ? s : [0, 0.25, 0.6, 1]; };
  const bridgeOf = (f) => { let b = bridge.get(f.i); if (!b) { b = { t0: null, idx: 0 }; bridge.set(f.i, b); } return b; };

  function buildMap(ring, map) {
    const m0 = performance.now();
    disposeAll();
    ringRef = ring;
    mapKey = ring.variant + '|' + ring.R + '|' + ring.xRing + '|' + ring.faces.length;
    base0 = ring.faces.length ? -ring.faces[0].y : -(map.ring.axisY + 1400);
    const A = artOf(ring), k = K();
    ward = buildWard(ring, A, k, base0);
    wardRoot.add(ward.group);
    falls = buildFalls(ring, A, k, base0, wardRoot, map.ring.spires);
    keep = buildKeep(ring, A, k, base0);
    keepRoot.add(keep.group);
    crown = buildCrown(ring, A, k, keep.rk, keep.topR);
    crown.group.position.y = keep.seatY;
    keepRoot.add(crown.group);
    eased.clear(); bridge.clear();
    for (const f of ring.faces) { eased.set(f.i, 0); bridge.set(f.i, { t0: null, idx: f.windows >= 1 && !f.down ? bridgeSteps().length - 1 : 0 }); } // (a bridge that is already down when the map starts just stands down)
    stats.tris = ward.tris + keep.tris + crown.tris;
    stats.mapMs = performance.now() - m0;
  }
  function buildStatic(ring) {
    const m0 = performance.now();
    dropStrip();
    strip = buildStrip(ring, artOf(ring), K(), root);
    root.add(strip.group);
    stats.rebuilds++;
    stats.staticMs = performance.now() - m0;
  }
  function buildDyn(ring) {
    dropGroup(dyn);
    const steps = bridgeSteps();
    dyn = buildDynamic(ring, artOf(ring), (f) => ({ gate: gateLevel(f), bridge: steps[bridgeOf(f).idx] ?? 0 }));
    root.add(dyn);
    stats.dynRebuilds++;
  }

  // D3 THE DRAWBRIDGE DROP: on the first shutter window the leaf is let go and falls in held steps on the 8 fps key (SET.BRIDGE.STEPS: the share of the way down at each key; slow to start, faster, a thud, a small
  // rebound, down). The key it lands on throws dust off the leaf, a flash and a few splinters (the vfx's particles); a bridge that is already down when the map begins just stands down.
  function stepBridge(f, t) {
    const b = bridgeOf(f), steps = bridgeSteps(), last = steps.length - 1;
    if (f.down) { b.idx = 0; b.t0 = null; return; }
    if (f.windows < 1 || b.idx >= last) return;
    if (b.t0 == null) b.t0 = t;
    const idx = clamp(Math.floor((t - b.t0) * 8), 0, last);
    if (idx === b.idx) return;
    const land = steps.findIndex((v) => v >= 1), was = b.idx;
    b.idx = idx;
    if (land >= 0 && was < land && idx >= land) bridgeThud(f);
  }
  function bridgeThud(f) {
    const Pt = getP();
    if (!Pt || look.vfx === false) return;
    const S = (K().SET || {}).BRIDGE || {}, x = f.x, y = -f.y + 34, z = -30 + 26 + 150;
    stats.thuds = (stats.thuds || 0) + 1;
    Pt.burst('dust', x, y + 6, z, Math.max(3, S.DUST || 9), { area: 150, size: [95, 160], size1: 2.2, life: [0.6, 1.1], speed: [90, 320], up: [20, 100], alpha: 0.9, color: '#cdb98f' }); // (a darker tan than the collapse's dust: the gate and the grass behind it are pale)
    Pt.spawn('flash', x, y + 30, z + 20, { size: 360, size1: 1.2, life: 0.09, color: '#ffc860', hdr: 2.6, alpha: 0.95 }); // the thud
    Pt.ring(x, y + 12, z + 10, 420, '#ffd98a', 0.3, { alpha: 0.65 });
    Pt.splinters(x, y + 10, z, 8, { kind: 'wood', speed: [160, 380], up: [80, 220], area: 110 });
  }

  function update({ on, map, night, t = 0, dt = 0.016 }) {
    const t0 = performance.now();
    dt = Math.min(0.1, Math.max(0, dt));
    const ring = on && state.course && state.course.ring && map && map.ring ? state.course.ring : null;
    root.visible = !!ring;
    if (!ring) { if (ringRef) { disposeAll(); ringRef = null; stripGlow.begin(); stripGlow.end(); frameGlow.begin(); frameGlow.end(); } return; }
    const key = ring.variant + '|' + ring.R + '|' + ring.xRing + '|' + ring.faces.length;
    if (key !== mapKey || ring !== ringRef) { // (a new stop on the same kind of ring is a new course.ring: its faces are new objects)
      try { buildMap(ring, map); broken = false; } catch (e) { console.warn('view3d castle build failed', e); disposeAll(); mapKey = key; ringRef = ring; broken = true; } // (a castle that cannot be built is not rebuilt every frame: the ring is just the bent rock)
    }
    if (broken) { root.visible = false; return; }
    const k = K();
    // the portcullis slides up (eased like the 2D game's, drawn in four steps); the drawbridge drops on the first window and stays down
    for (const f of ring.faces) {
      const v = eased.get(f.i) || 0, tgt = !f.down && f.open > 0 ? 1 : 0;
      eased.set(f.i, v + (tgt - v) * Math.min(1, dt * 9));
      stepBridge(f, t);
    }
    const sSig = ring.faces.map((f) => (f.down ? 'x' : 'a') + (f.special.dead ? 'd' : 'a') + (f.gal ? 'g' : '')).join(',') + '|' + look.shadows;
    if (sSig !== staticSig) { staticSig = sSig; dynSig = ''; try { buildStatic(ring); } catch (e) { console.warn('view3d castle strip failed', e); dropStrip(); } }
    const dSig = ring.faces.map((f) => (f.down ? 'x' : gateLevel(f) + '' + bridgeOf(f).idx)).join(',');
    if (dSig !== dynSig) { dynSig = dSig; try { buildDyn(ring); } catch (e) { console.warn('view3d castle gate failed', e); dropGroup(dyn); dyn = null; } }
    // the ward turns with the ring; the keep stands set back behind the axis
    const ax = RB.axis();
    wardRoot.position.set(ax.x, 0, ax.z);
    wardRoot.rotation.y = -RB.thc;
    keepRoot.position.set(ax.x, 0, ax.z - Math.max(0, Number((k.KEEP || {}).BACK) || 0) * ring.R);
    // stepped keys
    const k8 = Math.floor(t * 8), pulse = (k8 & 3) / 3;
    if (strip) poseFlags(strip.flags, t * 4);
    if (crown && crown.flag) poseFlags([crown.flag], t * 4);
    poseFalls(falls, k8);
    // the core glows and the warning lamps (instanced, in the strip's frame)
    stripGlow.begin();
    if (strip) {
      for (const c of strip.cores) {
        const f = c.f; if (f.down) continue;
        const kh = clamp(f.hp / Math.max(1, f.max), 0, 1), open = gateLevel(f) > 0, s = 58 * (0.86 + 0.14 * pulse);
        stripGlow.add(c.x, c.y, c.z, s, s, 8, kh > 0.5 ? '#ffb347' : '#ff5a3c', open ? 2.4 : 0.9 + 0.6 * pulse);
      }
      for (const l of strip.lamps) {
        const f = l.f; if (f.down) continue;
        const green = f.open > 0 && (k8 & 1);
        stripGlow.add(l.x, l.y, l.z, 17, 17, 12, green ? '#7CFC00' : '#d6402f', green ? 1.6 : 1.4);
      }
    }
    stripGlow.end();
    // the ward's braziers and the citadel's shards (the camera frame)
    frameGlow.begin();
    if (ward) {
      for (const g of ward.glows) {
        if (g.kind === 'flame') { const s = [0.85, 1.0, 1.15][(k8 + (g.k | 0) + 3) % 3]; frameGlow.add(g.x, g.y + 16 * s, g.z, g.s * 0.8 * s, g.s * 1.5 * s, g.s * 0.8 * s, '#ff9a3a', 1.7); }
        else if (g.kind === 'shard') frameGlow.add(g.x, g.y, g.z, g.s, g.h, g.s, k.ART && k.ART[ring.variant] ? k.ART[ring.variant].shard : '#8fe6ff', 1.25 + 0.25 * (((k8 >> 1) + (g.k | 0)) % 3) / 2);
      }
    }
    frameGlow.end();
    // fire on the gatehouses' braziers (the vfx's own particles; they bend with the strip)
    const Pt = getP();
    if (Pt && strip && look.vfx !== false && k8 !== lastFire) {
      lastFire = k8;
      for (const b of strip.fires) {
        if (b.f.down || Math.abs(b.x - RB.xc) > 3800) continue;
        stats.fireMade += Pt.burst('fire', b.x, b.y, b.z, 1, { size: [95, 140], size1: 0.55, life: [0.4, 0.62], speed: [4, 22], up: [50, 130], area: 10, drag: 1.4, hdr: 1.6 });
        stats.fireTried++;
      }
    }
    // the ropes: the Flagship's moorings (citadel) and the gallery's zip-lines
    lines.begin();
    const Fc = k.FACE || {}, rope = Fc.ROPE || '#2e2a2a';
    const boss = state.boss;
    if (ring.moor && boss && boss.moor) {
      ring.moor.faces.forEach((fi, i) => {
        const f = ring.faces[fi];
        if (!f) return;
        const top = -f.y + (Fc.H || 760) + 60;
        if (ring.moor.cut[i]) lines.seg(f.x, top, f.x + 20, top - 180, 5, rope, 1, 10);
        else lines.seg(boss.x + (i ? 160 : -160), -(boss.y + 150), f.x, top, 9, rope, 1, 10);
      });
    }
    for (const z of ring.zips || []) if (z.x1 != null && !(z.grapple && garrisonDraws) && fin(z.x0) && fin(z.y0) && fin(z.x1) && fin(z.y1)) lines.seg(z.x0, -z.y0, z.x1, -z.y1, 5, '#a8443f', 1, 20); // (the garrison's grapples are drawn by garrison3d.js when it is on)
    lines.end();
    stats.faces = ring.faces.length;
    stats.ms = performance.now() - t0;
    void night;
  }
  return {
    update, stats, root,
    get flagSpots() { return strip ? strip.flagSpots : []; }, // (D2: where the gatehouses' and the wall towers' flag poles stand, { x, y, z, f, scale }: the garrison's white flags go there)
    get fires() { return strip ? strip.fires : []; }, // (D2: the braziers, { f, x, y, z }: the garrison adds a halo to them in the dark)
    set garrison(v) { garrisonDraws = !!v; }, // (D2: garrison3d.js draws the grapple ropes itself)
    get keep() { return keepRoot; }, // (the whole keep with its crown, standing in the camera frame; ring3d-check reads its position)
    get crown() { return crown ? crown.group : null; }, // (D3: the crown group, origin at the keep's seat; move / turn it to make it fall)
    get ward() { return wardRoot; },
    get fallAngles() { return falls ? falls.angles : []; }, // (x pi: where the two waterfalls are on the ring)
    get crownMeta() { return crown && keep ? { band: crown.band, seatY: keep.seatY, height: crown.height, base0, lantern: crown.lantern, flag: crown.flag } : null; }, // (D3: what setpiece3d.js needs to drop the crown: the gold band's radius, where it sits, the ground (base0 = the platforms' top))
    art: (ring) => artOf(ring), // (D3: the palette, so the collapsing gatehouse is built in the castle's own stone)
    get crownTopY() { return crown ? crown.group.position.y + crown.height : 0; }, // (the world y of the top of the great banner's pole: the crown must stay in the picture)
    keepRadius: () => (ringRef ? keepRadius(ringRef, K()) : 0),
    dispose() { disposeAll(); stripGlow.dispose(); frameGlow.dispose(); lines.dispose(); parent.remove(root); },
  };
}
