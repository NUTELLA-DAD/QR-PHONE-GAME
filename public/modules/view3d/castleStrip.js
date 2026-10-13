// THE CASTLE ON THE STRIP (LOOP R2 / CASTLE.md): what stands on the bent strip, in the flat map frame (the vertex shaders wrap it into the ring, ringBend.js).
//   * a GATEHOUSE at every face: the gate block (880 x 760 px like the 2D wall) with a pointed-round gate arch, the two drum towers (slate roofs, machicolated galleries, arrow slits), braziers, an Ember Pact roundel,
//     a back door for the bridge; the PORTCULLIS (an iron grate that rises in four steps while the shutter window is open: the same `levelOf`) and the DRAWBRIDGE (raised until the first window, then down) are the DYNAMIC batch;
//   * the CURTAIN WALL between the faces (on the island's rim, behind the platforms): battlements, arrow slits, a walkway top, buttresses, wall towers; cut into 330 px pieces because the bend only moves vertices;
//   * the specials: a hangar arch, a ballista tower, a trebuchet frame, the covered gallery HOARDING (the sim's gal x / y exactly: the deck's top is the ledge crewmen stand on);
//   * the banners (three baked poses, phased per face, held on 8 fps keys) and the braziers (the vfx's fire).
// Everything is merged: the static batch (rebuilt only when a face falls or a special is wrecked), the dynamic batch (a few boxes a face), three flag meshes. Nothing moves on a sine.
import { THREE, Batch, toonVC, plainVC, look } from './style.js';
import { tcyl, cone, disc, diamond, flagPoses, mergeFlags, disposeFlagPoses, plainify, buildBatch, V3, PI, TAU } from './castleKit.js';

const ZF = -30; // the front plane of a gate block (the 2D wall's plane)

// ---- one drum tower (gatehouse, wall and ward towers share it) ------------------------------------------------------------------------------------------------------------------
// cx, cz = its axis, y0 = the foot, r = radius, h = height of the wall under the machicolation. o = { seg, ow, roof: 'cone' | 'spire' | 'crown', roofH, slits: [[angle, share of h]], all: windows round the whole tower (the ward) }.
// Returns the height of its apex (for a flag pole).
export function drumTower(B, A, cx, y0, cz, r, h, o = {}) {
  const seg = o.seg || 12, ow = o.ow == null ? 7 : o.ow;
  tcyl(B, A.shade, cx, y0 + 45, cz, r * 1.0, r * 1.16, 90, seg, ow); // the battered foot
  tcyl(B, A.stone, cx, y0 + 90 + (h - 90) / 2, cz, r * 0.96, r * 1.0, h - 90, seg, ow); // the body
  tcyl(B, A.trim, cx, y0 + h * 0.46, cz, r * 1.04, r * 1.04, 24, seg, ow * 0.6); // a string course
  // slits and windows (dark boxes turned to face outward)
  const dark = A.glass, put = (ang, yy, w, hh, rad = 0.985) => B.box(dark, cx + Math.sin(ang) * r * rad, yy, cz + Math.cos(ang) * r * rad, w, hh, 10, 0, 0, ang, 0);
  if (o.all) {
    const n = o.all;
    for (let k = 0; k < n; k++) for (const q of [0.3, 0.62]) put((k + (q > 0.5 ? 0.5 : 0)) * TAU / n, y0 + h * q, 18, 78);
  } else for (const [ang, q] of o.slits || [[-0.5, 0.3], [0.5, 0.3], [0, 0.62]]) put(ang, y0 + h * q, 16, 74);
  // the machicolated gallery: a flared collar with dark gaps between the corbels, then the upper storey
  tcyl(B, A.trim, cx, y0 + h + 35, cz, r * 1.26, r * 1.0, 70, seg, ow);
  const nh = o.all ? 8 : 5;
  for (let k = 0; k < nh; k++) {
    const ang = o.all ? (k + 0.5) * TAU / nh : -1.15 + k * 2.3 / (nh - 1);
    B.box(dark, cx + Math.sin(ang) * r * 1.2, y0 + h + 30, cz + Math.cos(ang) * r * 1.2, 22, 34, 8, 0, 0, ang, 0);
  }
  tcyl(B, A.stone, cx, y0 + h + 70 + 45, cz, r * 1.26, r * 1.26, 90, seg, ow);
  if (o.all) for (let k = 0; k < 5; k++) put((k + 0.25) * TAU / 5, y0 + h + 115, 26, 44, 1.27); else for (const ang of [-0.55, 0, 0.55]) put(ang, y0 + h + 115, 26, 44, 1.27);
  const top = y0 + h + 160;
  let apex = top;
  if (o.roof === 'crown') { // a crenellated deck instead of a roof
    tcyl(B, A.trim, cx, top + 10, cz, r * 1.34, r * 1.26, 20, seg, ow);
    for (let k = 0; k < 10; k++) { const ang = (k + 0.5) * TAU / 10; B.box(A.stone, cx + Math.sin(ang) * r * 1.2, top + 48, cz + Math.cos(ang) * r * 1.2, r * 0.42, 50, r * 0.2, ow * 0.6, 0, ang, 0); }
    tcyl(B, A.roofDark, cx, top + 30, cz, r * 0.9, r * 0.9, 14, seg, 0);
    apex = top + 80;
  } else {
    const spire = o.roof === 'spire', rh = o.roofH || (spire ? r * 3.6 : r * 1.9), rr = spire ? r * 1.0 : r * 1.46;
    tcyl(B, A.roofDark, cx, top + 11, cz, r * 1.5, r * 1.5, 22, seg, ow * 0.6); // the eaves
    cone(B, A.roof, cx, top + 22 + rh / 2, cz, rr, rh, spire ? 8 : seg, ow);
    apex = top + 22 + rh;
    B.rod(A.iron, V3(cx, apex - 6, cz), V3(cx, apex + 70, cz), 3.4, 0);
    diamond(B, A.gold, cx, apex + 78, cz, 8, 13, 8, 1.4);
  }
  return apex + 70;
}

// the Ember Pact roundel: an oxblood disc with a gold rim and a flame of three tongues (a heraldic flame, nothing real), facing +z at (x, y, z)
function roundel(B, A, x, y, z, r) {
  disc(B, A.gold, x, y, z, r * 1.12, 8, 16, 2.5);
  disc(B, A.banner, x, y, z + 5, r, 8, 16, 0);
  cone(B, A.flame, x, y - r * 0.1, z + 12, r * 0.4, r * 1.25, 6, 0);
  cone(B, '#ffe08a', x, y - r * 0.22, z + 16, r * 0.2, r * 0.7, 6, 0);
  cone(B, A.flame, x - r * 0.42, y - r * 0.2, z + 12, r * 0.2, r * 0.7, 6, 0, 0, 0, 0.45);
  cone(B, A.flame, x + r * 0.42, y - r * 0.2, z + 12, r * 0.2, r * 0.7, 6, 0, 0, 0, -0.45);
}
// a hanging banner (oxblood, gold bar, flame) against a wall or tower, top at (x, yTop), facing +z
export function hanging(B, A, x, yTop, z, w, len, ang = 0) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const at = (lx, lz) => [x + lx * ca + lz * sa, z - lx * sa + lz * ca]; // (a banner facing along `ang` about the vertical axis; ang 0 faces +z)
  let p = at(0, 0);
  B.box(A.woodDark, p[0], yTop + 5, p[1], w + 16, 8, 8, 0, 0, ang, 0);
  p = at(0, 0); B.box(A.banner, p[0], yTop - len / 2, p[1], w, len, 5, 1, 0, ang, 0);
  p = at(0, 3); B.box(A.gold, p[0], yTop - 24, p[1], w, 10, 3, 0, 0, ang, 0);
  p = at(0, 5); cone(B, A.flame, p[0], yTop - len * 0.45, p[1], w * 0.2, w * 0.62, 6, 0);
  p = at(0, 4); cone(B, A.gold, p[0], yTop - len + 14, p[1], w * 0.5, 22, 3, 0, PI);
}
const stone = (B, A, x, y, z, w, h, d, ow = 6) => B.box(A.stone, x, y, z, w, h, d, ow);

// ---- the gatehouse ---------------------------------------------------------------------------------------------------------------------------------------------------------------
function gatehouse(B, A, K, f, out) {
  const F = K.FACE || {}, W = F.W || 880, H = F.H || 760, Dp = F.DEPTH || 620, TX = F.TOWER_X || 560, TR = F.TOWER_R || 165, TH = F.TOWER_H || 880;
  const base = -f.y, x = f.x, c = f.core, cw = c.w + 36, rI = cw / 2;
  stone(B, A, x, base + H / 2, ZF - Dp / 2, W, H, Dp, 9); // the block
  B.box(A.shade, x, base + 46, ZF - Dp / 2 + 8, W + 70, 92, Dp + 16, 8); // the plinth
  B.box(A.trim, x, base + 705, ZF + 5, W + 14, 20, 12, 0); // a string course
  // the parapet, its corbels and its merlons
  B.box(A.stone, x, base + H + 30, ZF - 22, W + 30, 60, 44, 6);
  for (let k = 0; k < 8; k++) B.box(A.corbel || A.trim, x - W / 2 + 55 + k * 110, base + H - 18, ZF + 8, 46, 44, 44, 0);
  for (let k = 0; k < 8; k++) B.box(A.stone, x - W / 2 + 55 + k * 110, base + H + 88, ZF - 22, 82, 56, 44, 6);
  // the gate arch: the opening is the core's alcove (w + 36 wide, c.h tall) topped by a half circle
  const ay = base + c.h;
  B.box(A.glass, x, base + c.h / 2, ZF + 8, cw, c.h, 6, 0);
  disc(B, A.glass, x, ay, ZF + 8, rI, 6, 16, 0);
  for (const s of [-1, 1]) B.box(A.trim, x + s * (rI + 17), base + c.h / 2, ZF + 10, 34, c.h, 24, 3);
  for (let k = 0; k < 9; k++) {
    const ang = PI * (k + 0.5) / 9;
    B.box(k === 4 ? A.gold : A.trim, x + Math.cos(ang) * (rI + 17), ay + Math.sin(ang) * (rI + 17), ZF + 10, 62, 34, 24, 3, 0, 0, ang - PI / 2);
  }
  B.box(A.trim, x, base + 12, ZF + 12, cw + 100, 24, 40, 3); // the sill
  roundel(B, A, x, base + 645, ZF + 4, 54);
  out.lamps.push({ f, x, y: base + 722, z: ZF + 20 });
  out.cores.push({ f, x: c.x, y: -c.y, z: ZF + 13 });
  // arrow slits in the plain wall on either side
  for (const s of [-1, 1]) {
    if (s < 0 && f.gal) continue; // (the gallery's door is there)
    for (const q of [300, 520]) B.box(A.glass, x + s * 300, base + q, ZF + 4, 16, 70, 6, 0);
  }
  // the drum towers
  for (const s of [-1, 1]) {
    const cx = x + s * TX, cz = ZF - 215;
    const top = drumTower(B, A, cx, base, cz, TR, TH, { roof: 'cone', ow: 7, seg: 10 });
    hanging(B, A, cx, base + TH - 24, cz + TR * 1.0 + 6, 76, 300);
    out.flagSpots.push({ x: cx, y: top, z: cz, f: f.i * 2 + (s > 0 ? 1 : 0), scale: 1.8 });
    B.rod(A.woodDark, V3(cx, top - 70, cz), V3(cx, top + 150, cz), 3.4, 1);
  }
  // braziers (the fire is the vfx's)
  for (const s of [-1, 1]) {
    const bx = x + s * 300, bz = ZF + 76;
    tcyl(B, A.iron, bx, base + 118, bz, 38, 24, 30, 9, 3);
    tcyl(B, '#2a1a14', bx, base + 130, bz, 30, 30, 6, 9, 0);
    tcyl(B, A.iron, bx, base + 52, bz, 9, 22, 104, 6, 1.2);
    out.fires.push({ f, x: bx, y: base + 140, z: bz });
  }
  // the back: a balcony door the bridge arrives at, and a postern
  const bz = ZF - Dp;
  B.box(A.glass, x, base + 400, bz - 2, 130, 190, 6, 0);
  B.box(A.trim, x, base + 306, bz - 40, 190, 18, 90, 4);
  for (const s of [-1, 1]) B.box(A.trim, x + s * 76, base + 400, bz - 3, 22, 200, 10, 2);
  B.box(A.glass, x, base + 90, bz - 2, 150, 180, 6, 0);
  out.backDoor.push({ f, x, y: base + 396, z: bz - 20 });
}

// rubble where a face was breached: the broken stumps of the towers, a heap of blocks
function rubble(B, A, K, f) {
  const F = K.FACE || {}, TX = F.TOWER_X || 560, TR = F.TOWER_R || 165, base = -f.y, x = f.x;
  for (const [s, h, tilt] of [[-1, 230, 0.06], [1, 150, -0.08]]) {
    tcyl(B, A.stone, x + s * TX, base + h / 2, ZF - 215, TR * 0.86, TR * 1.1, h, 11, 6, 0, 0, tilt);
    tcyl(B, A.shade, x + s * TX, base + h + 8, ZF - 215, TR * 0.7, TR * 0.86, 24, 11, 3, 0, 0, tilt * 2);
  }
  B.box(A.shade, x - 210, base + 40, ZF - 100, 280, 80, 360, 6, 0, 0.2, 0);
  B.box(A.stone, x + 120, base + 70, ZF - 90, 340, 140, 380, 6, 0, -0.15, 0.05);
  B.box(A.trim, x - 20, base + 150, ZF - 120, 160, 100, 200, 5, 0.1, 0.4, 0);
  B.box(A.stone, x + 330, base + 30, ZF + 20, 90, 60, 90, 4, 0.3, 0.7, 0.2);
  B.box(A.trim, x - 380, base + 24, ZF + 30, 80, 48, 80, 4, 0.2, 0.3, 0.4);
  tcyl(B, '#3b3330', x, base + 3, ZF + 10, 200, 200, 4, 12, 0); // (a scorch lying flat on the ground (D3: it stood up on its edge, a black half-disc cutting the cliff))
}

// ---- the specials -----------------------------------------------------------------------------------------------------------------------------------------------------------------
function special(B, A, f, out) {
  const sp = f.special, sx = sp.x, base = -sp.y;
  if (sp.dead) { B.box(A.trim, sx, base + 25, -60, 200, 50, 180, 5, 0, 0.3, 0); B.box(A.stone, sx + 60, base + 55, -90, 110, 90, 110, 4, 0.2, 0.5, 0.2); return; }
  if (sp.kind === 'hangar') { // a stone shed with a barrel vault and a big arched door
    B.box(A.stone, sx, base + 90, -130, 280, 180, 240, 8);
    B.box(A.shade, sx, base + 20, -126, 308, 40, 252, 6);
    tcyl(B, A.roof, sx, base + 180, -130, 140, 140, 240, 12, 8, PI / 2);
    B.box(A.glass, sx, base + 56, -9, 150, 112, 6, 0);
    disc(B, A.glass, sx, base + 112, -9, 75, 6, 14, 0);
    for (let k = 0; k < 7; k++) { const ang = PI * (k + 0.5) / 7; B.box(k === 3 ? A.gold : A.trim, sx + Math.cos(ang) * 90, base + 112 + Math.sin(ang) * 90, -6, 40, 26, 22, 2, 0, 0, ang - PI / 2); }
    for (const s of [-1, 1]) B.box(A.trim, sx + s * 90, base + 56, -6, 26, 112, 22, 2);
    B.box(A.wood, sx, base + 8, 36, 200, 16, 80, 3); // the landing
    B.rod(A.woodDark, V3(sx + 90, base + 316, -130), V3(sx + 90, base + 410, -130), 3, 1);
    B.box(A.banner, sx + 122, base + 392, -130, 56, 34, 4, 1);
    cone(B, A.flame, sx + 122, base + 392, -126, 8, 24, 5, 0);
  } else if (sp.kind === 'ballista') { // (D2: the garrison's ballista: a low stone bastion, 90 high, its merlons in front; garrison3d.js stands the ballista itself on it (the sim's lock starts 100 px above the ground) and turns it on 8 fps keys)
    B.box(A.stone, sx, base + 45, -95, 190, 90, 130, 8);
    B.box(A.shade, sx, base + 14, -92, 214, 28, 150, 5);
    B.box(A.trim, sx, base + 92, -90, 202, 12, 142, 4);
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) B.box(A.stone, sx + dx * 80, base + 116, -95 + dz * 50, 36, 36, 30, 4);
    B.box(A.glass, sx, base + 40, -28, 18, 56, 6, 0);
    B.rod(A.woodDark, V3(sx - 84, base + 116, -146), V3(sx - 84, base + 230, -146), 3, 1);
    B.box(A.banner, sx - 84 + 24, base + 214, -146, 48, 30, 4, 1);
  } else if (sp.kind === 'flak') { // a ballista tower
    B.box(A.stone, sx, base + 125, -110, 150, 250, 150, 8);
    B.box(A.shade, sx, base + 20, -108, 176, 40, 176, 6);
    B.box(A.trim, sx, base + 258, -110, 196, 32, 196, 6);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.box(A.stone, sx + dx * 84, base + 296, -110 + dz * 84, 40, 44, 40, 4);
    B.box(A.glass, sx, base + 130, -33, 22, 80, 6, 0);
    B.box(A.wood, sx, base + 282, -110, 70, 18, 70, 3); // the turntable
    B.rod(A.woodDark, V3(sx, base + 296, -170), V3(sx, base + 356, -34), 9, 2); // the stock, pointing out and up
    B.rod(A.iron, V3(sx, base + 348, -52), V3(sx, base + 368, -6), 3.6, 0); // the bolt
    cone(B, A.iron, sx, base + 372, 4, 9, 30, 5, 0, PI / 2 - 0.3);
    for (const s of [-1, 1]) { B.rod(A.wood, V3(sx, base + 332, -80), V3(sx + s * 118, base + 326, -118), 7, 1.6); B.rod(A.iron, V3(sx + s * 118, base + 326, -118), V3(sx, base + 352, -40), 1.8, 0); }
    B.rod(A.woodDark, V3(sx - 70, base + 316, -128), V3(sx - 70, base + 380, -128), 3, 1);
    B.box(A.banner, sx - 70 + 22, base + 366, -128, 46, 28, 4, 1);
  } else if (sp.kind === 'mortar') { // a trebuchet frame (side on)
    B.box(A.woodDark, sx, base + 14, -90, 290, 28, 74, 5);
    for (const z of [-58, -122]) for (const s of [-1, 1]) B.rod(A.wood, V3(sx + s * 98, base + 26, z), V3(sx, base + 218, z), 8, 1.6);
    B.rod(A.woodDark, V3(sx, base + 218, -136), V3(sx, base + 218, -44), 8, 1.4);
    B.rod(A.wood, V3(sx - 176, base + 304, -90), V3(sx + 64, base + 166, -90), 8, 1.8); // the throwing arm
    B.box(A.stone, sx + 70, base + 126, -90, 64, 78, 62, 5); // the counterweight
    B.rod(A.iron, V3(sx + 66, base + 164, -90), V3(sx + 70, base + 160, -90), 3, 0);
    B.rod(A.iron, V3(sx - 176, base + 304, -90), V3(sx - 190, base + 240, -90), 2.2, 0); // the sling
    diamond(B, '#4a4547', sx - 192, base + 226, -90, 17, 17, 17, 1.6);
    B.box(A.wood, sx - 30, base + 30, -90, 140, 10, 90, 2); // a ramp for the stones
  } else if (sp.kind === 'gallery' && f.gal) {
    // (the gallery itself is built with the face: see gallery())
  } else B.box(A.stone, sx, base + 30, -70, 190, 60, 170, 6);
}

// the covered gallery: the sim's gal x / y exactly. The deck's top is the ledge (gal.y); a hoarding of timber above it keeps the sun off, open at the front so a crewman can be seen
function gallery(B, A, f) {
  const g = f.gal, len = g.x1 - g.x0, mx = (g.x0 + g.x1) / 2, ly = -g.y;
  B.box(A.wood, mx, ly - 11, -10, len, 22, 220, 5); // the deck (top at ly)
  for (let x = g.x0 + 40; x < g.x1; x += 160) B.rod(A.woodDark, V3(x, ly - 22, -10), V3(x + 90, ly - 170, -10), 8, 0); // the braces
  B.box(A.woodDark, mx, ly - 36, -10, len, 14, 24, 2); // a beam under the front
  B.box(A.woodDark, mx, ly + 98, -114, len, 196, 14, 4); // the back boards
  for (let x = g.x0; x <= g.x1 - 60; x += 200) B.rod(A.woodDark, V3(x, ly, 92), V3(x, ly + 196, 92), 5, 1); // the posts
  B.box(A.woodDark, mx, ly + 70, 92, len, 8, 8, 0); // the rail
  B.box(A.roofDark, mx, ly + 214, -10, len + 60, 14, 290, 5, 0.17, 0, 0); // the roof, sloping to the front
  B.box(A.roof, mx, ly + 222, -30, len + 40, 8, 250, 0, 0.17, 0, 0);
  B.box(A.woodDark, g.door, ly + 95, ZF + 8, 112, 196, 14, 3); // the keep door
  B.box(A.glass, g.door, ly + 90, ZF + 16, 84, 176, 6, 0);
  for (const s of [-1, 1]) B.box(A.trim, g.door + s * 54, ly + 95, ZF + 12, 16, 200, 16, 0);
}

// ---- the curtain wall --------------------------------------------------------------------------------------------------------------------------------------------------------------
function wallRun(B, A, K, x0, x1, base, out, tag) {
  const Wl = K.WALL || {}, H = Wl.H || 520, D = Wl.DEPTH || 150, Z = Wl.Z == null ? -265 : Wl.Z, PH = Wl.PARAPET || 66, SEG = Wl.SEG || 330, ME = Wl.MERLON_EVERY || 112, MW = Wl.MERLON || 56, TE = Wl.TOWER_EVERY || 1250, TH = Wl.TOWER_H || 700;
  const L = x1 - x0;
  if (L < 80) return;
  const n = Math.max(1, Math.ceil(L / SEG)), len = L / n;
  for (let i = 0; i < n; i++) {
    const a = x0 + i * len, xm = a + len / 2;
    B.box(A.stone, xm, base + H / 2, Z, len, H, D, 6);
    B.box(A.shade, xm, base + 36, Z + 10, len + 2, 72, D + 24, 5);
    B.box(A.paving, xm, base + H + 6, Z, len, 12, D + 2, 0); // the walkway
    B.box(A.stone, xm, base + H + 12 + PH / 2, Z + D / 2 - 17, len, PH, 34, 5); // the outer parapet
    const m0 = Math.ceil((a + 1) / ME - 0.5);
    for (let k = m0; (k + 0.5) * ME < a + len; k++) B.box(A.stone, (k + 0.5) * ME, base + H + 12 + PH + 25, Z + D / 2 - 17, MW, 50, 34, 5);
    B.box(A.glass, a + len * 0.5, base + H * 0.62, Z + D / 2 + 1, 12, 58, 4, 0); // an arrow slit
    if (i % 3 === 0) B.box(A.shade, a + len, base + H * 0.5, Z + D / 2 + 20, 52, H, 40, 5); // a buttress
  }
  // wall towers: square, crenellated, with a pennant
  const nt = Math.floor(L / TE);
  for (let k = 1; k <= nt; k++) {
    const tx = x0 + (L * k) / (nt + 1);
    B.box(A.stone, tx, base + TH / 2, Z, 230, TH, 230, 7);
    B.box(A.shade, tx, base + 40, Z + 8, 262, 80, 258, 5);
    B.box(A.trim, tx, base + TH + 12, Z, 262, 24, 262, 4);
    for (let q = 0; q < 6; q++) { const ang = q * TAU / 6 + PI / 6; B.box(A.stone, tx + Math.sin(ang) * 112, base + TH + 24 + 28, Z + Math.cos(ang) * 112, 70, 56, 70, 4, 0, ang, 0); }
    B.box(A.glass, tx, base + TH * 0.7, Z + 116, 20, 90, 6, 0);
    B.rod(A.woodDark, V3(tx, base + TH + 40, Z), V3(tx, base + TH + 190, Z), 3, 1);
    out.flagSpots.push({ x: tx, y: base + TH + 190, z: Z, f: 100 + k + (tag || 0), scale: 1.4 });
  }
}
// a square end tower of the wall at x (the ring's start)
function endTower(B, A, K, x, base, out) {
  const Wl = K.WALL || {}, Z = Wl.Z == null ? -265 : Wl.Z, TH = (Wl.TOWER_H || 700) + 80;
  B.box(A.stone, x, base + TH / 2, Z, 260, TH, 260, 7);
  B.box(A.shade, x, base + 40, Z + 8, 292, 80, 288, 5);
  B.box(A.trim, x, base + TH + 12, Z, 292, 24, 292, 4);
  for (let q = 0; q < 8; q++) { const ang = q * TAU / 8 + PI / 8; B.box(A.stone, x + Math.sin(ang) * 128, base + TH + 52, Z + Math.cos(ang) * 128, 66, 60, 66, 5, 0, ang, 0); }
  cone(B, A.roof, x, base + TH + 150, Z, 120, 160, 4, 6, 0, PI / 4, 0);
  B.rod(A.woodDark, V3(x, base + TH + 220, Z), V3(x, base + TH + 360, Z), 3, 1);
  out.flagSpots.push({ x, y: base + TH + 360, z: Z, f: 99, scale: 1.6 });
  B.box(A.glass, x, base + TH * 0.7, Z + 132, 24, 100, 6, 0);
}

// ---- the whole static strip ------------------------------------------------------------------------------------------------------------------------------------------------------
// -> { group, flags: [{ mesh, ranges, phase }], cores, lamps, fires, backDoor }
export function buildStrip(ring, A, K, parent) {
  const B = new Batch();
  const out = { cores: [], lamps: [], fires: [], backDoor: [], flagSpots: [] };
  const faces = ring.faces || [];
  const base0 = faces.length ? -faces[0].y : 0;
  const F = K.FACE || {}, half = (F.TOWER_X || 560) + (F.TOWER_R || 165) - 30;
  for (const f of faces) {
    if (f.down) rubble(B, A, K, f); else gatehouse(B, A, K, f, out);
    special(B, A, f, out);
    if (f.gal && !f.down) gallery(B, A, f);
  }
  // the wall: from the ring's start round to the first gatehouse, between the gatehouses, and from the last one to the ring's end
  const xs = faces.map((f) => f.x);
  const end = ring.xRing + ring.C;
  if (xs.length) {
    wallRun(B, A, K, ring.xRing + 100, xs[0] - half, base0, out, 0);
    for (let i = 0; i + 1 < xs.length; i++) wallRun(B, A, K, xs[i] + half, xs[i + 1] - half, base0, out, (i + 1) * 10);
    wallRun(B, A, K, xs[xs.length - 1] + half, end - 100, base0, out, 90);
  } else wallRun(B, A, K, ring.xRing + 100, end - 100, base0, out, 0);
  endTower(B, A, K, ring.xRing, base0, out);
  const group = buildBatch(B, { cast: false, receive: true });
  plainify(group, 'castleStrip');
  const flags = buildFlags(out.flagSpots, A, parent);
  return { group, flags, ...out, tris: B.tris };
}

// ---- the banners: three phase groups, each one mesh holding all three poses of its flags --------------------------------------------------------------------------------------------
function buildFlags(spots, A, parent) {
  const poses = flagPoses(4, 26, 70, () => [A.banner, A.banner], 4, (i) => [1, 0.88, 0.7, 0.46][i], (i, b, hh) => {
    if (i === 1) {
      cone(b, A.flame, 13, -hh * 0.5, 3.2, 8, 30, 5, 0);
      cone(b, '#ffe08a', 13, -hh * 0.56, 4.4, 4, 16, 5, 0);
    }
    if (i === 0) b.box(A.gold, 13, -4, 2.8, 26, 7, 2, 0);
  });
  const groups = [[], [], []];
  for (const s of spots) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(s.x, s.y, s.z), new THREE.Quaternion(), new THREE.Vector3(s.scale || 1.6, s.scale || 1.6, s.scale || 1.6));
    groups[((s.f % 3) + 3) % 3].push({ poses, at: m });
  }
  const out = [];
  groups.forEach((list, phase) => {
    const merged = list.length ? mergeFlags(list) : null;
    if (!merged) return;
    const mesh = new THREE.Mesh(merged.geometry, look.toon ? toonVC : plainVC);
    mesh.userData.toon = toonVC; mesh.userData.plain = plainVC;
    mesh.frustumCulled = false; mesh.name = 'castleFlags';
    mesh.geometry.setDrawRange(merged.ranges[0][0], merged.ranges[0][1]);
    parent.add(mesh);
    out.push({ mesh, ranges: merged.ranges, phase });
  });
  disposeFlagPoses(poses);
  return out;
}
export const poseFlags = (flags, key) => { for (const f of flags) { const r = f.ranges[(((Math.floor(key) + f.phase) % 3) + 3) % 3]; if (r) f.mesh.geometry.setDrawRange(r[0], r[1]); } };

// ---- the dynamic batch: portcullis and drawbridge -----------------------------------------------------------------------------------------------------------------------------------
// levels = (f) => { gate: 0..3 (how far the portcullis is up), bridge: 0..1 (0 = raised, 1 = down) }
export function buildDynamic(ring, A, levels) {
  const B = new Batch();
  for (const f of ring.faces) {
    if (f.down) continue;
    const L = levels(f), c = f.core, base = -f.y, x = f.x, cw = c.w + 36, rI = cw / 2;
    // portcullis: bars from the arch down to the grate's lower edge, which rises with the level
    const lift = L.gate * (c.h + 130) / 3, zz = ZF + 16;
    for (let k = -4; k <= 4; k++) {
      const dx = k * (rI - 14) / 4.4, top = base + c.h + Math.sqrt(Math.max(0, rI * rI - dx * dx)) - 6 - (Math.abs(k) === 4 ? 14 : 0), bot = base + 14 + lift;
      if (top - bot < 14) continue;
      B.box(A.iron, x + dx, (top + bot) / 2, zz, 9, top - bot, 8, 0);
      cone(B, A.iron, x + dx, bot - 10, zz, 6.5, 26, 5, 0, PI);
    }
    for (let y = base + 40 + lift; y < base + c.h + rI - 20; y += 104) {
      const half = y <= base + c.h ? rI - 10 : Math.sqrt(Math.max(0, rI * rI - (y - base - c.h) ** 2)) - 12;
      if (half > 20) B.box(A.iron, x, y, zz + 1, half * 2, 13, 8, 0);
    }
    // drawbridge: a leaf hinged on the sill, chains to the arch
    const a = (1 - clampN(L.bridge, 0, 1)) * (PI / 2) * 0.94, len = 150, px = x, py = base + 26, pz = ZF + 26; // (D3: bridge = the fraction of the way down, 0..1, one of the config RING3D.SET.BRIDGE.STEPS)
    const dy = Math.sin(a), dz = Math.cos(a);
    B.box(A.wood, px, py + dy * len / 2, pz + dz * len / 2, 240, 18, len, 0, -a, 0, 0); // (no ink on the dynamic batch: one draw call fewer)
    B.box(A.woodDark, px, py + dy * (len - 10), pz + dz * (len - 10), 244, 22, 18, 0, -a, 0, 0);
    for (const s of [-1, 1]) {
      const tipY = py + dy * len, tipZ = pz + dz * len;
      B.rod(A.iron, V3(x + s * 108, tipY, tipZ), V3(x + s * (rI + 16), base + c.h + 18, ZF + 24), 3, 0);
    }
  }
  const g = buildBatch(B, { cast: false, receive: false });
  plainify(g, 'castleDynamic');
  return g;
}

// ---- D3: one gatehouse on its own, for the collapse ---------------------------------------------------------------------------------------------------------------------------------
// The intact gatehouse of a face built about x = 0 and the platform's top (y = 0): setpiece3d.js stands it back on the face, sinks and spreads it in 8 fps steps while the static strip already shows the rubble, and drops it.
const clampN = (v, a, b) => (v < a ? a : v > b ? b : Number.isFinite(v) ? v : a);
export function buildGatehouseGroup(f, A, K) {
  const B = new Batch(), out = { cores: [], lamps: [], fires: [], backDoor: [], flagSpots: [] }, c = f.core;
  gatehouse(B, A, K, { i: f.i, x: 0, y: 0, core: { x: 0, y: 0, w: c.w, h: c.h }, gal: null }, out);
  const group = buildBatch(B, { cast: false, receive: false });
  plainify(group, 'castleCollapse');
  return { group, tris: B.tris };
}
