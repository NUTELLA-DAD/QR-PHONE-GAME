// THE LINES AND BUBBLES OF THE WORLD (WP9): what the 2D game drew as strokes and glows over the sky, drawn here from the same state (read only) with the shared line pool (lines3d.js):
//   the sniper's red warning line (thin while it charges, thick and flashing when it locks) and its beam, a fighter's line of fire, a turret's dotted aim line, the harpoon tug's cable to its hook,
//   towlines between ships (sagging when slack, amber when taut), the gunship's grapple rope and the crewmen swinging on it, the coil's aim line and its charging glow, the Deflector SHIELD (a cyan toon
//   bubble with a bright rim and a stepped shimmer), and in Versus the WIND WALL (dusk-blue slabs and wind streaks beyond the arena).
// NO WOBBLE: every flicker is a held key (8 fps). A rope's sag is a fixed curve from the game's slack, not a swinging one.
//   createWorldObjects(root, state, api) -> { update(t, dt, cam), stats }
//   api = { shipPoint(ship, x, y, z), modelOf(ship) -> the ship's 3D model | null, crew(key) -> { x, y, z } | null, mainShip() }
import { THREE, glow } from './style.js';
import { config } from '../../config.js';
import { createLines } from './lines3d.js';
import { aimToWorld, toWorldX, toWorldY } from '../host/pose.js';
import { shipGeom } from '../host/gunship.js';

const PI = Math.PI;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fin = (n, d = 0) => (Number.isFinite(n) ? n : d);
const RED = '#ff2840', RED_HOT = '#ff6478', WHITE = glow('#ffffff', 1.4); // (the warning lines are plain bright red: HDR would wash them out to pink)

export function createWorldObjects(root, state, api = {}) {
  const lines = createLines(root, 700); // (over everything: signals)
  const back = createLines(root, 120, { depth: true, order: 3 }); // (behind the ships: the wind streaks)
  let K = 0;
  const stats = { shields: 0, tows: 0 };

  // ---- the Deflector shield: a curved patch of bubble round the ship's oval, one per ship -------------------------------------------------------------------------------------------------------------
  const NU = 22, NV = 5;
  const shields = new Map(); // ship id -> { mesh, pos, mat }
  const SHIELD_ALPHA = [0.2, 0.3, 0.25, 0.34];
  const makeShield = () => {
    const pos = new Float32Array((NU + 1) * (NV + 1) * 3);
    const idx = [];
    for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) { const a = i * (NV + 1) + j, b = (i + 1) * (NV + 1) + j; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({ color: '#78dcff', transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    return { mesh, pos, mat, geo: g };
  };
  const syncShield = (sh) => {
    const S = sh.ctx && sh.ctx.shield, L = sh.layout && sh.layout.shield, model = api.modelOf && api.modelOf(sh);
    let rec = shields.get(sh.id);
    if (!(S && S.on && L && model) || sh.ctx.wreck) { if (rec) rec.mesh.visible = false; return; }
    if (!rec) { rec = makeShield(); shields.set(sh.id, rec); root.add(rec.mesh); }
    rec.mesh.visible = true;
    // the patch is written in the ship's own 3D frame (content-local) and carried by the ship's matrix
    model.content.updateMatrixWorld(true);
    rec.mesh.matrixAutoUpdate = false;
    rec.mesh.matrix.copy(model.content.matrixWorld);
    rec.mesh.matrixWorldNeedsUpdate = true;
    const span = Number(config.SHIELD.SPAN) || 0.42, zExt = (model.W || 120) * 0.95, ang = fin(S.ang);
    let o = 0;
    for (let i = 0; i <= NU; i++) {
      const a = ang - span + (2 * span * i) / NU;
      for (let j = 0; j <= NV; j++) {
        const zf = (j / NV) * 2 - 1, k = 1 - 0.1 * zf * zf, r = (1 + 0.04 * (1 - zf * zf)); // (the edges curl in, the middle bulges: a rigid cap)
        rec.pos[o++] = model.X(L.cx + L.rx * Math.cos(a) * k * r);
        rec.pos[o++] = model.Y(L.cy + L.ry * Math.sin(a) * k * r);
        rec.pos[o++] = zf * zExt;
      }
    }
    rec.geo.attributes.position.needsUpdate = true;
    const f = clamp(fin(S.flash), 0, 1);
    rec.mat.opacity = SHIELD_ALPHA[K & 3] * (1 + f * 1.2); // (a shimmer: four held opacities, brighter while it blocks)
    rec.mat.color.set(f > 0.3 ? '#d8f6ff' : '#78dcff');
    // the rim: a bright band along the oval (the 2D band's three layers), in the world
    const pts = [];
    for (let i = 0; i <= NU; i++) { const a = ang - span + (2 * span * i) / NU, q = api.shipPoint(sh, L.cx + L.rx * Math.cos(a), L.cy + L.ry * Math.sin(a), 0); if (q) pts.push(q); }
    for (let i = 1; i < pts.length; i++) {
      lines.seg(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], 22, '#78dcff', 0.22 + f * 0.3, 80);
      lines.seg(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], 9, WHITE, 0.55 + f * 0.4 + (K & 1 ? 0.12 : 0), 82);
    }
    stats.shields++;
  };

  // ---- the lightning coil: its aiming line while it charges and a glow that grows with the charge -------------------------------------------------------------------------------------------------
  const halos = new Map();
  const CYAN = glow('#a0ebff', 1.3);
  const syncCoil = (sh) => {
    const C = sh.ctx && sh.ctx.coil, M = sh.layout && sh.layout.coil, model = api.modelOf && api.modelOf(sh);
    if (!(C && M && model)) return;
    const c = clamp(fin(C.charge), 0, 1), tip = model.dyn && model.dyn.coil;
    if (tip && tip.material) {
      tip.scale.setScalar(1 + c * 0.9);
      tip.material.color.set('#9dd6e3').multiplyScalar(1 + c * 1.6); // (HDR: it crosses the bloom threshold as it charges)
      let h = halos.get(sh.id);
      if (!h) { h = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: '#a0ebff', transparent: true, opacity: 0.2, depthWrite: false })); h.scale.setScalar(26); tip.add(h); halos.set(sh.id, h); }
      h.scale.setScalar(1.8 + c * 3.6);
      h.material.opacity = 0.14 + 0.2 * c;
    }
    if (C.charging) {
      const a = api.shipPoint(sh, M.x, M.y - 60, 0);
      if (a) {
        const wa = -aimToWorld(sh, fin(C.aim)); // (C.aim is in ship space; the line is in the world, and the 3D y points up)
        lines.dashed(a[0], a[1], a[0] + Math.cos(wa) * 2400, a[1] + Math.sin(wa) * 2400, 4 + 10 * c, CYAN, 26, 20, 0.3 + 0.5 * c, 70, (K & 3) * 11);
      }
    }
  };

  // ---- towlines (towing.js state.tows) and the gunship's grapple ---------------------------------------------------------------------------------------------------------------------------------
  const sagPoly = (ax, ay, ex, ey, sag, n = 14) => { // a quadratic curve that hangs `sag` below the straight line
    const out = [];
    for (let i = 0; i <= n; i++) { const u = i / n, v = 1 - u; out.push([v * v * ax + 2 * u * v * ((ax + ex) / 2) + u * u * ex, v * v * ay + 2 * u * v * ((ay + ey) / 2 - sag) + u * u * ey]); }
    return out;
  };
  const syncTows = () => {
    for (const t of state.tows || []) {
      const A = api.shipPoint(t.a, fin(t.from && t.from.x), fin(t.from && t.from.y), 0), B = api.shipPoint(t.b, fin(t.to && t.to.x), fin(t.to && t.to.y), 0);
      if (!A || !B) continue;
      const f = t.fly > 0 ? Math.min(1, fin(t.t) / t.fly) : 1; // (the grapple is still flying: the line pays out)
      const ex = A[0] + (B[0] - A[0]) * f, ey = A[1] + (B[1] - A[1]) * f;
      const slack = t.fly > 0 ? 0.12 : Math.max(0, 1 - fin(t.d) / Math.max(1, fin(t.len, 1))) * 0.35, sag = Math.hypot(ex - A[0], ey - A[1]) * slack;
      const pts = sagPoly(A[0], A[1], ex, ey, sag);
      const col = t.tension > 0.5 ? '#f2b04a' : '#d6bf8a';
      for (let i = 1; i < pts.length; i++) { lines.seg(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], 8.5, '#1b1410', 1, 40); lines.seg(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], 4.4, col, 1, 42); }
      for (const [dx, dy] of [[-12, 8], [12, 8], [0, -12]]) lines.seg(ex, ey, ex + dx, ey + dy, 5, '#8a8588', 1, 44); // the grapple: three little claws
      stats.tows++;
    }
    const g = state.gunship, ours = state.ships[0];
    if (g && g.rope && g.ship && g.bp && ours) {
      const A = api.shipPoint(g.ship, g.bp.anchor.x, g.bp.anchor.y, 0), BOW = shipGeom(ours.layout).BOW, B = api.shipPoint(ours, BOW.x, BOW.y, 0);
      if (A && B) {
        const len = Math.hypot(A[0] - B[0], A[1] - B[1]), slack = Math.max(0, (g.ropeLen || len) - len), sag = Math.min(160, Math.sqrt(slack * 400)) * (1 - 0.9 * Math.min(1, g.tension || 0));
        const pts = sagPoly(A[0], A[1], B[0], B[1], sag * 2);
        const hot = g.tension > 0.6 && (K & 1);
        for (let i = 1; i < pts.length; i++) { lines.seg(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], 6, '#1b1410', 1, 40); lines.seg(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], g.tension > 0 ? 3.6 : 3, hot ? '#ffffff' : '#d8c79a', 1, 42); }
        lines.seg(A[0] - 7, A[1], A[0] + 7, A[1], 14, '#8a8a8a', 1, 44);
        for (const p of Object.values(state.players)) { // a crewman swinging across hangs on a line from the yardarm
          if (!p.swing) continue;
          const c = api.crew && api.crew(p.id);
          if (c) lines.seg(A[0], A[1], c.x, c.y + 90, 3, '#d8c79a', 1, 42);
        }
      }
    }
  };

  // ---- the enemies' warning lines ---------------------------------------------------------------------------------------------------------------------------------------------------------
  const syncWarnings = () => {
    const E = state.enemy; // the Devil's fighter on a strafing run: its line of fire
    if (E && !(E.dead > 0) && E.mode === 'run' && E.shots > 0 && E.heading != null && state.phase !== 'lobby') {
      const h = E.heading, dx = Math.cos(h), dy = -Math.sin(h);
      lines.dashed(E.x + dx * 60, -E.y + dy * 60, E.x + dx * 900, -E.y + dy * 900, 4, RED, 30, 24, K & 1 ? 0.75 : 0.45, 60, (K % 6) * 9);
    }
    const S = state.specials;
    if (S) {
      for (const z of S.snipers || []) { // the sniper: a thin tracking line while it charges, a thick flashing one when it locks
        if (z.mode !== 'charge' && z.mode !== 'lock') continue;
        const lock = z.mode === 'lock', dur = lock ? config.SPECIALS.SNIPER_LOCK : config.SPECIALS.SNIPER_CHARGE, k = clamp(1 - fin(z.t) / dur, 0, 1);
        const dx = Math.cos(fin(z.aim)), dy = -Math.sin(fin(z.aim));
        if (lock) lines.seg(z.x, -z.y, z.x + dx * 4200, -z.y + dy * 4200, 22, K & 1 ? WHITE : RED_HOT, 0.95, 62);
        else { lines.seg(z.x, -z.y, z.x + dx * 4200, -z.y + dy * 4200, 5 + 8 * k, RED, 0.3 + 0.4 * k, 62); }
      }
      for (const b of S.beams || []) { // the beam itself: three layers, fading with its time
        const k = clamp(fin(b.t) / 0.35, 0, 1);
        const ca = Math.cos(b.ang), sa = Math.sin(b.ang), x1 = b.x + ca * b.len, y1 = -(b.y + sa * b.len);
        lines.seg(b.x, -b.y, x1, y1, 70 * k + 10, '#ff2840', 0.4 * k, 64);
        lines.seg(b.x, -b.y, x1, y1, 24 * k + 4, RED_HOT, 0.8 * k, 66);
        lines.seg(b.x, -b.y, x1, y1, 8, WHITE, k, 68);
      }
      for (const g of S.tugs || []) { // the harpoon tug's cable to the hook on our hull (flashing red and gold: shoot it)
        if (g.mode !== 'pull' || !g.hook) continue;
        const main = api.mainShip && api.mainShip(), H = main && api.shipPoint(main, g.hook.x, g.hook.y, 0);
        if (!H) continue;
        lines.seg(g.x, -g.y, H[0], H[1], 11, '#241c16', 1, 40);
        lines.dashed(g.x, -g.y, H[0], H[1], 4, K & 2 ? '#ff2e55' : '#f2d36b', 24, 18, 1, 42, 0);
        lines.seg(H[0] - 8, H[1], H[0] + 8, H[1], 17, '#9aa1a6', 1, 44);
      }
    }
    // a turret that is about to fire: its dotted line to where it aims (the red glow round it is scenery.js)
    const course = state.course;
    for (const t of (course && course.turrets) || []) {
      if (t.dead || !t.charging || t.x == null) continue;
      const k = clamp(1 - Math.max(0, fin(t.cd)) / (Number(config.COURSE.TURRET_WARN) || 1), 0, 1), x0 = t.x, y0 = -(t.y + 20 - 26 + 0), a = -fin(t.aim);
      lines.dashed(x0 + Math.cos(a) * 60, y0 + Math.sin(a) * 60, x0 + Math.cos(a) * 700, y0 + Math.sin(a) * 700, 4, RED, 20, 18, 0.4 + 0.5 * k, 60, (K % 4) * 9);
    }
  };

  // ---- Versus: the wind wall. Four slabs beyond the arena's rectangle, a dusk blue that fades toward the middle, and wind streaks sliding in from the wall at a constant speed (held per key) ---------------
  let wall = null;
  const WALL_Z = -300;
  const makeWall = () => {
    const n = 4 * 2 * 4; // four sides x (solid + gradient) x 4 vertices
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 4);
    const idx = [];
    for (let q = 0; q < n / 4; q++) idx.push(q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 4));
    g.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    mat.toneMapped = false;
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    return { mesh, pos, col, geo: g };
  };
  const syncWall = (cam) => {
    const M = state.match, R = M && M.on && M.wall && M.phase !== 'lobby' && M.phase !== 'shelf' ? M.wall : null;
    if (!R || !cam) { if (wall) wall.mesh.visible = false; return; }
    if (!wall) { wall = makeWall(); root.add(wall.mesh); }
    wall.mesh.visible = true;
    const s = clamp(fin(M.storm && M.storm.s), 0, 1), a0 = 0.5 + 0.22 * s, IN = 1000, FAR = 4000;
    // the slabs are drawn at WALL_Z, behind the ships: their corners are pushed out from the camera so a point on the wall lines up with the same point on the plane of the game
    const scale = (cam.D + -WALL_Z) / cam.D, px = (x) => cam.x + (x - cam.x) * scale, py = (y) => cam.y + (y - cam.y) * scale;
    const vx0 = cam.x - cam.hw * 1.4 - 300, vx1 = cam.x + cam.hw * 1.4 + 300, vy0 = cam.y - cam.hh * 1.4 - 300, vy1 = cam.y + cam.hh * 1.4 + 300; // (3D: y up)
    const X0 = R.x0, X1 = R.x1, Ytop = -R.y0, Ybot = R.y1 < 1e6 ? -R.y1 : -1e9; // (R is in game coordinates: y down)
    let q = 0;
    const quad = (xa, ya, xb, yb, aStart, aEnd, horizontal) => { // a rectangle; the alpha goes from aStart at its (xa | ya) edge to aEnd at its (xb | yb) edge, across x (horizontal) or y
      const P = [[xa, ya], [xb, ya], [xb, yb], [xa, yb]];
      for (let k = 0; k < 4; k++) {
        const atStart = horizontal ? (k === 0 || k === 3) : (k === 0 || k === 1), al = atStart ? aStart : aEnd;
        wall.pos[(q * 4 + k) * 3] = px(P[k][0]); wall.pos[(q * 4 + k) * 3 + 1] = py(P[k][1]); wall.pos[(q * 4 + k) * 3 + 2] = WALL_Z;
        wall.col[(q * 4 + k) * 4] = 0.0343; wall.col[(q * 4 + k) * 4 + 1] = 0.0423; wall.col[(q * 4 + k) * 4 + 2] = 0.0865; wall.col[(q * 4 + k) * 4 + 3] = al;
      }
      q++;
    };
    const none = (qq) => { for (let k = 0; k < 4; k++) { wall.pos[(qq * 4 + k) * 3] = wall.pos[(qq * 4 + k) * 3 + 1] = 0; wall.pos[(qq * 4 + k) * 3 + 2] = WALL_Z; wall.col[(qq * 4 + k) * 4 + 3] = 0; } };
    const sides = [];
    // left: x < X0 solid, X0 .. X0+IN fading in
    sides.push(vx0 < X0 ? () => { quad(Math.min(vx0, X0 - FAR), vy0, X0, vy1, a0, a0, true); quad(X0, vy0, X0 + IN, vy1, a0, 0, true); } : null);
    sides.push(vx1 > X1 ? () => { quad(X1, vy0, Math.max(vx1, X1 + FAR), vy1, a0, a0, true); quad(X1 - IN, vy0, X1, vy1, 0, a0, true); } : null);
    sides.push(vy1 > Ytop ? () => { quad(vx0, Ytop, vx1, Math.max(vy1, Ytop + FAR), a0, a0, false); quad(vx0, Ytop - IN, vx1, Ytop, 0, a0, false); } : null); // (the ceiling: 3D y up)
    sides.push(Ybot > -1e8 && vy0 < Ybot ? () => { quad(vx0, Math.min(vy0, Ybot - FAR), vx1, Ybot, a0, a0, false); quad(vx0, Ybot, vx1, Ybot + IN, a0, 0, false); } : null);
    for (const f of sides) if (f) f();
    for (let qq = q; qq < 8; qq++) none(qq);
    wall.geo.attributes.position.needsUpdate = true;
    wall.geo.attributes.color.needsUpdate = true;
    // the wind streaks: sliding from the wall toward the middle of the sky; 14 a side, every one at a constant speed, its position held per key
    const ts = K / 8;
    const streak = (horizontal, wallAt, dir) => {
      for (let k = 0; k < 14; k++) {
        const along = (horizontal ? vy0 : vx0) + ((k * 0.6180339 + 0.21) % 1) * (horizontal ? vy1 - vy0 : vx1 - vx0), p = (ts * 0.45 + k * 0.37) % 1, off = dir * (p * (IN + 500) - 250), len = 420 + 160 * ((k * 7) % 3), a = (1 - Math.abs(2 * p - 1)) * 0.8;
        if (horizontal) back.seg(px(wallAt + off), py(along), px(wallAt + off + dir * len), py(along), 14, '#ebf0fa', a, WALL_Z + 6);
        else back.seg(px(along), py(wallAt + off), px(along), py(wallAt + off + dir * len), 14, '#ebf0fa', a, WALL_Z + 6);
      }
    };
    if (vx0 < X0) streak(true, X0, 1);
    if (vx1 > X1) streak(true, X1, -1);
    if (vy1 > Ytop) streak(false, Ytop, -1);
    if (Ybot > -1e8 && vy0 < Ybot) streak(false, Ybot, 1);
  };

  return {
    stats: () => ({ ...stats, lines: lines.count + back.count }),
    // t = seconds, cam = { x, y (the look-at point, 3D: y up), D (the camera's distance), hw, hh (half the visible size) }
    update(t, dt, cam) {
      K = Math.floor(t * 8);
      stats.shields = stats.tows = 0;
      lines.begin(); back.begin();
      try { syncWarnings(); } catch (e) { warn('warnings', e); }
      try { syncTows(); } catch (e) { warn('tows', e); }
      for (const sh of state.ships || []) {
        try { syncShield(sh); } catch (e) { warn('shield', e); }
        try { syncCoil(sh); } catch (e) { warn('coil', e); }
      }
      for (const [id, rec] of shields) if (!(state.ships || []).some((q) => q.id === id)) { rec.mesh.removeFromParent(); rec.geo.dispose(); shields.delete(id); }
      try { syncWall(cam); } catch (e) { warn('wall', e); }
      lines.end(); back.end();
    },
    dispose() { lines.dispose(); back.dispose(); for (const rec of shields.values()) { rec.mesh.removeFromParent(); rec.geo.dispose(); } if (wall) { wall.mesh.removeFromParent(); wall.geo.dispose(); } },
  };
  function warn(what, e) { const m = what + ': ' + String(e && e.message ? e.message : e); if (m !== warn.last) { warn.last = m; console.warn('view3d worldObjects', m); } }
}
void toWorldX; void toWorldY;
