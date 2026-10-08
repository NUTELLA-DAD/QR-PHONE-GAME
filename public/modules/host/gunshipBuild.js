// The enemy gunship as a PARTS LIST (MOVEMENT.md, Option B, stage B.5). Node-safe: no DOM.
//
// A gunship blueprint (gunshipBlueprint.js: decks, gasbags, engines, her guns, her crew's posts) is translated into the same kind of build a player's ship is made of, so she can be
// added to the sky as a real Ship (gunshipShip.js: addShip(parts, { team: 'enemy' })) and every rule that is a ship's rule - flight and mass, rock, collisions, fire and holes, gas,
// steam, modules that break, guns that fire, crew who walk her decks - applies to her by itself.
//
// The layout is in her HOME FRAME: the very numbers of the blueprint (her stern at gunshipBlueprint.X0, her decks at their y), nothing shifted, so the old art (gunshipArt.js, drawn
// from the blueprint) lies exactly on the layout and a layout x is a blueprint x. Her bounds are symmetrical about her middle (bp.cx), so her mirror (pose.f = -1, about the middle of
// the bounds) is the old turn-round mirror (gunshipBlueprint.js mx).
//
// Two enemy-only part kinds are registered here (shipBuild.js stays as it is): `enemyDeck` is a deck at ANY height (her decks step up and down by 90-100 px, the player's decks sit on
// the named rows) and `enemyFrame` is the frame part with her hull box and outline. Everything else is the player's catalogue: stations (helm, boiler, coal, ammo, guns), engines, pipes,
// racks, vents, a medical bay, boarding points, the gasbags.
import { PARTS, DECK_ROWS } from './shipBuild.js';
import { config } from '../../config.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const M = () => config.BALANCE.MASS;

// ---- the enemy-only parts ----
// A deck at its own height: { id, name, x0, x1, y, outside }. (The classic `deck` part takes its height from a named row.)
PARTS.enemyDeck = {
  mass: (p) => ((p.x1 - p.x0) / 100) * M().deck * (p.outside ? M().outdoorDeck : M().coveredDeck),
  lift: 0, steam: 0, hands: 0,
  emit: (p, A) => {
    const o = { ...p };
    delete o.part; delete o.col; delete o.ord;
    A.add('platforms', o);
  },
};
export const ENEMY_ROWS = DECK_ROWS; // (her decks are not on the named rows: the layout's rowOf() is undefined for them, which is how the code that wants a crow's nest or a keel deck knows she has none)

// What the gunship is called as a team: the TV shows her colours (config.FLEET.TEAMS.enemy).
export const ENEMY_TEAM = 'enemy';

// The deck of the blueprint at home x (the segment that holds it, else the nearest).
const segIn = (bp, x) => bp.decks.find((d) => x >= d.x0 && x <= d.x1) || bp.decks[x < bp.x0 ? 0 : bp.decks.length - 1];

// Translate a blueprint into { parts, info }. info names things the director needs: the deck id of each blueprint segment, the gun station of each weapon (bp.weapons[k]), each engine's name,
// where her crew's posts are as (deck index, x) and which kind of weapon each gun is.
export function gunshipParts(bp) {
  const parts = [];
  const N = bp.decks.length;
  const helmX = bp.posts.helm[0];
  const helmDeck = segIn(bp, helmX);
  const idOf = (d) => (d === helmDeck ? 'main' : 'deck' + d.k); // (the deck her helm stands on is the "main" deck every system looks for)
  const info = { decks: bp.decks.map(idOf), guns: [], kinds: [], engines: [], posts: {} };
  const deckAt = (x) => idOf(segIn(bp, x));
  const inDeck = (x, margin = 24) => { const d = segIn(bp, x); return clamp(x, d.x0 + margin, d.x1 - margin); };

  // ---- decks: the segments left to right, a little overlap at each step so the ladder stands on both ----
  bp.decks.forEach((d, k) => {
    parts.push({ part: 'enemyDeck', id: idOf(d), name: k === 0 ? 'Stern Deck' : k === N - 1 ? 'Fore Deck' : 'Mid Deck', x0: d.x0 - (k > 0 ? 30 : 0), x1: d.x1 + (k < N - 1 ? 30 : 0), y: d.y, outside: true });
  });
  // ---- ways between the decks: a ladder at each step ----
  for (let k = 0; k < N - 1; k++) {
    const a = bp.decks[k], b = bp.decks[k + 1], cut = a.x1;
    const upper = a.y <= b.y ? a : b, lower = upper === a ? b : a;
    parts.push({ part: 'ladder', top: idOf(upper), bottom: idOf(lower), xTop: cut, xBottom: cut });
  }

  // ---- her gasbags ----
  for (const b of bp.bags) parts.push({ part: 'gasbag', cx: b.cx, cy: b.cy, rx: b.rx, ry: b.ry });

  // ---- stations: the helm, the boiler and its coal, the ammunition ----
  const boilerX = bp.boilerX;
  parts.push({ part: 'station', n: 'Helm', kind: 'helm', p: deckAt(helmX), x: helmX });
  parts.push({ part: 'station', n: 'Boiler', kind: 'boiler', p: deckAt(boilerX), x: boilerX });
  const coalX = inDeck(boilerX + (Math.abs(inDeck(boilerX + 130) - boilerX) > 60 ? 130 : -130), 30);
  parts.push({ part: 'station', n: 'Coal Bunker', kind: 'coal', p: deckAt(coalX), x: coalX });
  const ammoX = inDeck(bp.x0 + 300, 30);
  parts.push({ part: 'station', n: 'Ammo Hold', kind: 'ammo', p: deckAt(ammoX), x: ammoX });
  info.posts = { helm: { x: helmX, p: deckAt(helmX) }, boiler: { x: boilerX, p: deckAt(boilerX) }, coal: { x: coalX, p: deckAt(coalX) } };

  // ---- her guns: the stern ports first (broadsides), then the optional turret, mortar and nose flak ----
  let ports = 0;
  bp.weapons.forEach((w, k) => {
    let n, gx, spec;
    if (w.kind === 'cannon') {
      n = 'Stern Port ' + ++ports;
      gx = inDeck(bp.x0 + 50 + (ports - 1) * 78, 22);
      spec = { bx: w.x, by: w.y, aim: Math.PI, arc: 1.25 }; // (the muzzle sticks out of her stern and points aft: she brings her guns to bear by pointing her bow away)
    } else if (w.kind === 'turret') {
      n = 'Top Turret';
      gx = inDeck(w.x, 40);
      spec = { bx: w.x, by: w.y, aim: -Math.PI / 2, arc: 1.5 };
    } else if (w.kind === 'mortar') {
      n = 'Deck Mortar';
      gx = inDeck(w.x, 30);
      spec = { bx: w.x, by: w.y, aim: -Math.PI / 2, arc: 1.45 }; // (lobbed: almost any way but down)
    } else {
      n = 'Bow Flak Gun';
      gx = inDeck(bp.x1 - 60, 30);
      spec = { bx: w.x, by: w.y, aim: 0, arc: 1.5 };
    }
    parts.push({ part: 'gun', n, p: deckAt(gx), x: gx, ...spec });
    info.guns[k] = n;
    info.kinds[k] = w.kind;
  });

  // ---- engines hang under the hull, with a steam pipe each from the boiler; the helm has its own ----
  bp.engines.forEach((e, i) => {
    const name = 'Engine ' + (i + 1);
    parts.push({ part: 'engine', name, p: deckAt(e.x), x: e.x });
    info.engines[i] = name;
  });
  const bd = bp.decks.find((d) => d === segIn(bp, boilerX));
  const valveX = (i) => clamp(boilerX + (i % 2 ? 1 : -1) * (80 + 60 * Math.floor(i / 2)), bd.x0 + 20, bd.x1 - 20);
  const pipe = (to, i, toX, toY) => parts.push({ part: 'pipe', to, p: idOf(bd), points: [[boilerX, bd.y - 50], [toX, toY]], valve: [valveX(i), bd.y - 20] });
  pipe('Helm', 0, helmX, segIn(bp, helmX).y - 60);
  bp.engines.forEach((e, i) => pipe(info.engines[i], i + 1, e.x, e.y));
  parts.push({ part: 'vent', p: idOf(bd), x: clamp(boilerX - 70, bd.x0 + 20, bd.x1 - 20) });

  // ---- tools, a medical bay, the places new crew drop in ----
  const d0 = bp.decks[0];
  parts.push({ part: 'rack', kind: 'hammer', p: idOf(d0), x: clamp(bp.x0 + 190, d0.x0 + 20, d0.x1 - 20) });
  parts.push({ part: 'rack', kind: 'hammer', p: idOf(bd), x: clamp(boilerX + 40, bd.x0 + 20, bd.x1 - 20) });
  parts.push({ part: 'rack', kind: 'sword', p: idOf(helmDeck), x: clamp(helmX + 70, helmDeck.x0 + 20, helmDeck.x1 - 20) });
  parts.push({ part: 'rack', kind: 'sword', p: idOf(d0), x: clamp(bp.x0 + 260, d0.x0 + 20, d0.x1 - 20) });
  parts.push({ part: 'extinguisher', p: idOf(bd), x: clamp(boilerX - 40, bd.x0 + 20, bd.x1 - 20) });
  parts.push({ part: 'extinguisher', p: idOf(helmDeck), x: clamp(helmX - 70, helmDeck.x0 + 20, helmDeck.x1 - 20) });
  const mbX = inDeck(bp.posts.guard[0], 30);
  parts.push({ part: 'medbay', p: deckAt(mbX), x: mbX });
  parts.push({ part: 'boarderEntry', x: inDeck(bp.x0 + 90, 30), p: deckAt(bp.x0 + 90) });
  parts.push({ part: 'boarderEntry', x: inDeck(bp.x1 - 90, 30), p: deckAt(bp.x1 - 90) });

  // ---- the frame: her hull box and outline (what a shell hits and what the rock touches are the blueprint's own), the middle of her bounds on her middle ----
  const W = 200; // (the bounds are a symmetrical band round the hull so the mirror is about bp.cx)
  const bounds = { x0: bp.x0 - W, x1: bp.x1 + W, y0: bp.bagTop - 24, y1: bp.hullBot + 40 };
  const samples = bp.pts.col.map(([x, y]) => [Math.round(x), Math.round(y)]);
  parts.push({
    part: 'enemyFrame',
    spawn: 'main',
    bounds,
    samples,
    hitRects: [{ x0: bp.x0 - 75, x1: bp.x1 + 75, y0: bp.hullTop, y1: bp.hullBot + 28 }], // (the old hull test: the box under the bags)
    aimPoint: { x: bp.cx, y: (bp.hullTop + bp.hullBot) / 2 - 40 },
    refPoint: { x: bp.cx, y: (bp.hullTop + bp.hullBot) / 2 },
    midPoint: { x: bp.cx, y: bp.decks[0].y },
    tiltPivot: [bp.cx, bp.hullTop + 60],
    fitBox: { x0: bounds.x0, x1: bounds.x1, y0: bounds.y0, y1: bounds.y1 },
    hullRect: { x0: bp.x0 - 75, x1: bp.x1 + 75, y0: bp.bagTop + 60, y1: bp.hullBot + 8 },
    shield: { cx: bp.cx, cy: (bounds.y0 + bounds.y1) / 2, rx: (bounds.x1 - bounds.x0) / 2, ry: (bounds.y1 - bounds.y0) / 2 },
  });
  return { parts, info };
}

// The frame of an enemy ship: the shipBuild.js `frame` part, but with her own geometry for every override (frame hands the overrides to buildLayout, see OVERRIDES there).
PARTS.enemyFrame = {
  mass: 0, lift: 0, steam: 0, hands: 0,
  emit: (p, A) => {
    A.add('shield', p.shield);
    for (const k of ['samples', 'bounds', 'aimPoint', 'refPoint', 'midPoint', 'tiltPivot', 'fitBox', 'hullRect', 'hitRects', 'spawn']) if (p[k] != null) A.setScalar(k, p[k]);
  },
};
