// FUN.md F8: a small unit check of the fun counters (tools/funmetrics.mjs) on a staged state, and of the bot profiles in config.
//   node tools/fun-check.mjs      (also: node tools/buildsim.mjs --check-fun-metrics)
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
globalThis.window ??= globalThis;
const { config } = await import(pathToFileURL(path.join(root, 'public', 'config.js')).href);
const { createFunMetrics, FUN } = await import(pathToFileURL(path.join(root, 'tools', 'funmetrics.mjs')).href);

let bad = 0;
const check = (ok, text) => { console.log((ok ? 'PASS ' : 'FAIL ') + text); if (!ok) bad++; };
const near = (a, b, e = 0.05) => Math.abs(a - b) <= e;

// the profiles: 'bot' keeps today's numbers, 'human' is the sloppy one, and the default is 'bot'
{
  const P = config.BOTS.PROFILES, b = P.bot, h = P.human;
  check(config.BOTS.PROFILE === 'bot', "the default profile is 'bot'");
  check(b.THINK_EVERY === 0.3 && b.AIM_TOLERANCE === 0.12 && b.REACT === 0 && b.ALARM_GAP === 0 && b.HELM_NOISE === 0, "the bot profile has today's numbers (think 0.3, aim 0.12, no delay, no gap, no noise)");
  check(b.LINK_HOLD === 25 && b.SURGE_GAP === 30 && b.SURGE_STOP_PRESS === 85 && b.SURGE_MAX === 4, "the bot profile has today's link constants (25 / 30 / 85 / 4)");
  check(h.THINK_EVERY === 0.9 && h.AIM_TOLERANCE === 0.25 && h.REACT === 1.2 && h.ALARM_GAP === 20 && h.HELM_NOISE === 0.15, 'the human profile: think 0.9, aim 0.25, react 1.2, alarm gap 20, helm noise 0.15');
  check(Object.keys(b).every((k) => k in h), 'every profile key is in both profiles');
}

// a staged state: a calm ship with a gunner on an empty sky, a helmsman, a stoker off to the side
const mk = () => ({
  phase: 'flying', ship: { down: 0 }, scorecard: null, vote: null, run: { stopId: '1.0' }, goingDown: null, boss: null, creature: null,
  fires: [], boarders: [],
  players: {
    g1: { bot: true, lock: 'Gun A', gunIdle: 3, ko: 0 },
    g2: { bot: true, lock: 'Gun B', gunIdle: 0, ko: 0 },
    h: { bot: true, lock: 'Helm', ko: 0 },
    s: { bot: true, ko: 0 },
    k1: { bot: true, ko: 0 }, k2: { bot: true, ko: 0 }, k3: { bot: true, ko: 0 },
  },
});
const kindOf = (n) => (/^Gun/.test(n) ? 'gun' : 'helm');
const run = (fun, secs, dt = 1 / 60) => { for (let i = 0; i < Math.round(secs / dt); i++) fun.step(dt); };

{ // idle%: 3 seats (Gun A idle, Gun B busy, Helm); gun seats 1 of 2 idle
  const s = mk(), mom = { totals: { named: 0 } }, fun = createFunMetrics(s, { kindOf, targets: () => [], moments: mom });
  run(fun, 10);
  const r = fun.result();
  check(near(r.seatSecs, 30, 0.3) && near(r.idleSecs, 10, 0.2) && near(r.gunSecs, 20, 0.3) && near(r.gunIdleSecs, 10, 0.2), `idle seats: ${r.idleSecs.toFixed(1)} of ${r.seatSecs.toFixed(1)}s (gun seats ${r.gunIdleSecs.toFixed(1)} of ${r.gunSecs.toFixed(1)}s), expected 10/30 and 10/20`);
  check(near(r.gapMax, 10, 0.2), `no-moment gap: ${r.gapMax.toFixed(1)}s after 10 s without a moment, expected 10`);
  // a moment resets the gap
  mom.totals.named = 1; run(fun, 4); fun.step(1 / 60);
  const r2 = fun.result();
  check(near(r2.gapMax, 10, 0.2), `a named moment resets the gap (max stays ${r2.gapMax.toFixed(1)}s)`);
}
{ // overrun: 3 KO + 2 fires + 2 raiders is one event; a second burst after a calm is another; 2 KO only is none
  const s = mk(), fun = createFunMetrics(s, { kindOf, targets: () => [], moments: null });
  s.players.k1.ko = s.players.k2.ko = 4; s.fires = [{}, {}]; s.boarders = [{}, {}];
  run(fun, 3);
  check(fun.result().overrun === 0, `overrun: 2 crew down is not an overrun (${fun.result().overrun})`);
  s.players.k3.ko = 4; run(fun, 3);
  check(fun.result().overrun === 1 && near(fun.result().overrunSecs, 3, 0.1), `overrun: 3 down + 2 fires + 2 raiders is ONE event (${fun.result().overrun}), ${fun.result().overrunSecs.toFixed(1)}s long`);
  s.boarders = []; run(fun, FUN.OVERRUN_CALM + 1); s.boarders = [{}, {}]; run(fun, 2);
  check(fun.result().overrun === 2, `overrun: a second burst after ${FUN.OVERRUN_CALM + 1} s of calm is a second event (${fun.result().overrun})`);
}
{ // menu time: scorecard then dock; the flight clock stops
  const s = mk(), fun = createFunMetrics(s, { kindOf, targets: () => [], moments: null });
  run(fun, 5);
  s.scorecard = { t: 6 }; run(fun, 6); s.scorecard = null; s.vote = { kind: 'dock' }; run(fun, 20); s.vote = null; run(fun, 2);
  const r = fun.result();
  check(near(r.menuSecs, 26, 0.3) && r.scorecards === 1 && near(r.flightSecs, 7, 0.3), `menu: ${r.menuSecs.toFixed(1)}s over ${r.scorecards} scorecard (flight ${r.flightSecs.toFixed(1)}s), expected 26 / 1 / 7`);
}
{ // first threat per stop, and the static things that do not count
  const s = mk();
  let list = [{ kind: 'turret' }];
  const fun = createFunMetrics(s, { kindOf, targets: () => list, moments: null });
  run(fun, 8);
  check(fun.result().threat[1] == null, 'first threat: a turret on the map is not a threat showing up');
  list = [{ kind: 'bat' }]; run(fun, 1);
  const t = fun.result().threat[1];
  check(t != null && near(t, 8, 0.4), `first threat: a bat at 8 s is written down for the stop (${t == null ? 'none' : t.toFixed(1)}s)`);
  list = []; s.run.stopId = '2.0'; run(fun, 4);
  check(fun.result().threat[2] == null && fun.result().flown[2] > 3, 'first threat: a stop with nothing yet has no time written');
}
{ // falls by stop: the edge of goingDown, once per fall
  const s = mk(), fun = createFunMetrics(s, { kindOf, targets: () => [], moments: null });
  s.goingDown = {}; run(fun, 2); s.goingDown = null; run(fun, 1); s.goingDown = {}; run(fun, 1); s.run.stopId = '2.1'; s.goingDown = null; run(fun, 1); s.goingDown = {}; run(fun, 1);
  const f = fun.result().falls;
  check(f[1] === 2 && f[2] === 1, `falls by stop: ${JSON.stringify(f)}, expected {1: 2, 2: 1}`);
}
console.log(bad ? `FAIL fun-check: ${bad} failed` : 'PASS fun-check');
process.exit(bad ? 1 : 0);
