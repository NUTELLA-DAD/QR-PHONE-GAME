// THE TREASURE'S KIT (CASTLE.md A2 in 3D, config.TREASURE3D; 3D.md section 34): the models of the outposts' loot. Everything is rigid and held; treasure3d.js decides which pose is shown on 8 fps keys.
// Coordinates of a model: x right, y up, z toward the viewer, the foot of the thing at (x, y0, z) given by the caller. Geometry never throws: sizes are clamped.
//   buildChestGeo(C)         -> ONE doubled geometry (style.js inkDouble: the picture and its ink in one mesh) of a treasure chest (84 wide, 52 tall, 52 deep, its feet at y 0, its front toward +z); instanced
//   buildSackGeo(C)          -> the same for a sack of gold with coins at its foot (about 64 wide, 66 tall)
//   vault(B, C, x, y0, z, open, loot)   pushes the vault into a Batch: a stone strongroom with a pitched slab roof, an arched doorway and an iron door that swings open about its left hinge (open 0 shut .. 1 wide)
import { Batch, inkDouble } from './style.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { config } from '../../config.js';

const PI = Math.PI;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const COLS = () => (config.TREASURE3D && config.TREASURE3D.COL) || {};

function finish(B) {
  const g = mergeGeometries(B.parts, false);
  for (const p of B.parts) p.dispose();
  return inkDouble(g);
}

// ---- the chest: a plank body, a round lid, two iron bands over both, a gold clasp and gold corner studs ----------------------------------------------------------------------------------------------
export function buildChestGeo(C = COLS()) {
  const B = new Batch(), wood = C.WOOD || '#a66f3c', dark = C.WOOD_DARK || '#7a4a26', iron = C.IRON || '#4a4036', gold = C.GOLD || '#ffd23f';
  const W = 84, D = 52, H = 34;
  B.box(wood, 0, H / 2, 0, W, H, D, 2.2); // the body
  B.box(dark, 0, H * 0.34, D / 2 + 0.4, W + 0.4, 2.2, 0.8, 0); // two plank seams across the front
  B.box(dark, 0, H * 0.68, D / 2 + 0.4, W + 0.4, 2.2, 0.8, 0);
  B.cyl(dark, 0, H, 0, 17.5, W, 2.2, 0, 0, PI / 2, D / 2); // the lid: a half round (its lower half is inside the body)
  for (const s of [-1, 1]) { // the bands, round the body and over the lid
    B.box(iron, s * 25, H / 2, 0, 8, H + 1.2, D + 1.6, 1.2);
    B.cyl(iron, s * 25, H, 0, 18.4, 8, 1.2, 0, 0, PI / 2, D / 2 + 0.9);
  }
  B.box(gold, 0, H + 2, D / 2 + 1.4, 15, 19, 5, 1.4); // the clasp on the lid's lip
  B.box(iron, 0, H - 4.5, D / 2 + 3.6, 5, 6, 2.4, 0.6); // its keyhole
  for (const sx of [-1, 1]) B.sphere(gold, sx * (W / 2 - 4), 5, D / 2 + 0.6, 4.2, 4.2, 4.2, 1, true); // corner studs
  return finish(B);
}

// ---- the sack of gold: a tied sack, a knot of rope, gold coins and a bar at its foot -------------------------------------------------------------------------------------------------------------------------------------
export function buildSackGeo(C = COLS()) {
  const B = new Batch(), sack = C.SACK || '#c9a66b', rope = C.ROPE || '#7a5a34', gold = C.GOLD || '#ffd23f';
  B.sphere(sack, 0, 24, 0, 27, 24, 24, 2.2); // the belly
  B.cone(sack, 0, 52, 0, 12, 22, 2, 0, 0, 0); // the gathered neck
  B.cyl(rope, 0, 46, 0, 12.5, 5, 1, 0, 0, 0); // the tie
  B.cone(sack, -5, 66, 1, 6, 12, 1.4, 0, 0, 0.45); // two frayed ends
  B.cone(sack, 6, 65, -1, 6, 11, 1.4, 0, 0, -0.5);
  B.sphere(gold, 0, 30, 21, 9, 9, 3, 1, true); // a coin on the belly
  B.cyl(gold, -31, 4, 16, 9, 3.6, 1.2, PI / 2, 0, 0.35); // coins spilled at the foot (flat discs, facing us)
  B.cyl(gold, -22, 3, 24, 8.5, 3.4, 1.2, PI / 2, 0, -0.25);
  B.cyl(gold, 30, 4, 18, 9, 3.6, 1.2, PI / 2, 0, -0.4);
  B.box(gold, 26, 6, 26, 22, 9, 10, 1.4, 0, 0.35, 0); // a bar
  return finish(B);
}

// ---- the vault ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// A stone strongroom on a plinth, 240 wide and 154 tall, with a pitched slab roof, a doorway in its front and an iron door on a left hinge. x, y0 = the foot, z = the middle of its depth. open: 0 shut .. 1 wide.
// loot: gold bars and coins lie in the doorway while chests are left inside.
export const VAULT = { W: 240, D: 90, H: 142, DOOR_W: 84, DOOR_H: 96 };
export function vault(B, C, x, y0, z, open, loot) {
  const stone = C.STONE || '#9d9481', shade = C.SHADE || '#7d745f', trim = C.TRIM || '#665e50', door = C.DOOR || '#58565e', strap = C.STRAP || '#34323a', dark = C.DARK || '#231e1b', gold = C.GOLD || '#ffd23f';
  const { W, D, H, DOOR_W, DOOR_H } = VAULT, base = 22, zf = z + D / 2; // zf = the front face
  B.box(shade, x, y0 + base / 2 - 28, z, W + 38, base + 56, D + 10, 2.4); // the plinth: a deep foundation (sunk into the ground, and the ground may slope away under it)
  B.box(stone, x, y0 + base + H / 2, z, W, H, D, 2.6); // the walls
  for (const k of [0.27, 0.54, 0.8]) B.box(shade, x, y0 + base + H * k, z, W + 1.6, 3.4, D + 1.6, 0); // courses of stone
  for (const sx of [-1, 1]) B.box(trim, x + sx * (W / 2 - 6), y0 + base + H / 2, zf + 1, 12, H, 4, 1); // the corner quoins
  for (const k of [0.22, 0.66]) B.box(strap, x, y0 + base + H * k, zf + 0.4, W - 4, 7, 2.6, 1); // two iron straps across the front, with rivets on them
  for (const sx of [-1, 1]) { B.box(strap, x + sx * (W / 2 - 24), y0 + base + H / 2, zf + 0.9, 9, H - 2, 3, 1); for (const k of [0.22, 0.66]) B.sphere('#d8dfe6', x + sx * (W / 2 - 24), y0 + base + H * k, zf + 3, 4.2, 4.2, 2.4, 0.8, true); }
  B.cyl(gold, x, y0 + base + H - 14, zf + 3, 13, 5, 1.4, PI / 2, 0, 0); // a gold coin over the door: a vault, plainly
  const roofY = y0 + base + H; // the pitched slab roof: two leaves leaning together, a ridge between them
  for (const s of [-1, 1]) B.box(trim, x + s * (W / 4 + 8), roofY + 18, z, W / 2 + 34, 12, D + 26, 2, 0, 0, -s * 0.28);
  B.box(shade, x, roofY + 31, z, W * 0.78, 9, D + 18, 1.6, 0, 0, 0); // the ridge cap
  // the doorway: a stone surround and a dark recess in the front
  const dx = x, dy = y0 + base + DOOR_H / 2 + 2;
  B.box(dark, dx, dy, zf + 1.6, DOOR_W, DOOR_H, 2, 0);
  B.sphere(dark, dx, dy + DOOR_H / 2, zf + 1.6, DOOR_W / 2, 18, 2, 0, true); // the arched top of it
  for (const s of [-1, 1]) B.box(trim, dx + s * (DOOR_W / 2 + 7), dy, zf + 3, 14, DOOR_H + 6, 7, 1.4);
  B.box(trim, dx, dy + DOOR_H / 2 + 9, zf + 3, DOOR_W + 28, 16, 7, 1.4); // the lintel
  B.box(shade, dx, y0 + base + 3, zf + 5, DOOR_W + 30, 6, 12, 1.2); // the step
  if (loot) { // gold in the doorway
    for (const [gx, gy, gw, gr] of [[-24, 7, 24, 0.08], [3, 7, 26, -0.05], [-9, 19, 24, 0.12]]) B.box(gold, dx + gx, y0 + base + 6 + gy, zf + 6, gw, 10, 12, 1.4, 0, 0, gr);
    B.cyl(gold, dx + 26, y0 + base + 12, zf + 10, 9, 3.6, 1.1, PI / 2, 0, 0.2);
    B.cyl(gold, dx - 34, y0 + base + 11, zf + 9, 8.5, 3.4, 1.1, PI / 2, 0, -0.3);
  }
  // the iron door: hinged on its left jamb, swinging out toward us and round to lie almost flat on the wall to the left as it opens (open 1 = 149 degrees)
  const a = clamp(open, 0, 1) * 2.6, hx = dx - DOOR_W / 2, dw = DOOR_W + 2, hz = zf + 6;
  const cx = hx + Math.cos(a) * dw / 2, cz = hz + Math.sin(a) * dw / 2, ry = -a;
  const put = (col, lx, ly, w, h, d, ow = 0) => { // a piece in the door's own frame (lx along the leaf, ly up, d thick toward +z), turned with it
    const px = hx + Math.cos(a) * lx, pz = hz + Math.sin(a) * lx;
    B.box(col, px, dy + ly, pz, w, h, d, ow, 0, ry, 0);
  };
  B.box(door, cx, dy, cz, dw, DOOR_H + 2, 7, 2, 0, ry, 0); // the leaf
  for (const ly of [-DOOR_H * 0.34, 0, DOOR_H * 0.34]) put(strap, dw / 2, ly, dw - 4, 9, 9.4, 1); // three straps across it
  for (const lx of [10, dw - 10]) for (const ly of [-DOOR_H * 0.34, 0, DOOR_H * 0.34]) put('#d8dfe6', lx, ly, 5, 5, 11.4, 0.6); // rivets
  put(gold, dw * 0.74, -4, 15, 15, 11, 1.2); // the lock plate
  put(dark, dw * 0.74, -4, 4, 8, 12, 0); // its keyhole
  for (const ly of [-DOOR_H * 0.34, DOOR_H * 0.34]) B.box(strap, hx - 2, dy + ly, hz - 1, 8, 14, 10, 1); // the hinges
  void zf;
}

