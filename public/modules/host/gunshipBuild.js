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
// What she is made of: her stepped DECKS on top (the helm, the guns), and a HOLD inside her hull under them (the boiler and its coal, the ammunition, the engines' steam valves, the tools,
// the medical bay) joined to the decks by ladders at the ends. The decks stay as the blueprint made them; the hold gives the ship-rule machinery (stations, racks, valves) the room it needs.
//
// Two enemy-only part kinds are registered here (shipBuild.js stays as it is): `enemyDeck` is a deck at ANY height (her decks step up and down by 90-100 px, the player's decks sit on
// the named rows) and `enemyFrame` is the frame part with her hull box and outline. Everything else is the player's catalogue: stations (helm, boiler, coal, ammo, guns), engines, pipes,
// racks, vents, a medical bay, boarding points, the gasbags.
import { PARTS } from './shipBuild.js';
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
// Her frame: the shipBuild.js `frame` part with her own geometry for every override (buildLayout keeps what a frame sets: OVERRIDES there).
PARTS.enemyFrame = {
  mass: 0, lift: 0, steam: 0, hands: 0,
  emit: (p, A) => {
    A.add('shield', p.shield);
    for (const k of ['samples', 'bounds', 'aimPoint', 'refPoint', 'midPoint', 'tiltPivot', 'fitBox', 'hullRect', 'hitRects', 'spawn']) if (p[k] != null) A.setScalar(k, p[k]);
  },
};

// What the gunship is called as a team: the TV shows her colours (config.FLEET.TEAMS.enemy).
export const ENEMY_TEAM = 'enemy';

// The deck of the blueprint at home x (the segment that holds it, else the nearest).
const segIn = (bp, x) => bp.decks.find((d) => x >= d.x0 && x <= d.x1) || bp.decks[x < bp.x0 ? 0 : bp.decks.length - 1];

// Translate a blueprint into { parts, info }. info names things the director needs: the platform ids of her decks (left to right), her hold, the gun station of each weapon
// (bp.weapons[k]) and which kind of weapon each is, each engine's name, and where the helm, the boiler and the coal stand.
export function gunshipParts(bp) {
  const parts = [];
  const N = bp.decks.length;
  const helmX = bp.posts.helm[0];
  const helmDeck = segIn(bp, helmX);
  const hold = { x0: bp.x0 + 110, x1: bp.x1 - 110, y: Math.max(...bp.decks.map((d) => d.y)) + 100, k: -1 }; // (inside the hull, under the lowest deck)
  const idOf = (d) => (d === hold ? 'lower' : d === helmDeck ? 'main' : 'deck' + d.k); // (the deck her helm stands on is the "main" deck every system looks for; the hold is her "lower" deck)
  const info = { decks: bp.decks.map(idOf), hold: { id: 'lower', index: N, y: hold.y, x0: hold.x0, x1: hold.x1 }, guns: [], kinds: [], engines: [], posts: {} };
  const deckAt = (x) => idOf(segIn(bp, x));
  const inDeck = (x, margin = 24) => { const d = segIn(bp, x); return clamp(x, d.x0 + margin, d.x1 - margin); };
  const inHold = (x, margin = 24) => clamp(x, hold.x0 + margin, hold.x1 - margin);

  // ---- decks: the segments left to right, a little overlap at each step so the ladder stands on both; the hold under them ----
  bp.decks.forEach((d, k) => {
    parts.push({ part: 'enemyDeck', id: idOf(d), name: k === 0 ? 'Stern Deck' : k === N - 1 ? 'Fore Deck' : 'Mid Deck', x0: d.x0 - (k > 0 ? 30 : 0), x1: d.x1 + (k < N - 1 ? 30 : 0), y: d.y, outside: true });
  });
  parts.push({ part: 'enemyDeck', id: 'lower', name: 'Hold', x0: hold.x0, x1: hold.x1, y: hold.y, outside: false });
  // ---- ways between the decks: a ladder at each step, and hatches down into the hold at its ends (and its middle, in a long ship) ----
  for (let k = 0; k < N - 1; k++) {
    const a = bp.decks[k], b = bp.decks[k + 1], cut = a.x1;
    const upper = a.y <= b.y ? a : b, lower = upper === a ? b : a;
    parts.push({ part: 'ladder', top: idOf(upper), bottom: idOf(lower), xTop: cut, xBottom: cut });
  }
  const hatches = [hold.x0 + 60, hold.x1 - 60, ...(hold.x1 - hold.x0 > 900 ? [(hold.x0 + hold.x1) / 2] : [])];
  for (const x of hatches) parts.push({ part: 'ladder', top: deckAt(x), bottom: 'lower', xTop: x, xBottom: x });

  // ---- her gasbags ----
  for (const b of bp.bags) parts.push({ part: 'gasbag', cx: b.cx, cy: b.cy, rx: b.rx, ry: b.ry });

  // ---- where things stand ----
  // Action does the nearest thing within reach, and a rack, an extinguisher, a vent or a valve comes BEFORE a station (shipSim.js useFor): a coal bunker with a hammer rack beside it could never
  // be loaded, a boiler with a vent beside it never stoked. So the stations are placed first and the hardware stands clear of them: tier 2 (the boiler, the coal bunker, the ammunition hold)
  // always, tier 1 (the helm, the guns, the engines, which are repaired before anything else) when the deck has room. An optional piece with no room anywhere is left out.
  const topDecks = bp.decks;
  const stands = []; // { p, x, tier }
  const okAt = (p, x, relax, gap) => stands.every((s) => s.p !== p || Math.abs(s.x - x) >= (s.tier === 2 ? 80 : s.tier === 1 ? 80 * relax : gap * relax));
  // The nearest place to `want` (on its own deck first, then the others of `decks`) that keeps clear of everything already standing; null if there is none (optional) or the roomiest place (mandatory).
  const place = (want, tier, { decks = [hold], gap = 55, optional = false, margin = 24, relaxTo = 0.78, keepOrder = false } = {}) => {
    const order = keepOrder ? decks : [...decks].sort((a, b) => Math.abs((a.x0 + a.x1) / 2 - want) - Math.abs((b.x0 + b.x1) / 2 - want));
    for (const relax of [1, relaxTo]) {
      for (const d of order) {
        const p = idOf(d), lo = d.x0 + margin, hi = d.x1 - margin;
        let best = null;
        for (let x = lo; x <= hi; x += 8) if (okAt(p, x, relax, gap) && (best === null || Math.abs(x - want) < Math.abs(best - want))) best = x;
        if (best !== null) { stands.push({ p, x: best, tier }); return { p, x: best }; }
      }
    }
    if (optional) return null;
    const d = order[0], p = idOf(d);
    let best = clamp(want, d.x0 + margin, d.x1 - margin), bs = -1;
    for (let x = d.x0 + margin; x <= d.x1 - margin; x += 8) { const s = Math.min(...stands.filter((q) => q.p === p).map((q) => Math.abs(q.x - x)), 1e9); if (s > bs) { bs = s; best = x; } }
    stands.push({ p, x: best, tier });
    return { p, x: best };
  };

  // ---- the helm stands where the blueprint says, on the decks; the boiler below it in the hold ----
  const boilerX = inHold(bp.boilerX, 40);
  stands.push({ p: deckAt(helmX), x: helmX, tier: 1 });
  stands.push({ p: 'lower', x: boilerX, tier: 2 });
  parts.push({ part: 'station', n: 'Helm', kind: 'helm', p: deckAt(helmX), x: helmX });
  parts.push({ part: 'station', n: 'Boiler', kind: 'boiler', p: 'lower', x: boilerX });

  // ---- her guns: the stern ports first (broadsides), then the optional turret, mortar and nose flak - all on the decks ----
  let ports = 0;
  bp.weapons.forEach((w, k) => {
    let n, want, spec;
    if (w.kind === 'cannon') {
      n = 'Stern Port ' + ++ports;
      want = bp.x0 + 50 + (ports - 1) * 78;
      spec = { bx: w.x, by: w.y, aim: Math.PI, arc: 1.25 }; // (the muzzle sticks out of her stern and points aft: she brings her guns to bear by pointing her bow away)
    } else if (w.kind === 'turret') {
      n = 'Top Turret';
      want = w.x;
      spec = { bx: w.x, by: w.y, aim: -Math.PI / 2, arc: 1.5 };
    } else if (w.kind === 'mortar') {
      n = 'Deck Mortar';
      want = w.x;
      spec = { bx: w.x, by: w.y, aim: -Math.PI / 2, arc: 1.45 }; // (lobbed: almost any way but down)
    } else {
      n = 'Bow Flak Gun';
      want = bp.x1 - 60;
      spec = { bx: w.x, by: w.y, aim: 0, arc: 1.5 };
    }
    const at = place(want, 1, { decks: topDecks, gap: 70 });
    parts.push({ part: 'gun', n, p: at.p, x: at.x, ...spec });
    info.guns[k] = n;
    info.kinds[k] = w.kind;
  });

  // ---- engines hang under the hull, with a steam pipe each from the boiler; the helm has its own ----
  bp.engines.forEach((e, i) => {
    const name = 'Engine ' + (i + 1);
    const at = place(e.x, 1, { margin: 30, gap: 60 }); // (the pod hangs where the art has it; the module a hand repairs stands as near as the stations leave room for)
    parts.push({ part: 'engine', name, p: at.p, x: at.x });
    info.engines[i] = name;
  });
  const coal = place(boilerX + 130, 2, { margin: 30 });
  parts.push({ part: 'station', n: 'Coal Bunker', kind: 'coal', p: coal.p, x: coal.x });
  const ammo = place(bp.x0 + 330, 2, { margin: 30 });
  parts.push({ part: 'station', n: 'Ammo Hold', kind: 'ammo', p: ammo.p, x: ammo.x });
  info.posts = { helm: { x: helmX, p: deckAt(helmX) }, boiler: { x: boilerX, p: 'lower' }, coal: { x: coal.x, p: coal.p } };

  // ---- the steam pipes (a valve each) and a vent: in the hold, on a deck if the hold is full ----
  const everywhere = [hold, ...topDecks];
  const deckById = (id) => (id === 'lower' ? hold : bp.decks.find((d) => idOf(d) === id));
  const pipe = (to, toX, toY) => {
    const v = place(boilerX + 100, 0, { decks: everywhere, keepOrder: true, margin: 20 });
    parts.push({ part: 'pipe', to, p: v.p, points: [[boilerX, hold.y - 50], [toX, toY]], valve: [v.x, deckById(v.p).y - 20] });
  };
  pipe('Helm', helmX, helmDeck.y - 60);
  bp.engines.forEach((e, i) => pipe(info.engines[i], inHold(e.x, 30), hold.y + 20));
  const vent = place(boilerX - 110, 0, { decks: everywhere, keepOrder: true, margin: 20 });
  parts.push({ part: 'vent', p: vent.p, x: vent.x });

  // ---- tools, a medical bay, the places new crew drop in ----
  const hardware = (part, extra, want, decks, optional) => {
    const at = place(want, 0, { decks, keepOrder: true, margin: 20, optional, relaxTo: optional ? 1 : 0.78 });
    if (at) parts.push({ part, ...extra, p: at.p, x: at.x });
  };
  hardware('rack', { kind: 'hammer' }, bp.x0 + 200, everywhere, false);
  hardware('extinguisher', {}, boilerX + 230, everywhere, false);
  hardware('rack', { kind: 'sword' }, boilerX - 200, everywhere, true);
  hardware('rack', { kind: 'hammer' }, helmX + 100, topDecks, true); // (a hammer and a spray on the decks too: that is where the holes are)
  hardware('extinguisher', {}, helmX - 100, topDecks, true);
  hardware('rack', { kind: 'sword' }, bp.x0 + 190, topDecks, true);
  hardware('extinguisher', {}, bp.x0 + 300, [hold], true);
  const mbX = inHold(bp.posts.guard[0], 30);
  parts.push({ part: 'medbay', p: 'lower', x: mbX });
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
