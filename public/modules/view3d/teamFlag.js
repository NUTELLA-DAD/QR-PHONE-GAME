// WP15: THE TEAM PENNANT ON EACH TEAMED SHIP'S MAST (Versus, and any sky with teams; the 2D game's fleetArt.drawPennants). A pole on top of the gasbag and a swallow-tailed flag in the team's colour with a pale stripe,
// streaming toward the stern. RIGID and STEPPED (3D.md section 1): the flag is baked in three poses (its five cloth segments each turned a little about their own hinge, like the gunship's pennant), and the pose that is
// shown changes 8 times a second on a fixed 3-key cycle: no cloth, no sine, no vertex work. Three meshes a ship would be too many, so only the shown pose is visible: the flag costs 4 draw calls a ship (the pole and the pose,
// each with its ink shell). Zoomed far out the whole flag grows (the 2D game does the same), so it still reads from the sofa. A child of the ship's content group, so it leans with her and turns with COME ABOUT.
//   createTeamFlags({ state, models }) -> { update(t, zoom), dispose() }
import { THREE, Batch, tagSmall } from './style.js';
import { config } from '../../config.js';

const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, Number.isFinite(v) ? v : a));
const KEYS = [[0.05, 0.16, 0.24, 0.26, 0.26], [0, -0.1, -0.18, -0.2, -0.14], [-0.06, 0.06, 0.15, 0.2, 0.16]]; // three held poses of the five segments (radians about the vertical hinge)
const SEGS = 5;

const teamColors = (team) => {
  const id = team && (team.id || team);
  const P = config.PVP_ART || {}, T = (config.FLEET && config.FLEET.TEAMS && config.FLEET.TEAMS[id]) || null;
  if (team && typeof team === 'object' && team.color) return { main: team.color, pale: team.pale || '#f2e6c8', dark: team.dark || team.trim || '#3b2a1d' };
  if (T) return { main: T.color, pale: T.pale || '#f2e6c8', dark: T.dark || '#3b2a1d' };
  return id === 'blue' ? { main: P.BLUE || '#4d7fb3', pale: P.BLUE_PALE || '#b3cbe3', dark: P.BLUE_DARK || '#34577d' } : { main: P.RED || '#c4574d', pale: P.RED_PALE || '#e8b7ae', dark: P.RED_DARK || '#8f3a34' };
};

// one pose of the flag: cloth segments (the last one is notched into a swallow tail) and a pale stripe along the middle, in the flag's own frame (+x streams toward the stern, y up)
function poseGroup(col, len, hgt, angles) {
  const b = new Batch(), sl = len / SEGS;
  for (let i = 0; i < SEGS; i++) {
    const u = i / SEGS, h = hgt * (1 - 0.35 * u), a = angles[i], hx = -i * sl, cx = hx - Math.cos(a) * sl * 0.5, cz = Math.sin(a) * sl * 0.5; // (the flag streams toward -x of the content frame: the stern)
    if (i < SEGS - 1) {
      b.box(col.main, cx, -h * 0.5, cz, sl, h, 3.2, 1.2, 0, a, 0);
      b.box(col.pale, cx, -h * 0.5, cz + 0.4, sl, Math.max(3, h * 0.16), 3.8, 0, 0, a, 0); // (the pale stripe)
    } else { // the swallow tail: two points with a notch between them
      for (const s of [0, 1]) {
        const y = s ? -h * 0.84 : -h * 0.16, hh = h * 0.34;
        b.box(col.main, cx, y, cz, sl * 0.86, hh, 3.2, 1, 0, a, 0);
      }
    }
  }
  return tagSmall(b.build({ cast: false, receive: false }));
}

export function createTeamFlags({ state, models }) {
  const recs = new Map(); // ship id -> { model, root, poses[], teamKey, scale }
  const drop = (id, r) => { if (r.root.parent) r.root.parent.remove(r.root); r.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); recs.delete(id); };

  function make(sh, model) {
    const P = (config.PVP_ART && config.PVP_ART.PENNANT) || {};
    const pole = clamp(P.POLE, 40, 300) || 100, len = clamp(P.LEN, 60, 400) || 150, hgt = clamp(P.HEIGHT, 20, 200) || 56;
    const col = teamColors(sh.team);
    const L = model.layout, b = L && L.bounds, bag = (model.dyn && model.dyn.bags && model.dyn.bags[0]) || null;
    const root = new THREE.Group();
    root.name = 'teamFlag';
    // where it stands: on top of the nearest gasbag (a child of the bag's own node, so it swells and sags with it), a little toward the bow of the middle (the nest basket sits there); else on the top of the ship's box
    let parent = model.content, x = 0, y = 0;
    const gb = L && L.gasbags && L.gasbags.length ? L.gasbags : L && L.gasbag ? [L.gasbag] : [];
    if (bag && bag.G) {
      parent = bag.node;
      const rx = bag.G.rx || 300, ry = bag.G.ry || 120;
      x = rx * 0.32;
      const u = x / rx, pw = 2;
      y = ry * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u), pw)), 1 / pw) - 4;
    } else if (b) { x = model.X((b.x0 + b.x1) / 2); y = model.Y(b.y0 + 12); }
    void gb;
    root.position.set(x, y, 0);
    const pb = new Batch();
    pb.rod('#2b2622', V(0, -4, 0), V(0, pole, 0), 2.6, 1.4);
    pb.sphere(col.dark, 0, pole + 6, 0, 6, 6, 6, 1.2, true);
    root.add(tagSmall(pb.build({ cast: false, receive: false })));
    const flagRoot = new THREE.Group();
    flagRoot.position.set(0, pole - 2, 0);
    const poses = KEYS.map((ang) => { const g = poseGroup(col, len, hgt, ang); g.visible = false; flagRoot.add(g); return g; });
    root.add(flagRoot);
    parent.add(root);
    return { model, root, poses, teamKey: JSON.stringify(sh.team && (sh.team.id || sh.team.color)), scale: 1, shown: -1 };
  }

  const update = (t, zoom = 1) => {
    const live = new Set();
    for (const sh of state.ships) {
      if (!sh.team || sh.ai) continue;
      const e = models.get(sh.id);
      if (!e || !e.model || !e.model.content) continue;
      live.add(sh.id);
      let r = recs.get(sh.id);
      const tk = JSON.stringify(sh.team && (sh.team.id || sh.team.color));
      if (r && (r.model !== e.model || r.teamKey !== tk)) { drop(sh.id, r); r = null; }
      if (!r) { try { r = make(sh, e.model); recs.set(sh.id, r); } catch (err) { if (!update.warned) { update.warned = true; console.warn('view3d teamFlag', err); } continue; } }
      const nz = ((config.CAMERA && config.CAMERA.VERSUS) || {}).NAME_ZOOM || 0, sc = nz && zoom > 0 && zoom < nz ? clamp(nz / zoom, 1, 2.6) : 1;
      if (sc !== r.scale) { r.scale = sc; r.root.scale.setScalar(sc); }
      const k = Math.floor(t * 8) % 3;
      if (k !== r.shown) { r.poses.forEach((g, i) => { g.visible = i === k; }); r.shown = k; }
    }
    for (const [id, r] of recs) if (!live.has(id)) drop(id, r);
  };
  const dispose = () => { for (const [id, r] of [...recs]) drop(id, r); };
  return { update, dispose, recs };
}
