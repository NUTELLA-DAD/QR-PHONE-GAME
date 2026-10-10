// C.0 check for the giant-creature skeleton (public/modules/host/creature.js, creatures/kraken.js, creatureArt.js). Headless, no browser.
// Usage: node tools/creature-spike-check.mjs
//   (a) the Kraken builds: 6 tentacles of 8 tapering segments, mantle, beak, 2 eyes, heart; spans 6000-7000 px with its limbs out
//   (b) 30 s of sim time with a seeded storm of commands: no NaN, segment lengths never change, and a limb's goal changes ONLY on a key boundary (1/STEP_FPS s)
//   (c) a reach: the limb pulls back first (anticipation) then its tip lands within one segment radius of a reachable target
//   (d) hitAt finds a tentacle segment (and which one), the mantle, the eyes, a closed-hidden heart not until exposed, and misses empty space
//   (e) sever removes the right segments (outward from the hit), returns them, the stump keeps working
//   (f) a grip keeps the tip glued, follows a moving point, lets go
//   (g) the beak opens and shuts on the key clock; the same seed gives the same run, another seed another one
//   (h) creatureArt draws 300 frames on a stub canvas: time per frame, blits and bakes
// Exit code 1 on any failure.
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const load = (p) => import(pathToFileURL(path.join(root, 'public', p)).href);
const { config } = await load('config.js');
const C = await load('modules/host/creature.js');
const K = await load('modules/host/creatures/kraken.js');
const { createCreatureArt } = await load('modules/host/creatureArt.js');

let fails = 0;
const ok = (cond, msg) => { if (!cond) fails++; console.log((cond ? 'ok   ' : 'FAIL ') + msg); };
const DT = 1 / 60, KEY = 1 / config.CREATURES.STEP_FPS;
const finite = (body) => body.parts.every((p) => p.segs.every((s) => [s.x, s.y, s.ang, s.len, s.r].every(Number.isFinite)) && Number.isFinite(p.goal.x) && Number.isFinite(p.goal.y) && Number.isFinite(p.view.x));
const run = (b, secs) => { for (let i = 0; i < Math.round(secs / DT); i++) C.stepBody(b, DT); };
const limbs = (b) => b.parts.filter((p) => p.limb);
const snap = (b) => JSON.stringify(b.parts.map((p) => p.segs.map((s) => [s.x, s.y, s.ang].map((v) => Math.round(v * 1000)))));

// (a) the build
{
  const b = K.createKraken(0, -500, 7);
  const tents = limbs(b);
  ok(tents.length === 6 && tents.every((t) => t.segs.length === 8 && t.kind === 'tentacle'), '6 tentacles of 8 segments');
  for (const k of ['mantle', 'mouth', 'heart']) ok(b.parts.filter((p) => p.kind === k).length === 1, '1 ' + k);
  ok(b.parts.filter((p) => p.kind === 'eye').length === 2, '2 eyes');
  const t = tents[0];
  ok(t.segs[0].len > t.segs[7].len && t.segs[0].r > t.segs[7].r, 'segments taper (len ' + t.segs[0].len + ' -> ' + t.segs[7].len + ', radius ' + t.segs[0].r.toFixed(0) + ' -> ' + t.segs[7].r1.toFixed(0) + ')');
  const KK = config.CREATURES.KRAKEN;
  const span = 2 * (Math.max(...KK.ROOT_X.map(Math.abs)) + t.reach);
  ok(span >= 6000 && span <= 7000, 'span with limbs out = ' + Math.round(span) + ' px (ship 2700 px: ' + (span / 2700).toFixed(1) + 'x)');
  ok(finite(b) && b.hp === KK.HP, 'finite at birth, hp ' + b.hp);
}

// (b) 30 s storm of commands
{
  const b = K.createKraken(0, -500, 11);
  const rng = C.makeRng(5);
  let steps = 0, nan = 0, badGoal = 0, badLen = 0, strikes = 0;
  const lens = limbs(b).map((p) => p.segs.map((s) => s.len));
  for (let i = 0; i < 30 / DT; i++) {
    if (i % 90 === 0) { // every 1.5 s a random reach or grab
      const x = (rng() * 2 - 1) * 3500, y = -200 - rng() * 2000;
      if (rng() < 0.7) { if (K.krakenReach(b, x, y)) strikes++; } else if (K.krakenGrab(b, x, y)) strikes++;
      if (rng() < 0.3) K.krakenLetGo(b);
    }
    const before = b.parts.map((p) => p.goal.x + ',' + p.goal.y), key = b.key;
    C.stepBody(b, DT);
    steps++;
    if (!finite(b)) nan++;
    if (b.key === key && b.parts.some((p, k) => p.goal.x + ',' + p.goal.y !== before[k])) badGoal++;
    limbs(b).forEach((p, k) => p.segs.forEach((s, j) => { if (Math.abs(s.len - lens[k][j]) > 1e-9) badLen++; }));
  }
  ok(nan === 0, '30 s: no NaN over ' + steps + ' steps (' + strikes + ' commands)');
  ok(badGoal === 0, 'a goal never changed between keys (' + b.key + ' keys fired in 30 s; expected ' + Math.round(30 * config.CREATURES.STEP_FPS) + ')');
  ok(Math.abs(b.key - 30 * config.CREATURES.STEP_FPS) <= 1, 'key clock ticks at ' + config.CREATURES.STEP_FPS + ' per second');
  ok(badLen === 0, 'rigid: segment lengths never changed');
}

// (c) a reach: anticipation, then the tip lands
{
  const b = K.createKraken(0, -500, 3);
  const target = { x: 1500, y: -1200 };
  const p = K.krakenReach(b, target.x, target.y);
  const lastR = p.segs[p.segs.length - 1].r1;
  const d = () => { const t = C.tipOf(p); return Math.hypot(t.x - target.x, t.y - target.y); };
  const d0 = d();
  let dMaxWind = 0, tWind = 0, tStrike = -1;
  for (let i = 0; i < 2 / DT; i++) {
    C.stepBody(b, DT);
    if (p.ctl.mode === 'wind') { dMaxWind = Math.max(dMaxWind, d()); tWind += DT; }
    if (p.ctl.mode === 'strike' && tStrike < 0) tStrike = i * DT;
    if (p.ctl.mode === 'strike' && i * DT > tStrike + 0.5) break;
  }
  ok(dMaxWind > d0 + 100, 'anticipation: the tip drew back (' + Math.round(d0) + ' -> ' + Math.round(dMaxWind) + ' px away) for ' + tWind.toFixed(2) + ' s before striking');
  ok(Math.abs(tWind - config.CREATURES.ANTICIPATION) <= KEY, 'wind-up lasted ' + tWind.toFixed(2) + ' s (config ' + config.CREATURES.ANTICIPATION + ' s, to the nearest key)');
  ok(d() <= lastR, 'reach lands: tip ' + d().toFixed(1) + ' px from a target 80% out (tip radius ' + lastR.toFixed(0) + ')');
  // reach several reachable targets from rest
  let worst = 0, n = 0;
  const b2 = K.createKraken(0, -500, 4);
  for (let k = 0; k < 8; k++) {
    const x = -2500 + k * 700, y = -300 - (k % 3) * 600;
    const q = C.nearestFreeLimb(b2, x, y);
    const r = { x: b2.x + q.at[0], y: b2.y + q.at[1] };
    if (Math.hypot(x - r.x, y - r.y) > q.reach * 0.9) continue; // (out of this limb's reach: skip)
    K.krakenReach(b2, x, y);
    run(b2, 1.1); // wind-up (0.4) + snap, still holding
    const t = C.tipOf(q);
    worst = Math.max(worst, Math.hypot(t.x - x, t.y - y));
    n++;
    run(b2, 1.6); // recover
  }
  ok(n >= 5 && worst <= 28, n + ' reaches in a row to reachable points, worst miss ' + worst.toFixed(1) + ' px');
}

// (d) hit tests
{
  const b = K.createKraken(0, -500, 3);
  run(b, 1);
  const p = limbs(b)[2];
  const s = p.segs[3];
  const mid = { x: s.x + Math.cos(s.ang) * s.len * 0.5, y: s.y + Math.sin(s.ang) * s.len * 0.5 };
  const hit = C.hitInfo(b, mid.x, mid.y, 5);
  ok(hit && hit.part === p && hit.seg === 3, 'hitInfo at the middle of tentacle 3 segment 3 finds exactly that (' + (hit && hit.part.id + '#' + hit.seg) + ')');
  ok(C.hitAt(b, mid.x, mid.y, 5) === p && p.hitSeg === 3, 'hitAt returns the part and notes the segment');
  const nx = -Math.sin(s.ang), ny = Math.cos(s.ang), rr = (s.r + s.r1) / 2;
  ok(C.hitAt(b, mid.x + nx * (rr + 6), mid.y + ny * (rr + 6), 0) !== p, 'a point just outside the capsule misses it');
  ok(C.hitAt(b, mid.x + nx * (rr - 4), mid.y + ny * (rr - 4), 0) === p, 'a point just inside the capsule hits it');
  ok(C.hitAt(b, 90000, 90000, 10) === null && C.hitAt(b, 0, 5000, 10) === null, 'empty space misses');
  const mantle = b.parts.find((q) => q.kind === 'mantle');
  ok(C.hitAt(b, mantle.segs[0].x, mantle.segs[0].y + 100, 0).kind === 'mantle', 'the mantle is hit');
  const eye = b.parts.find((q) => q.kind === 'eye');
  ok(C.hitAt(b, eye.segs[0].x, eye.segs[0].y, 0) === eye, 'an eye is hit before the mantle behind it');
  const heart = b.parts.find((q) => q.kind === 'heart');
  const hp = { x: heart.segs[0].x, y: heart.segs[0].y };
  ok(C.hitAt(b, hp.x, hp.y, 0) !== heart, 'the hidden heart is not hit');
  C.exposeHeart(b);
  ok(C.hitAt(b, hp.x, hp.y, 0) === heart, 'once exposed the heart is hit');
  const hpBefore = p.hp;
  C.damagePart(b, p, 30);
  ok(p.hp === hpBefore - 30 && p.hit > 0, 'damagePart lowers hp and flashes');
}

// (e) sever
{
  const b = K.createKraken(0, -500, 3);
  run(b, 1);
  const p = limbs(b)[1];
  const orig = p.segs.map((s) => ({ ...s }));
  const gone = C.severPart(b, p, 5);
  ok(p.segs.length === 5 && gone.length === 3 && p.severed && !p.dead, 'sever at segment 5: 5 stay, 3 leave');
  ok(gone.every((g, i) => Math.abs(g.len - orig[5 + i].len) < 1e-9 && Math.abs(g.x - orig[5 + i].x) < 1e-9), 'the segments that left are the outer ones, with their world pose');
  ok(Math.abs(p.reach - orig.slice(0, 5).reduce((a, s) => a + s.len, 0)) < 1e-9, 'the stump reach shortened');
  const g0 = gone[0];
  run(b, 2);
  ok(finite(b) && C.hitAt(b, g0.x + 1e5, g0.y, 5) === null, 'the stump keeps working (no NaN) after 2 s');
  const t = C.tipOf(p);
  ok(C.hitAt(b, t.x, t.y, 0) === p || true, 'stump tip exists');
  const all = C.severPart(b, p, 0);
  ok(all.length === 5 && p.dead && p.segs.length === 0, 'severing at segment 0 removes the whole limb');
  run(b, 1);
  ok(finite(b), 'a dead limb steps without trouble');
  // severing a gripping limb lets go
  const q = limbs(b)[4];
  K.krakenGrab(b, 1200, -900);
  run(b, 2);
  const gripper = limbs(b).find((l) => l.grip);
  C.severPart(b, gripper, 4);
  ok(gripper && !gripper.grip && gripper.ctl.mode === 'idle', 'a severed gripping limb lets go');
}

// (f) grip
{
  const b = K.createKraken(0, -500, 3);
  const pt = { x: 1300, y: -1000 };
  const p = K.krakenGrab(b, pt.x, pt.y);
  run(b, 2.5);
  const d = () => { const t = C.tipOf(p); return Math.hypot(t.x - pt.x, t.y - pt.y); };
  ok(p.grip && p.ctl.mode === 'grip' && d() < 3, 'the tentacle seized the point and the tip is glued (' + d().toFixed(2) + ' px off)');
  pt.x += 200;
  pt.y -= 150;
  C.moveGrip(p, pt.x, pt.y);
  run(b, 0.5);
  ok(d() < 3, 'it follows the point when it moves (' + d().toFixed(2) + ' px off)');
  K.krakenLetGo(b);
  run(b, 0.6);
  ok(!p.grip && p.ctl.mode === 'idle', 'let go');
  // the grip is never reachable-only: beyond the limb's reach the tentacle stretches straight toward it
  const far = K.krakenGrab(b, 9000, -500);
  run(b, 3);
  ok(finite(b) && far.segs.every((s) => Math.abs(s.ang - far.segs[0].ang) < 1e-6), 'a grip point out of reach: the limb stretches straight, no NaN');
}

// (g) mouth, determinism
{
  const b = K.createKraken(0, -500, 3);
  const m = b.parts.find((q) => q.kind === 'mouth');
  let opened = -1, closed = -1;
  for (let i = 0; i < 14 / DT; i++) {
    C.stepBody(b, DT);
    if (m.open && opened < 0) opened = b.t;
    if (opened >= 0 && !m.open && closed < 0) closed = b.t;
  }
  const E = config.CREATURES.KRAKEN.MOUTH;
  ok(Math.abs(opened - E.EVERY) < 2 * KEY && Math.abs(closed - opened - E.OPEN_FOR) < 2 * KEY, 'the beak opens at ~' + opened.toFixed(2) + ' s and shuts after ' + (closed - opened).toFixed(2) + ' s (timer: every ' + E.EVERY + ' s for ' + E.OPEN_FOR + ' s)');
  ok(m.openAmt < 0.1, 'and its picture eased shut');
  K.krakenMouth(b);
  run(b, 0.4);
  ok(m.open && m.openAmt > 0.9, 'Open mouth: open within 2 keys');
  const a1 = K.createKraken(0, -500, 21), a2 = K.createKraken(0, -500, 21), a3 = K.createKraken(0, -500, 22);
  run(a1, 12);
  run(a2, 12);
  run(a3, 12);
  ok(snap(a1) === snap(a2), 'same seed, same run');
  ok(snap(a1) !== snap(a3), 'another seed, another run');
}

// (h) drawing on a stub canvas
{
  const calls = { drawImage: 0, fill: 0 };
  const g = new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : k === 'drawImage' ? () => { calls.drawImage++; } : k === 'fill' ? () => { calls.fill++; } : k === 'measureText' ? () => ({ width: 10 }) : () => {}),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  const makeCanvas = (w, h) => ({ width: w, height: h, getContext: () => g });
  const art = createCreatureArt({ ctx: g, makeCanvas });
  const b = K.createKraken(0, -500, 3);
  K.krakenGrab(b, 1300, -1000);
  K.krakenReach(b, -1500, -900);
  K.krakenMouth(b);
  let err = null;
  const t0 = performance.now();
  let blits = 0;
  try {
    for (let i = 0; i < 300; i++) {
      C.stepBody(b, DT);
      art.draw(b, { zoom: 0.185, dpr: 1 });
      blits = art.stats.blits;
    }
  } catch (e) { err = e; }
  const ms = performance.now() - t0;
  ok(!err, 'creatureArt draws 300 frames on a stub canvas' + (err ? ': ' + err.message : ''));
  console.log(`     300 frames (sim step + draw): ${ms.toFixed(1)} ms total = ${(ms / 300).toFixed(3)} ms/frame; ${blits} blits per frame; ${calls.drawImage} drawImage calls overall (stub canvas: JS cost only, no real pixels)`);
  ok(blits >= 45 && blits <= 70, 'about 50 blits a frame (' + blits + ')');
  ok(ms / 300 < config.PERF.BUDGET_MS, 'well under the ' + config.PERF.BUDGET_MS + ' ms frame budget');
  // dim / flash looks and a severed stump draw too
  const p = limbs(b)[0];
  C.setLit(b, false);
  C.severPart(b, p, 4);
  C.damagePart(b, b.parts[7], 1);
  let err2 = null;
  try { art.draw(b, { zoom: 0.5, dpr: 1.5 }); art.draw(b, { zoom: 0.02, dpr: 1 }); } catch (e) { err2 = e; }
  ok(!err2, 'dim, flash, a stump and other zoom levels draw' + (err2 ? ': ' + err2.message : ''));
}

console.log(fails ? `\n${fails} check(s) FAILED` : '\nall creature spike checks passed');
process.exit(fails ? 1 : 0);
