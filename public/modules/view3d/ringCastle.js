// THE PLACEHOLDER CASTLE (LOOP R1; R2 replaces it with the real art). A ring map's castle has no drawing in 3D until this: the 2D fallback draws the faces (host/ringArt.js), the 3D view had nothing.
//   * the FACES: a stone block at each face (the keep wall, 880 x 760 px like the 2D one, with battlements) standing on its platform at the plane, a dark ALCOVE with the CORE glowing in it behind a SHUTTER
//     that slides up while the shutter window is open (stepped, in four positions), a warning lamp (red shut / green open), the specials (a hangar shed, a flak battery, a mortar), and the BOARDING GALLERY's
//     ledge with its posts, rail and door. A breached face is a heap of rubble. They are drawn in the flat map frame like every other thing: the vertex shaders bend them with the strip (ringBend.js).
//   * the KEEP: a tall tower (stone body, bands, a cone roof) at the castle's axis. The axis is NOT on the strip, so the keep stands in the camera frame (ringBend RB.axis(), defines RING_SKIP: the shaders
//     leave it alone) and is always behind the ship in the middle of the picture, whatever the angle.
//   * the Flagship's MOORING ropes (citadel) and the gallery's ZIP-LINES, as lines.
// Cheap: the stone blocks are ONE merged mesh + ink shell (rebuilt only when a face falls, a special is wrecked or a shutter moves a step), the keep is one more, the core glows are a few small meshes. Nothing
// here moves on a sine; the lamps and glows pulse on stepped 8 fps keys.
import { THREE, INK, look, Batch, glow, rimify, gradientMap, inkUniforms, INK_GLSL, G } from './style.js';
import { config } from '../../config.js';
import { RB } from './ringBend.js';
import { createLines } from './lines3d.js';

const fin = Number.isFinite;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// A material that the ring bend leaves alone (the keep stands in the camera frame).
const skip = (m) => { m.defines = { ...(m.defines || {}), RING_SKIP: '' }; return m; };
const keepToon = skip(rimify(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap })));
const keepPlain = skip(new THREE.MeshLambertMaterial({ vertexColors: true }));
const keepInk = skip(new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }));
keepInk.onBeforeCompile = (sh) => {
  inkUniforms(sh);
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 onormal;\n' + INK_GLSL).replace('#include <begin_vertex>', 'vec3 transformed = position + inkPush( onormal );');
};
keepInk.customProgramCacheKey = () => 'ink-outline-keep';
keepToon.customProgramCacheKey = () => 'toon-rim-keep';

export function createRingCastle({ parent, state }) {
  const K = () => config.RING3D || {};
  const root = new THREE.Group();
  root.name = 'ringCastle';
  root.visible = false;
  parent.add(root);
  const lines = createLines(root, 40, { depth: true, order: 4 });
  let faceGroup = null, keepGroup = null, sig = '', mapKey = '', ringRef = null;
  const glows = []; // per face: { core: Mesh, lamp: Mesh }
  const eased = new Map(); // face index -> how far the shutter is up (0..1)
  const lampOn = new THREE.MeshBasicMaterial({ color: glow('#7CFC00', 1.6), toneMapped: false }), lampOff = new THREE.MeshBasicMaterial({ color: glow('#d6402f', 1.4), toneMapped: false });
  const coreMat = new THREE.MeshBasicMaterial({ color: glow('#ffb347', 1.2), toneMapped: false });
  const sph = G.sphereLo;
  const stats = { faces: 0, rebuilds: 0, ms: 0 };

  const drop = (g) => { if (!g) return; root.remove(g); g.traverse((o) => { if (o.geometry && !o.userData.keepGeo) o.geometry.dispose(); }); };

  // ---- the keep: built once per map, about the origin (it is moved to the axis every frame) -----------------------------------------------------------------------------------------------------------
  function buildKeep(ring, faces) {
    const k = K().KEEP || {};
    const R = ring.R, r = Math.max(k.MIN_RADIUS || 520, (k.RADIUS || 0.3) * R);
    const surf = faces.length ? faces[0].y : ring.axisY + 1400;
    const yBot = -surf - (k.DOWN || 1500), yTop = -surf + (k.UP || 3300);
    const h = yTop - yBot, B = new Batch();
    const ow = 14;
    B.cyl(k.COLOR || '#9a8f86', 0, yBot + h * 0.35, 0, r, h * 0.7, ow); // the base
    B.cyl(k.COLOR || '#9a8f86', 0, yBot + h * 0.7 + h * 0.15, 0, r * 0.82, h * 0.3, ow); // the shaft
    for (const q of [0.12, 0.42, 0.72]) B.cyl(k.SHADE || '#7c7068', 0, yBot + h * q, 0, r * (q < 0.7 ? 1.05 : 0.88), 90, ow * 0.6); // bands
    B.cyl(k.SHADE || '#7c7068', 0, yTop + 40, 0, r * 0.98, 120, ow); // the gallery under the roof
    B.cone(k.ROOF || '#6f7d93', 0, yTop + 40 + 60 + r * 0.5, 0, r * 1.05, r * 1.0, ow); // the roof
    // windows: small dark slits up the shaft, four sides
    for (let a = 0; a < 4; a++) for (const q of [0.62, 0.8, 0.92]) {
      const ang = a * Math.PI / 2 + 0.4, rr = r * (q < 0.7 ? 1.0 : 0.82) + 4;
      B.box('#2a2430', Math.sin(ang) * rr, yBot + h * q, Math.cos(ang) * rr, 60, 120, 30, 0, 0, ang, 0);
    }
    const g = B.build({ cast: false, receive: false });
    g.traverse((o) => {
      if (!o.isMesh) return;
      if (o.userData.isOutline) o.material = keepInk;
      else { o.userData.toon = keepToon; o.userData.plain = keepPlain; o.material = look.toon ? keepToon : keepPlain; }
      o.frustumCulled = false;
    });
    g.name = 'ringKeep';
    return g;
  }

  // ---- the faces: one merged mesh of stone ----------------------------------------------------------------------------------------------------------------------------------------------------------
  // a face is drawn only once the rock under it is: the terrain streams about +-7200 px round the look-at point, and a block with no platform would float
  const reach = () => Math.max(1500, Number((K().FACE || {}).REACH) || 5500);
  const near = (f) => Math.abs(f.x - RB.xc) < reach();
  function buildFaces(ring, map) {
    const F = K().FACE || {}, W = F.W || 880, H = F.H || 760, Dp = F.DEPTH || 620, zf = -30;
    const stone = F.COLOR || '#a89c90', trim = F.TRIM || '#6d6259', iron = F.SHUTTER || '#403b3a', wood = F.LEDGE || '#8c8279';
    const B = new Batch(), ow = 9;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    for (const f of ring.faces) {
      if (!near(f)) continue;
      const base = -f.y;
      if (f.down) { // rubble
        B.box(trim, f.x - 200, base + 40, zf - 100, 280, 80, 360, ow, 0, 0.2, 0);
        B.box(stone, f.x + 120, base + 70, zf - 90, 340, 140, 380, ow, 0, -0.15, 0.05);
        B.box(trim, f.x - 20, base + 150, zf - 120, 160, 100, 200, ow, 0.1, 0.4, 0);
      } else {
        B.box(stone, f.x, base + H / 2, zf - Dp / 2, W, H, Dp, ow); // the wall
        for (let q = 0; q < 6; q++) B.box(trim, f.x - W / 2 + W / 12 + q * (W / 6), base + H + 32, zf - 50, W / 6 - 34, 64, 100, ow * 0.7); // the battlements
        const c = f.core, open = eased.get(f.i) || 0, lift = Math.round(open * 3) / 3 * (c.h - 40);
        B.box(trim, c.x, -c.y, zf + 4, c.w + 36, c.h + 36, 12, ow * 0.7); // the alcove's frame
        B.box('#241410', c.x, -c.y, zf + 11, c.w, c.h, 6, 0); // its dark back
        B.box(iron, c.x, -c.y + lift, zf + 24, c.w, c.h, 14, ow * 0.7); // the shutter (it slides up out of the way)
        for (let r = 0; r < 4; r++) B.box(trim, c.x, -c.y + lift - c.h / 2 + 40 + r * 78, zf + 33, c.w - 20, 8, 4, 0); // its ribs
      }
      const sp = f.special;
      if (sp.kind === 'gallery' && f.gal && !f.down) {
        const g = f.gal, len = g.x1 - g.x0, mx = (g.x0 + g.x1) / 2, ly = -g.y;
        B.box(wood, mx, ly - 11, -10, len, 22, 220, ow * 0.7); // the ledge
        for (let x = g.x0 + 40; x < g.x1; x += 160) B.rod(trim, V(x, ly - 22, -10), V(x + 90, ly - 170, -10), 9, 0); // the braces
        for (let x = g.x0; x <= g.x1 - 100; x += 100) B.rod(trim, V(x, ly, 90), V(x, ly + 70, 90), 6, 0); // the rail posts
        B.box(trim, (g.x0 + g.x1 - 100) / 2, ly + 70, 90, len - 100, 8, 8, 0);
        B.box('#241410', g.door, ly + 95, zf + 6, 100, 190, 14, ow * 0.7); // the keep door
      } else if (!f.down) {
        const x = sp.x, y = -sp.y;
        if (sp.dead) B.box(trim, x, y + 25, -60, 200, 50, 180, ow * 0.7, 0, 0.3, 0);
        else if (sp.kind === 'hangar') { B.box(stone, x, y + 95, -80, 260, 190, 220, ow); B.box('#1c1520', x, y + 70, 30, 180, 140, 8, 0); B.cone('#3b2c4c', x, y + 190 + 40, -80, 190, 90, ow, 0, 0.785, 0); }
        else if (sp.kind === 'flak') { B.box(stone, x, y + 35, -70, 170, 70, 170, ow); B.rod(iron, V(x, y + 90, -70), V(x + 80, y + 170, -70), 14, ow * 0.5); B.sphere(trim, x, y + 82, -70, 34, 34, 34, ow * 0.5, true); }
        else { B.box(stone, x, y + 30, -70, 190, 60, 170, ow); B.rod(iron, V(x, y + 70, -70), V(x + 40, y + 180, -70), 20, ow * 0.5); }
      }
    }
    const g = B.build({ cast: false, receive: true });
    g.name = 'ringFaces';
    g.traverse((o) => { o.frustumCulled = false; });
    return g;
  }

  // the core glow and the warning lamp of every face: small meshes, kept for the whole map
  function buildGlows(ring) {
    for (const o of glows) { root.remove(o.core); root.remove(o.lamp); }
    glows.length = 0;
    const F = K().FACE || {}, zf = -30;
    for (const f of ring.faces) {
      const c = f.core;
      const core = new THREE.Mesh(sph, coreMat.clone()), lamp = new THREE.Mesh(sph, lampOff);
      core.position.set(c.x, -c.y, zf + 18); core.scale.set(62, 62, 8); // (a flat disc: it sits behind the shutter plate, not through it)
      lamp.position.set(c.x, -c.y + c.h / 2 + 44, zf + 30); lamp.scale.setScalar(16);
      core.frustumCulled = lamp.frustumCulled = false;
      core.renderOrder = 1;
      root.add(core, lamp);
      glows.push({ core, lamp, f });
    }
    void F;
  }

  const levelOf = (f) => Math.round(clamp(eased.get(f.i) || 0, 0, 1) * 3);

  function update({ on, map, night, t = 0, dt = 0.016 }) {
    const t0 = performance.now();
    dt = Math.min(0.1, Math.max(0, dt));
    const ring = on && state.course && state.course.ring && map && map.ring ? state.course.ring : null;
    root.visible = !!ring;
    if (!ring) { if (faceGroup || keepGroup) { drop(faceGroup); drop(keepGroup); faceGroup = keepGroup = null; sig = mapKey = ''; for (const o of glows) { root.remove(o.core); root.remove(o.lamp); } glows.length = 0; } return; }
    const key = ring.variant + '|' + ring.R + '|' + ring.xRing + '|' + ring.faces.length;
    if (key !== mapKey || ring !== ringRef) { // (a new stop on the same kind of ring is a new course.ring: its faces are new objects)
      ringRef = ring;
      mapKey = key; sig = '';
      drop(keepGroup); keepGroup = buildKeep(map.ring, ring.faces); root.add(keepGroup);
      buildGlows(ring);
      eased.clear();
    }
    // the shutters slide (eased like the 2D game's, drawn in four steps)
    for (const f of ring.faces) {
      const v = eased.get(f.i) || 0, tgt = !f.down && f.open > 0 ? 1 : 0;
      eased.set(f.i, v + (tgt - v) * Math.min(1, dt * 9));
    }
    const s = ring.faces.map((f) => (near(f) ? '' : 'n') + (f.down ? 'x' : levelOf(f)) + (f.special.dead ? 'd' : 'a') + (f.gal ? 'g' : '')).join(',') + '|' + look.shadows;
    if (s !== sig) {
      sig = s;
      drop(faceGroup); faceGroup = buildFaces(ring, map); root.add(faceGroup);
      stats.rebuilds++;
    }
    // the keep stands at the axis, in the camera frame
    if (keepGroup) { const ax = RB.axis(); keepGroup.position.set(ax.x, 0, ax.z); keepGroup.visible = true; }
    // the glows: stepped on 8 fps keys (a pulse is a held key, not a sine)
    const k8 = Math.floor(t * 8), pulse = (k8 & 3) / 3;
    for (const o of glows) {
      const f = o.f, c = f.core, kh = clamp(f.hp / Math.max(1, f.max), 0, 1), open = (eased.get(f.i) || 0) > 0.05;
      const here = near(f);
      o.core.visible = !f.down && here;
      o.lamp.visible = !f.down && here;
      if (f.down || !here) continue;
      o.core.scale.set(58 * (0.86 + 0.14 * pulse), 58 * (0.86 + 0.14 * pulse), 8);
      o.core.material.color.set(kh > 0.5 ? '#ffb347' : '#ff5a3c').multiplyScalar(open ? 2.4 : 0.9 + 0.6 * pulse);
      o.lamp.material = f.open > 0 ? (k8 & 1 ? lampOn : lampOff) : lampOff;
      void c;
    }
    // the ropes: the Flagship's moorings (citadel) and the gallery's zip-lines
    lines.begin();
    const Fc = K().FACE || {}, rope = Fc.ROPE || '#2e2a2a';
    const boss = state.boss;
    if (ring.moor && boss && boss.moor) {
      ring.moor.faces.forEach((fi, k) => {
        const f = ring.faces[fi];
        if (!f || !near(f)) return;
        const top = -f.y + (Fc.H || 760) + 60;
        if (ring.moor.cut[k]) lines.seg(f.x, top, f.x + 20, top - 180, 5, rope, 1, 10);
        else lines.seg(boss.x + (k ? 160 : -160), -(boss.y + 150), f.x, top, 9, rope, 1, 10);
      });
    }
    for (const z of ring.zips || []) if (z.x1 != null && fin(z.x0) && fin(z.y0) && fin(z.x1) && fin(z.y1)) lines.seg(z.x0, -z.y0, z.x1, -z.y1, 5, '#a8443f', 1, 20);
    lines.end();
    stats.faces = ring.faces.length;
    stats.ms = performance.now() - t0;
    void night;
  }
  return { update, stats, root, get keep() { return keepGroup; }, dispose() { drop(faceGroup); drop(keepGroup); lines.dispose(); parent.remove(root); } };
}
