// The enemy gunship GENERATOR. Every gunship is built from a seed (plus the mission number and difficulty) so no two are alike:
//   hull length (cutter / frigate / dreadnought), deck layout (1-3 stepped decks joined by ladders), single or twin
//   gasbags, 1-3 engine pods, her guns (2-4 stern cannon ports, optional top turret / deck mortar / nose flak gun),
//   an optional SPECIAL (bat hangar, boarding ramp, harpoon gun, armoured boiler, paratrooper rack), crew size,
//   a captain PERSONALITY, a name and flag colours.
// Everything is in her HOME FRAME (the numbers gunship.js, the art and the bots share): canonical = nose to the right,
// stern (guns, yardarm, landing spot) at the LEFT end x0. When she turns round (g.m = -1) she is the mirror image
// about her own middle, so helper functions take the gunship g and map x through mx(g, x).
// This module is pure (config + ship layout only) so aim.js, bots.js, the art and gunship.js can all import it.
import { config } from '../../config.js';
import { SHIP_LAYOUT } from '../../shipLayout.js';

const GP = config.GUNSHIP_PARTS;
const mainY = () => SHIP_LAYOUT.platforms.find((p) => p.id === 'main').y; // (read when a gunship is built, so a new ship build is picked up)
export const X0 = 2050; // her stern end (every gunship; the nose end is X0 + length)
const DECK_STEP = { up: -100, down: 90 };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Deck arrangements: cuts = where the deck steps (fractions of the length), ys = deck heights (0 = the normal deck level;
// negative = raised), plus where things stand (fractions of the length).
const LAYOUTS = {
  flush: { cuts: [], ys: [0], boiler: 0.82, helm: 0.5, mortar: 0.66, guards: [0.3, 0.43, 0.62, 0.74, 0.37] },
  quarter: { cuts: [0.32], ys: [DECK_STEP.up, 0], boiler: 0.84, helm: 0.52, mortar: 0.68, guards: [0.4, 0.5, 0.62, 0.76, 0.45] },
  foredeck: { cuts: [0.7], ys: [0, DECK_STEP.up], boiler: 0.86, helm: 0.42, mortar: 0.58, guards: [0.26, 0.34, 0.5, 0.62, 0.3] },
  well: { cuts: [0.3, 0.7], ys: [0, DECK_STEP.down, 0], boiler: 0.86, helm: 0.46, mortar: 0.57, guards: [0.38, 0.5, 0.62, 0.76, 0.42] },
  sunkenstern: { cuts: [0.35], ys: [DECK_STEP.down, 0], boiler: 0.8, helm: 0.56, mortar: 0.68, guards: [0.45, 0.5, 0.62, 0.74, 0.4] },
  tiered: { cuts: [0.25, 0.62], ys: [DECK_STEP.up, 0, DECK_STEP.down], boiler: 0.5, helm: 0.33, mortar: 0.8, guards: [0.4, 0.45, 0.7, 0.85, 0.3] },
};
export const LAYOUT_NAMES = Object.keys(LAYOUTS);

// Small seeded random numbers (mulberry32): the same seed always builds the same ship.
export function makeRng(seed) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.pick = (list) => list[Math.floor(next() * list.length) % list.length];
  next.int = (a, b) => a + Math.floor(next() * (b - a + 1));
  return next;
}

const chance = (arr, mission) => clamp(arr[0] + arr[1] * (mission - 1), 0, arr[2]);

// Y of the top of an ellipse (bag) at x.
const bagTopAt = (b, x) => b.cy - b.ry * Math.sqrt(Math.max(0, 1 - ((x - b.cx) / b.rx) ** 2));

// Her outline in her home frame: points around each gasbag ellipse, the hull box and a few across the middle, grown by m pixels.
// (Map squares are 200px; n / hn set how many points: collision uses many, the look-ahead and spot-finding fewer.)
export function outline(bp, m, n = 144, hn = 24) {
  const pts = [];
  const scale = bp.len / 1100;
  for (const b of bp.bags) {
    const per = Math.max(16, Math.round(n * ((b.rx + b.ry) / 820) * (bp.bags.length > 1 ? 0.8 : 1)));
    for (let k = 0; k < per; k++) {
      const a = (k / per) * Math.PI * 2;
      pts.push([b.cx + Math.cos(a) * (b.rx + m), b.cy + Math.sin(a) * (b.ry + m)]);
    }
    pts.push([b.cx, b.cy]);
  }
  const hx0 = bp.x0 - 75 - m; // (symmetrical: she is mirrored when she turns round)
  const hx1 = bp.x1 + 75 + m;
  const hy0 = bp.hullTop - m;
  const hy1 = bp.hullBot + m;
  const cnt = Math.max(6, Math.round(hn * scale));
  for (let k = 0; k <= cnt; k++) {
    const x = hx0 + ((hx1 - hx0) * k) / cnt;
    pts.push([x, hy0], [x, hy1]);
  }
  const mid = (hy0 + hy1) / 2;
  pts.push([hx0, mid], [hx1, mid]);
  const lowBag = Math.max(...bp.bags.map((b) => b.cy + b.ry));
  for (const x of [bp.x0 + 100, bp.cx, bp.x1 - 100, ...bp.bags.map((b) => b.cx)]) pts.push([x, (lowBag + hy0) / 2], [x, mid]);
  return pts;
}

export function generateBlueprint(seed, opts = {}) {
  const R = makeRng(seed);
  const mission = Math.max(1, opts.mission || 1);
  const shift = GP.DIFF_SHIFT[opts.difficulty] ?? 0;
  const effM = Math.max(1, mission + shift);

  // ---- Hull ----
  const names = Object.keys(GP.HULLS);
  const wrow = GP.HULL_WEIGHTS[Math.min(GP.HULL_WEIGHTS.length, effM) - 1];
  let hullName = opts.hull;
  if (!hullName) {
    let r = R() * wrow.reduce((a, b) => a + b, 0);
    hullName = names[names.length - 1];
    for (let i = 0; i < names.length; i++) if ((r -= wrow[i]) < 0) { hullName = names[i]; break; }
    if (!wrow[names.indexOf(hullName)]) hullName = names[wrow.findIndex((w) => w > 0)];
  }
  const H = GP.HULLS[hullName];
  const len = H.len;
  const x0 = X0;
  const x1 = X0 + len;
  const cx = (x0 + x1) / 2;
  const layoutName = opts.layout || R.pick(H.layouts);
  const LY = LAYOUTS[layoutName];

  // ---- Decks (stepped segments left to right, joined by ladders at each step) ----
  const cuts = [0, ...LY.cuts, 1].map((f) => x0 + f * len);
  const decks = LY.ys.map((dy, i) => ({ x0: cuts[i], x1: cuts[i + 1], y: mainY() + dy, k: i }));
  const ys = decks.map((d) => d.y);
  const hullTop = Math.min(...ys) - 80;
  const hullBot = Math.max(...ys) + 112;
  const decksMir = decks
    .map((d) => ({ x0: x0 + x1 - d.x1, x1: x0 + x1 - d.x0, y: d.y, k: d.k }))
    .reverse();
  const segIn = (x) => decks.find((d) => x >= d.x0 && x <= d.x1) || decks[x < x0 ? 0 : decks.length - 1];
  const snap = (x, margin = 45) => {
    const d = segIn(x);
    return clamp(x, d.x0 + margin, d.x1 - margin);
  };
  const sternY = decks[0].y;

  // ---- Gasbags ----
  const twin = R() < GP.TWIN_BAG * (hullName === 'cutter' ? 0.5 : 1);
  const ry0 = H.ry;
  const bags = [];
  if (twin) {
    const ry = ry0 * 0.9;
    const cy = hullTop - 20 - ry;
    bags.push({ cx: cx - 0.27 * len, cy, rx: 0.36 * len, ry }, { cx: cx + 0.27 * len, cy, rx: 0.36 * len, ry });
  } else bags.push({ cx, cy: hullTop - 20 - ry0, rx: 0.6 * len, ry: ry0 });
  const bagTop = Math.min(...bags.map((b) => b.cy - b.ry));
  const mastBag = twin ? bags[0] : bags[0];
  const mastX = twin ? mastBag.cx : cx + 0.3 * len;
  const mast = { x: mastX, y: bagTopAt(mastBag, mastX) + 25 };
  const noseBag = bags[bags.length - 1];

  // ---- Engines ----
  const nEng = R.int(H.engines[0], H.engines[1]);
  const engFr = [[], [0.33], [0.23, 0.44], [0.17, 0.34, 0.5]][nEng];
  const engines = engFr.map((f, i) => ({
    x: x0 + f * len,
    y: nEng === 3 && i === 1 && R() < 0.5 ? hullBot + 14 : hullBot - 40,
    s: nEng === 1 ? 1.35 : hullName === 'cutter' ? 0.9 : 1,
  }));

  // ---- Weapons: stern cannon ports first (they fire broadsides), then the optional extras ----
  const nPorts = clamp(R.int(H.ports[0], H.ports[1]) + (effM >= 4 && H.ports[1] < 4 && R() < 0.5 ? 1 : 0), 2, 4);
  const sp = nPorts <= 2 ? 70 : nPorts === 3 ? 62 : 50;
  const weapons = [];
  for (let k = 0; k < nPorts; k++) weapons.push({ kind: 'cannon', x: x0 - 30, y: sternY - 45 + k * sp });
  // (opts.weapons forces exactly these extras, for tests)
  const wantExtra = (kind, arr) => {
    const r = R();
    return opts.weapons ? opts.weapons.includes(kind) : r < chance(arr, effM);
  };
  if (wantExtra('turret', GP.TURRET)) weapons.push({ kind: 'turret', x: noseBag.cx, y: noseBag.cy - noseBag.ry - 2 });
  if (wantExtra('mortar', GP.MORTAR)) weapons.push({ kind: 'mortar', x: snap(x0 + LY.mortar * len), y: segIn(x0 + LY.mortar * len).y - 30 });
  if (wantExtra('flak', GP.FLAK)) weapons.push({ kind: 'flak', x: x1 + 40, y: decks[decks.length - 1].y - 30 });

  // ---- Special (0 or 1) ----
  let special = opts.special !== undefined ? opts.special : null;
  if (opts.special === undefined && R() < GP.SPECIAL_CHANCE) {
    const ok = GP.SPECIALS.filter((s) => effM >= (GP.SPECIAL_MIN_MISSION[s] || 1));
    special = R.pick(ok);
  }

  // ---- Crew and posts ----
  const crew = clamp(H.crew + (R() < 0.5 ? 0 : 1) + Math.floor((effM - 1) / 2), 3, GP.CREW_MAX);
  const W0 = decks[0].x1 - decks[0].x0;
  const boilerX = snap(x0 + LY.boiler * len, 70);
  const posts = {
    gunner: [x0 + 60, x0 + 150, ...(W0 >= 330 ? [x0 + 240] : [])],
    helm: [snap(x0 + LY.helm * len, 60)],
    stoker: [snap(boilerX - 110, 40)],
    guard: LY.guards.map((f) => snap(x0 + f * len)),
  };
  if (Math.abs(posts.stoker[0] - boilerX) < 70) posts.stoker[0] = snap(boilerX + 110, 40); // (a short boiler deck: stand on the other side)
  const hangarX = x0 + 0.72 * len;
  const hangarSeg = segIn(hangarX);

  // ---- Looks ----
  const cloth = R.pick(GP.CLOTH);
  const trim = R.pick(GP.TRIM);
  const adj = R.pick(GP.NAME_ADJ);
  const noun = R.pick(GP.NAME_NOUN);
  const name = R() < 0.6 ? `The ${adj} ${noun}` : `${adj} ${noun}`;
  const personality = opts.personality || R.pick(Object.keys(GP.PERSONALITY));

  const bp = {
    seed,
    name,
    title: name.toUpperCase(),
    hull: hullName,
    layout: layoutName,
    len,
    x0,
    x1,
    cx,
    mission,
    effM,
    hpMul: H.hp,
    decks,
    decksMir,
    hullTop,
    hullBot,
    bags,
    bagTop,
    twin,
    mast,
    engines,
    weapons,
    special,
    crew,
    personality,
    cap: GP.PERSONALITY[personality],
    posts,
    boilerX,
    landX: x0 + 40,
    anchor: { x: x0 - 170, y: bags[0].cy - 70 },
    hangar: { x: hangarX, y: hangarSeg.y + 58, w: 92, h: 74 },
    harpoon: { x: x0 + 18, y: sternY - 70 },
    ramp: { x: x0 - 30, y: sternY + 56 },
    rack: { x: x0 + Math.max(160, W0 - 70), y: sternY - 55 },
    flag: { a: cloth, b: trim, pattern: R.pick(GP.PATTERNS) },
    hullColor: R.pick(GP.HULL_COLORS),
    bagColor: R.pick(GP.BAG_COLORS),
    emblem: R.pick(GP.EMBLEMS),
    enginePower: GP.ENGINE_POWER[nEng] || 1,
  };
  bp.pts = { col: outline(bp, 4), look: outline(bp, 30, 48, 10), spot: outline(bp, config.GUNSHIP.ROCK_MARGIN, 48, 10) };
  return bp;
}

// ---- Geometry helpers (g = the gunship; g.bp = her blueprint; g.m = +1 canonical, -1 mirrored) ----
export const mx = (g, x) => (g && g.m < 0 ? g.bp.x0 + g.bp.x1 - x : x);
// Her deck segments now, left to right in her current frame.
export const decksOf = (g) => (g.m < 0 ? g.bp.decksMir : g.bp.decks);
export function segAt(g, x) {
  const ds = decksOf(g);
  for (let i = 0; i < ds.length; i++) if (x <= ds[i].x1) return i;
  return ds.length - 1;
}
export const deckYAt = (g, x) => decksOf(g)[segAt(g, x)].y;
export const landX = (g) => mx(g, g.bp.landX);
export const landSeg = (g) => segAt(g, landX(g));
export const landY = (g) => deckYAt(g, landX(g));
export const boilerX = (g) => mx(g, g.bp.boilerX);
export const boilerSeg = (g) => segAt(g, boilerX(g));
export const boilerY = (g) => deckYAt(g, boilerX(g));
// A weapon's place now (home frame).
export const portPos = (g, k) => {
  const w = g.bp.weapons[k];
  return { x: mx(g, w.x), y: w.y };
};
export const firstCannon = (g) => g.bp.weapons.findIndex((w) => w.kind === 'cannon');
export const anchorPt = (g) => ({ x: mx(g, g.bp.anchor.x), y: g.bp.anchor.y });
// The surfaces someone falling or leaping could land on, in ship coordinates (the outer ends reach a little past the deck).
export function surfaces(g) {
  if (!g || !g.bp) return [];
  const ds = decksOf(g);
  return ds.map((d, i) => ({ y: d.y + g.dy, x0: d.x0 - (i === 0 ? 30 : 0) + g.dx, x1: d.x1 + (i === ds.length - 1 ? 30 : 0) + g.dx }));
}
// A step towards x (home-frame) for someone standing on her deck at p.x / p.gd: walk, and use the ladder at the step between decks.
// Returns { jx, jy, arrived } for the stick.
export function routeStep(g, p, tx, near = 12) {
  const ds = decksOf(g);
  const k = clamp(p.gd || 0, 0, ds.length - 1);
  const tk = segAt(g, tx);
  if (k === tk) {
    const d = tx - p.x;
    const arrived = Math.abs(d) <= near;
    return { jx: arrived ? 0 : Math.sign(d), jy: 0, arrived };
  }
  const dir = tk > k ? 1 : -1;
  const xb = dir > 0 ? ds[k].x1 : ds[k].x0;
  const up = ds[k + dir].y < ds[k].y;
  if (Math.abs(p.x - xb) < 38) return { jx: 0, jy: up ? -1 : 1, arrived: false };
  return { jx: Math.sign(xb - p.x), jy: 0, arrived: false };
}
