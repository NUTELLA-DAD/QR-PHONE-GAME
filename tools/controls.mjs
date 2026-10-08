// Headless test of the phone controls (Phase C) with a HUMAN player (bot:false): the host's rules for the two buttons.
//   node tools/controls.mjs
// The phone side (hold-to-swap ring, button layout) is checked in a browser; here we play the host's half of it:
// the ids the phone sends back with each press (aid), the grab lockout, GRAB vs ACTION, the nearest-wins rack choice,
// and presses that must not fire later.
import { pathToFileURL } from 'node:url';
import path from 'node:path';

globalThis.window ??= globalThis;
const store = new Map();
globalThis.localStorage ??= { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.requestAnimationFrame ??= (f) => setTimeout(f, 16);
let s0 = 5;
Math.random = () => {
  s0 = (s0 + 0x6d2b79f5) | 0;
  let t = Math.imul(s0 ^ (s0 >>> 15), 1 | s0);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
Date.now = () => 1700000000000;
let simClock = 0;
performance.now = () => simClock;

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'public');
const load = (p) => import(pathToFileURL(path.join(root, p)).href);
const { config } = await load('config.js');
const { SHIP_LAYOUT } = await load('shipLayout.js');
config.MAPS.FORCE_KIND = 'open';
const { createSimulation } = await load('modules/host/simulation.js');
const { applyPlayerInput } = await load('modules/host/network.js');

const dt = 1 / 60;
let fails = 0;
const check = (ok, msg) => {
  console.log((ok ? 'PASS ' : 'FAIL ') + msg);
  if (!ok) fails++;
};
const errs = [];
const D = (id) => SHIP_LAYOUT.platforms.findIndex((p) => p.id === id);

// A quiet ship moored at the mast with one person standing on a deck.
const sim = createSimulation();
const state = sim.state;
const sent = []; // what the host sent to the phone: [kind, payload]
sim.setSocket({ emit: (kind, payload) => sent.push([kind, payload]) });
const me = { id: 'me', name: 'Tester', species: config.CREW_SPECIES[0], color: '#e63946', x: 860, y: 0, d: D('main'), jx: 0, jy: 0, t: 0, connected: true, fall: false, ko: 0 };
state.players.me = me;
const step = (n = 1) => {
  for (let i = 0; i < n; i++) {
    simClock += dt * 1000;
    try { sim.update(dt); } catch (err) { errs.push(String(err.stack).split('\n').slice(0, 3).join(' | ')); }
  }
};
const secs = (s) => step(Math.round(s * 60));
const stand = (deck, x, carry = null) => {
  Object.assign(me, { d: D(deck), x, y: SHIP_LAYOUT.platforms[D(deck)].y, carry, jx: 0, lock: null, fall: false, ko: 0, grabLock: 0 });
};
// Press a button the way the phone does: with the id of the label it is showing.
const ui = () => me.ui || {};
const tapAct = (aid = ui().aid) => applyPlayerInput(state, me, { jx: 0, jy: 0, act: 1, aid });
const tapGrab = (aid = ui().gaid) => applyPlayerInput(state, me, { jx: 0, jy: 0, grab: 1, aid });

step(60); // settle
const T = config.TOOLS;
const CTL = config.CONTROLS;

// (a) Double tap on a rack: you still hold the hammer.
stand('main', 860);
step(3);
check(ui().label === 'Take hammer' && ui().aid && !ui().grab === false, `at the hammer rack: Action says "${ui().label}", Grab says "${ui().grab}"`);
tapAct();
tapAct(); // same frame
step(1);
check(me.carry === 'hammer', 'a double tap on the same frame takes the hammer once');
tapAct(); // the second tap of a slower double tap, still showing the old label
step(1);
check(me.carry === 'hammer', 'a second tap a frame later (old label) does not put it back');
tapAct(undefined);
step(1);
check(me.carry === 'hammer', 'an old phone page (no id) cannot drop it with the big button either');
check(ui().label === 'Hey!' && ui().grab === 'Put back hammer' && ui().gswap === true, `holding it: Action is idle ("${ui().label}"), Grab says "${ui().grab}" and needs a hold`);
// Grab lockout: a Grab press right after the pickup is ignored, a later one works.
tapGrab();
step(1);
check(me.carry === 'hammer', 'Grab pressed inside the lockout is ignored');
secs(CTL.GRAB_LOCK + 0.1);
tapGrab();
step(1);
check(me.carry === null, 'Grab after the lockout puts the hammer back');
tapGrab(); // right behind it
step(1);
check(me.carry === null, 'a press right after a put-back is locked out too');

// (b) Holding a hammer near another rack: Action never swaps, Grab does.
stand('main', 940, 'hammer');
step(3);
check(ui().grab === 'Swap to hookshot', `hammer in hand at the hookshot hook: Grab says "${ui().grab}"`);
tapAct();
step(1);
check(me.carry === 'hammer', 'Action does not swap');
tapAct(undefined);
step(1);
check(me.carry === 'hammer', 'Action without an id does not swap either');
tapGrab();
step(1);
check(me.carry === 'hookshot', 'Grab swaps to the hookshot');
check(me.grabLock > 0, 'the swap starts the grab lockout');

// (c) A press for a label that is not showing is dropped (and the phone is sent its labels again).
stand('main', 860);
step(3);
sent.length = 0;
tapAct('rack|sword|');
step(1);
check(me.carry === null && sent.some(([k, m]) => k === 'host:ui' && m.ui && m.ui.aid), 'a press carrying the wrong id is dropped and the labels are re-sent');
tapAct('rack|hammer|');
step(1);
check(me.carry === 'hammer', 'the right id works');
// ...and a press made just before the label changed (within the grace time) still lands.
stand('main', 870);
step(3);
const seen = ui().aid;
stand('main', 960);
step(1); // the label has changed under the phone's thumb
check(ui().aid !== seen, 'walking to the other rack changed the label id');
tapAct(seen);
step(1);
check(me.carry === 'hammer', `a press with the id from just before (${Math.round(CTL.AID_GRACE * 1000)} ms grace) still takes what it saw`);
stand('main', 870);
step(3);
const seen2 = ui().aid;
stand('main', 960);
step(1);
secs(CTL.AID_GRACE + 0.05);
tapAct(seen2);
step(1);
check(me.carry === null, 'the same press later than the grace time is dropped');

// (d) Presses queued while the game is not taking input do not fire afterwards.
for (const [what, on, off] of [
  ['a vote', () => { state.vote = { kind: 'route', title: 'test', t: 99, total: 0, options: [] }; }, () => { state.vote = null; }],
  ['the scorecard', () => { state.scorecard = { t: 99 }; }, () => { state.scorecard = null; }],
  ['the pause menu', () => { state.paused = true; sim.flushPresses(); }, () => { state.paused = false; }], // (main.js flushes when the menu opens)
]) {
  stand('main', 860);
  step(3);
  const aid = ui().aid;
  me.actQ = me.grabQ = me.atkQ = me.jumpQ = true; // (anything already queued when it started)
  me.fire = true;
  on();
  tapAct(aid); // (and presses that arrive during it)
  tapGrab(ui().gaid);
  step(2);
  off();
  step(30);
  check(me.carry === null && !me.actQ && !me.grabQ && !me.fire, `presses queued during ${what} do not fire afterwards`);
}

// (e) Nearest rack wins between the hammer (860) and the hookshot (960).
const labelAt = (x, from = null) => {
  stand('main', x);
  step(3);
  return ui().grab;
};
check(labelAt(900) === 'Take hammer', 'x=900 (hammer 40 away, hookshot 60): hammer');
check(labelAt(920) === 'Take hookshot', 'x=920 (hammer 60, hookshot 40): hookshot');
// walking right with hysteresis: the hammer keeps the button until the hookshot is CTL.HYSTERESIS closer
stand('main', 870);
step(3);
const walk = [];
for (let x = 870; x <= 935; x += 5) {
  me.x = x;
  step(2);
  walk.push(ui().grab === 'Take hammer' ? 'H' : ui().grab === 'Take hookshot' ? 'K' : '-');
}
const flips = walk.join('').replace(/(.)\1+/g, '$1');
check(flips === 'HK', `walking across the overlap flips once (${walk.join('')})`);
// the sword rack (660) against the Lightning Coil seat (710)
check(labelAt(665) === 'Take sword', 'x=665: the sword rack, not the coil seat');
check(labelAt(705) === 'Take Lightning Coil', 'x=705: the coil seat');
// the extinguisher (lower deck 300) against the Aft Sponson (420) and the hammer (690) against the Coal Bunker (570)
stand('lower', 362);
step(3);
check(ui().grab === 'Take Aft Sponson', `lower deck x=362: "${ui().grab}" (the gun seat is nearer than the extinguisher)`);
stand('lower', 340);
step(3);
check(ui().grab === 'Take extinguisher', `lower deck x=340: "${ui().grab}"`);

// Overlaps that used to hide an action: Load coal beats the ice locker, the bomb bay's Jump! only on the hatch.
stand('main', 335, 'coal');
step(3);
check(ui().label === 'Load coal' && ui().grab === null, `carrying coal by the boiler and the ice locker: Action "${ui().label}", Grab ${ui().grab}`);
stand('bay', 545);
step(3);
check(ui().label === 'Take Bomb Bay', `bomb bay seat area (x=545): Action "${ui().label}" (empty hands: the first pickup is on the big button)`);
stand('bay', SHIP_LAYOUT.bombBay.jumpX);
step(3);
check(ui().label === 'Jump!' && ui().grab === 'Take Bomb Bay', `on the hatch: Action "${ui().label}", Grab "${ui().grab}"`);
tapGrab();
step(1);
check(me.lock === 'Bomb Bay', 'Grab takes the seat');

// A knocked-out or falling player's queued presses are thrown away at once.
for (const [what, set] of [['knocked out', () => { me.ko = 5; }], ['falling', () => { me.fall = true; }]]) {
  stand('main', 860);
  step(3);
  me.actQ = me.grabQ = me.atkQ = me.jumpQ = true;
  me.fire = true;
  set();
  step(1);
  check(!me.actQ && !me.grabQ && !me.atkQ && !me.jumpQ && !me.fire, `presses of a player ${what} are cleared`);
  me.ko = 0;
  me.fall = false;
}

check(errs.length === 0, 'no errors' + (errs.length ? ': ' + errs[0] : ''));
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
