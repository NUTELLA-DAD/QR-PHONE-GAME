// THE GARRISON (CASTLE.md package D1, config.GARRISON): the castle's men fight back. ring.js builds this with the ring and calls it from its own step; it plays on a ring map only, and with GARRISON.ENABLED false it is not there
// (no state, no random numbers: the R0 ring exactly).
//
//   ARCHERS    two posts on every face's wall walk (f.posts). Idle, then a TELL (the horn, f.flag, an amber arc, p.telegraph) and a VOLLEY of 24-32 lobbed arrows (bullets with ay, weak dmg, 45% miss; kind 'arrow'). Fire arrows
//              on the citadel and in the Ember sky carry `fire`. A post is wrecked by shells or a bomb (hp 3); a searchlight on it dazzles it. Only ONE telegraph (a tell or the ballista's lock) at a time, castle wide.
//   BALLISTA   a face's special: LOCK s with an aim-line (sp.lock), then a straight bolt (kind 'bolt').
//   SQUADS     f.squads: men on the plazas (kind 'plaza') and the crews of the face guns (kind 'gun'). States muster / cheer / man / flee / surrender / dead. A dead crew slows its gun (t.slow, course.js updateTurrets).
//              A plaza squad with the keel close for a while throws grapples (ring zips -> raiders).
//   BOOM CHAIN r.gar.chains: a span across the lane (see config.GARRISON.CHAIN): snags a ship with any part in it, snaps by itself or under fire; diving under it passes.
//   CATAPULT   the mortar's stones are made in ring.js (stone / fire flags); here only the flame where one lands.
//
// The dynamic state is r.gar (r = course.ring) and the faces' own f.posts / f.squads / f.flag / f.horn. Everything is deterministic: its own random stream, seeded from the course's once, when the ring is made.
import { config } from '../../config.js';
import { mainShip } from './ships.js';
import { toWorldX, toWorldY, toShipX, toShipY } from './pose.js';
import { shellDmg } from './aim.js';
import { pop } from './popups.js';

const GG = () => config.GARRISON;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// The seeded stream of the garrison (mulberry32).
const stream = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// For the helm bot (bots.js): { alt, ahead } = the altitude (state.ship.alt scale) that puts the whole ship under the nearest boom chain ahead of her (or just astern, still on her hull) and how far ahead it is, or null when no chain is in the way.
export function chainDive(state) {
  const r = state.course && state.course.ring;
  if (!r || !r.gar || !r.gar.chains.length || state.ship.down > 0) return null;
  const ship = mainShip(state), f = ship.pose.f, L = ship.layout, B = L.bounds, C = GG().CHAIN;
  const rx = toWorldX(ship, L.refPoint.x), span = B.x1 - B.x0;
  for (const c of r.gar.chains) {
    if (c.broken) continue;
    const ahead = (c.x - rx) * f;
    if (ahead > C.LOOKOUT || ahead < -span) continue;
    return { alt: B.y0 - c.yLow - C.MARGIN, ahead };
  }
  return null;
}

// The pilot's plan (course.js pilotPlan, for the autopilot and the helm bots alike) with a boom chain in mind: never aim above the height that clears it; hold her where she is (speed 0) while she is still too high and close to it;
// and once she is under it, go on (the plan's own crawl was for its own height).
export function chainWay(state, plan, cruise) {
  const d = chainDive(state);
  if (!d) return plan;
  plan.target = Math.min(plan.target, d.alt);
  if (state.ship.alt > d.alt + 100) { if (d.ahead < GG().CHAIN.LOOKOUT * 0.4) plan.speed = Math.min(plan.speed, 0); }
  else if (plan.dx > 0) plan.speed = Math.max(plan.speed, cruise * 0.6);
  return plan;
}

export function createGarrison({ state, puff, credit }) {
  const crs = () => state.course;
  const rr = () => state.course && state.course.ring;
  let deps = {}; // dropSquad, blast (ring.js binds them)
  let rand = Math.random;
  let nextId = 1;
  const sfx = (...a) => state.sfxQ && state.sfxQ.push(a);
  const moment = (kind, who, data) => state.moment && state.moment(kind, { who: who ? [who] : [], where: null, data });
  const shipsLive = () => state.ships.filter((sh) => !sh.ai && !sh.piece && !sh.gone && sh.sim && !sh.ctx.wreck && sh.ctx.ship.down <= 0);
  const aimOf = (sh) => ({ x: toWorldX(sh, sh.layout.aimPoint.x), y: toWorldY(sh, sh.layout.aimPoint.y) });
  // The ship nearest to (x, y) whose aim point is within `range`, or null.
  const nearest = (x, y, range) => {
    let best = null;
    for (const sh of shipsLive()) { const a = aimOf(sh), d = Math.hypot(a.x - x, a.y - y); if (d <= range && (!best || d < best.d)) best = { sh, d, a }; }
    return best;
  };
  const jinking = (sh) => { const helm = Object.values(state.players).find((q) => sh.layout.kindOf(q.lock) === 'helm'); return !!helm && Math.abs(helm.jy) > 0.3; };

  // ---------- a new ring ----------
  // Called by ring.js begin() once the faces' dynamic side exists: the posts, the squads, the chains.
  function begin(r, map) {
    const G = GG();
    if (!G.ENABLED) return;
    rand = stream(Math.floor(crs().rand() * 4294967296));
    nextId = 1;
    const A = G.ARCHER, SQ = G.SQUAD, CR = G.CREW;
    r.gar = { t: 0, busy: null, grapGap: 0, stats: { volleys: 0, arrows: 0, bolts: 0, postsDown: 0, squadsBombed: 0, squadsShot: 0, cheers: 0, flees: 0, surrenders: 0, grapples: 0, snags: 0, snaps: 0, calls: 0, stones: 0, chainPower: 0 }, seen: {}, chains: (map.ring.chains || []).map((c) => ({ ...c, hp: G.CHAIN.HP, max: G.CHAIN.HP, snag: 0, tick: 0, broken: false, snagging: false, called: false })) };
    const mf = map.ring.faces;
    r.faces.forEach((f, i) => {
      f.flag = 0;
      f.horn = 0;
      f.posts = (mf[i].posts || []).map((p, k) => ({ x: p.x, y: p.y, k, face: f.i, hp: A.HP, max: A.HP, dead: false, mode: 'idle', t: A.FIRST[0] + rand() * (A.FIRST[1] - A.FIRST[0]) + k * 1.7, telegraph: 0, lit: 0, aim: null, n: 0, shot: 0, looseT: 0, jink: false }));
      if (f.special.kind === 'ballista') f.special.t = G.BALLISTA.FIRST[0] + rand() * (G.BALLISTA.FIRST[1] - G.BALLISTA.FIRST[0]); // (its first lock comes after a while in range, not the moment she arrives)
      f.squads = [];
      (mf[i].plazas || []).forEach((pz, k) => {
        for (let q = 0; q < SQ.PER_PLAZA; q++) {
          const x = pz.x0 + ((pz.x1 - pz.x0) * (q + 1)) / (SQ.PER_PLAZA + 1);
          f.squads.push({ id: nextId++, face: f.i, kind: 'plaza', plaza: k, x, y: pz.y, home: x, n: SQ.MEN, max: SQ.MEN, state: 'muster', t: 0, cheer: 0, phase: rand() * 6.28, grapT: 0, grapCd: 2 + rand() * 4, fleeTo: 0, gun: null });
        }
      });
      for (const t of crs().turrets) if (t.outpost === f.i) f.squads.push({ id: nextId++, face: f.i, kind: 'gun', plaza: -1, x: t.mx + 70, y: f.y, home: t.mx + 70, n: CR.MEN, max: CR.MEN, state: 'man', t: 0, cheer: 0, phase: rand() * 6.28, grapT: 0, grapCd: 0, fleeTo: 0, gun: t });
    });
  }

  // ---------- the step ----------
  function update(dt) {
    const r = rr(), G = GG();
    if (!r || !r.gar || !G.ENABLED || state.ship.down > 0) return;
    const g = r.gar;
    g.t += dt;
    g.grapGap = Math.max(0, g.grapGap - dt);
    for (const f of r.faces) {
      f.flag = Math.max(0, f.flag - dt);
      f.horn = Math.max(0, f.horn - dt);
    }
    if (!r.crown) { // (once the crown falls the garrison stands down: only the men move)
      stepPosts(r, dt);
      for (const f of r.faces) if (!f.down) stepBallista(r, f, dt);
      stepChains(r, dt);
    }
    stepSquads(r, dt);
    hits(r);
    stones(r);
  }

  // ---------- archers ----------
  const fireArrowsOn = (r) => { const F = GG().ARCHER.FIRE; return F.VARIANTS.includes(r.variant) || F.ENVS.includes(state.env && state.env.id); };
  function stepPosts(r, dt) {
    const A = GG().ARCHER, g = r.gar;
    for (const f of r.faces) {
      if (f.down) continue;
      for (const p of f.posts) {
        if (p.dead) continue;
        if (p.mode === 'idle') {
          const tg = nearest(p.x, p.y, A.RANGE);
          if (!tg) { p.t = Math.max(p.t, 1); continue; }
          if ((p.t -= dt) > 0) continue;
          if (g.busy) { p.t = 0.4; continue; } // (one telegraph at a time: ask again in a moment)
          // the tell: the horn, the flag, the arc
          p.mode = 'tell';
          p.telegraph = A.TELL;
          p.tg = tg.sh;
          p.aim = { x: tg.a.x, y: tg.a.y };
          g.busy = p;
          f.flag = A.TELL + A.LOOSE + 2.5;
          f.horn = 1.5;
          sfx('horn');
          pop(state, p.x, p.y - 100, 'ARCHERS!', '#ffb347', 1.1);
        } else if (p.mode === 'tell') {
          const sh = p.tg;
          if (!shipsLive().includes(sh)) { endVolley(r, p); continue; }
          const a = aimOf(sh);
          p.aim.x = a.x;
          p.aim.y = a.y;
          if ((p.telegraph -= dt) > 0) continue;
          p.mode = 'loose';
          p.n = Math.round(A.COUNT[0] + rand() * (A.COUNT[1] - A.COUNT[0]));
          p.shot = 0;
          p.looseT = 0;
          p.jink = jinking(sh);
          p.fire = fireArrowsOn(r);
          r.gar.stats.volleys++;
        } else {
          p.looseT += dt;
          const want = Math.min(p.n, Math.ceil((p.n * p.looseT) / A.LOOSE));
          while (p.shot < want) { loose(r, f, p); p.shot++; }
          if (p.shot >= p.n) endVolley(r, p);
        }
      }
    }
  }
  const endVolley = (r, p) => {
    const A = GG().ARCHER;
    p.mode = 'idle';
    p.telegraph = 0;
    p.aim = null;
    p.tg = null;
    p.t = A.EVERY[0] + rand() * (A.EVERY[1] - A.EVERY[0]);
    if (r.gar.busy === p) r.gar.busy = null;
  };
  // One arrow: lobbed at a random spot of the ship (hull and bag), led by her speed; it cannot climb more than CLIMB above the post (a ship high enough is out of reach).
  function loose(r, f, p) {
    const A = GG().ARCHER, sh = p.tg;
    if (!sh) return;
    const B = sh.layout.bounds;
    const sx = B.x0 + rand() * (B.x1 - B.x0), sy = B.y0 + rand() * (B.y1 - B.y0);
    const px = p.x, py = p.y - 20;
    const wx = toWorldX(sh, sx), wy = toWorldY(sh, sy);
    const T = clamp(Math.hypot(wx - px, wy - py) / A.SPEED_HINT + (rand() - 0.5) * 0.14, A.T[0], A.T[1]);
    const tx = wx + sh.pose.vx * T;
    const vx = (tx - px) / T;
    let vy = (wy - py) / T - 0.5 * A.GRAVITY * T;
    vy = Math.max(vy, -Math.sqrt(2 * A.GRAVITY * A.CLIMB)); // (out of climb: it falls short)
    const miss = rand() < (p.lit > 0 ? A.DAZZLE_MISS : A.MISS) || (p.jink && rand() < A.JINK_MISS);
    const burn = p.fire && rand() < A.FIRE.SHARE;
    state.bullets.push({ x: px, y: py, vx, vy, ay: A.GRAVITY, life: T + 0.6, miss, dmg: A.DMG, kind: 'arrow', arrow: true, ...(burn ? { fire: A.FIRE.IGNITE, burn: true } : {}) });
    r.gar.stats.arrows++;
  }

  // ---------- the ballista ----------
  function stepBallista(r, f, dt) {
    const B = GG().BALLISTA, sp = f.special, g = r.gar;
    if (sp.dead || sp.kind !== 'ballista') return;
    if (sp.lock) {
      const L = sp.lock;
      if (!shipsLive().includes(L.ship)) { sp.lock = null; if (g.busy === sp) g.busy = null; sp.t = B.EVERY * 0.5; return; }
      L.t -= dt;
      if (L.t > B.FREEZE) { // the line tracks her (led by her speed over the bolt's flight) until the last moment
        const a = aimOf(L.ship), d = Math.hypot(a.x - L.x0, a.y - L.y0);
        L.x1 = a.x + L.ship.pose.vx * (d / B.SPEED);
        L.y1 = a.y;
      }
      if (L.t > 0) return;
      const d = Math.hypot(L.x1 - L.x0, L.y1 - L.y0) || 1, miss = rand() < B.MISS || (jinking(L.ship) && rand() < B.JINK_MISS);
      state.bullets.push({ x: L.x0, y: L.y0, vx: ((L.x1 - L.x0) / d) * B.SPEED, vy: ((L.y1 - L.y0) / d) * B.SPEED, life: d / B.SPEED + 1.2, miss, dmg: B.POWER, kind: 'bolt', bolt: true });
      g.stats.bolts++;
      puff(L.x0, L.y0, '#bbb', 6);
      sfx('cannon');
      sp.lock = null;
      sp.t = B.EVERY * (0.85 + 0.3 * rand());
      if (g.busy === sp) g.busy = null;
      return;
    }
    const tg = nearest(sp.x, sp.y, B.RANGE);
    if (!tg) { sp.t = Math.max(sp.t, 1.5); return; }
    if ((sp.t -= dt) > 0) return;
    if (g.busy) { sp.t = 0.4; return; }
    sp.lock = { t: B.LOCK, max: B.LOCK, ship: tg.sh, x0: sp.x, y0: sp.y - 100, x1: tg.a.x, y1: tg.a.y };
    g.busy = sp;
    f.flag = B.LOCK + 2.5;
    f.horn = 1.5;
    sfx('horn');
    pop(state, sp.x, sp.y - 190, 'BALLISTA!', '#ffe9b0', 1.1);
  }

  // ---------- squads ----------
  function stepSquads(r, dt) {
    const G = GG(), SQ = G.SQUAD, GR = G.GRAPPLE, g = r.gar;
    const ms = mainShip(state), MB = ms.layout.bounds;
    // blows on a ship make the castle's men cheer (any enemy blow that has landed since the last step)
    const cheerFrom = [];
    for (const sh of shipsLive()) {
      const log = sh.ctx.hitLog || [], last = log.length ? log[log.length - 1].n : 0, was = g.seen[sh.id] ?? last;
      g.seen[sh.id] = last;
      if (last > was && log.some((h) => h.n > was && h.kind !== 'rock' && h.kind !== 'ram' && h.kind !== 'crash')) cheerFrom.push(toWorldX(sh, sh.layout.refPoint.x));
    }
    const keelY = toWorldY(ms, MB.y1), xa = toWorldX(ms, MB.x0), xb = toWorldX(ms, MB.x1), kLo = Math.min(xa, xb), kHi = Math.max(xa, xb);
    for (const f of r.faces) {
      for (const q of f.squads) {
        if (q.state === 'dead') continue;
        q.t += dt;
        if (q.kind === 'gun' && q.gun.dead && q.state !== 'flee' && q.state !== 'surrender') flee(r, f, q);
        if (q.state === 'flee') {
          const to = q.fleeTo, d = to - q.x;
          if (Math.abs(d) > 4) q.x += Math.sign(d) * Math.min(Math.abs(d), SQ.FLEE_SPEED * dt);
          continue;
        }
        if (q.state === 'surrender') continue;
        if (q.kind === 'plaza') q.x = q.home + Math.sin(g.t * 0.5 + q.phase) * SQ.SWAY;
        if (q.state === 'cheer') { if ((q.cheer -= dt) <= 0) q.state = q.kind === 'gun' ? 'man' : 'muster'; }
        else if (cheerFrom.some((cx) => Math.abs(cx - q.x) < SQ.CHEER_RANGE)) { q.state = 'cheer'; q.cheer = SQ.CHEER; g.stats.cheers++; }
        // the grapple: the keel close to a plaza squad for long enough
        if (q.kind !== 'plaza' || f.down) continue;
        q.grapCd -= dt;
        const kx = clamp(q.x, kLo, kHi), d = Math.hypot(kx - q.x, keelY - (q.y - 60));
        q.grapT = d < GR.RANGE && ms.ctx.ship.down <= 0 ? q.grapT + dt : Math.max(0, q.grapT - dt * 2);
        const swing = q.grapT > GR.NEED * 0.5 && q.grapCd <= 0; // (the tell: the soldiers swing a grapple - climb out of their reach)
        if (swing && !q.swing) pop(state, q.x, q.y - 200, 'GRAPPLES!', '#ffd23f', 1);
        q.swing = swing;
        if (q.grapT >= GR.NEED && q.grapCd <= 0 && g.grapGap <= 0 && q.n > GR.MEN && state.boarders.length < GR.MAX && deps.dropSquad) throwGrapple(r, f, q, ms);
      }
    }
  }
  function throwGrapple(r, f, q, ms) {
    const GR = GG().GRAPPLE, E = ms.layout.boarderEntryPoints;
    let best = E[E.length - 1];
    for (const e of E) if (Math.abs(toWorldX(ms, e.x) - q.x) < Math.abs(toWorldX(ms, best.x) - q.x)) best = e;
    r.zips.push({ face: f.i, x0: q.x, y0: q.y - 80, ex: best.x, t: 0, dur: GR.TIME, grapple: true, men: GR.MEN });
    q.grapCd = GR.EVERY;
    r.gar.grapGap = GR.GAP;
    q.grapT = 0;
    q.n -= GR.MEN;
    r.gar.stats.grapples++;
    state.say('boarders', 'GRAPPLES! THEY ARE CLIMBING ABOARD!', null, 2.5);
    sfx('charge');
  }
  function flee(r, f, q) {
    if (q.state === 'dead' || q.state === 'flee') return;
    q.state = 'flee';
    const pl = crs().map.ring.faces[f.i].plat;
    q.fleeTo = q.x < f.x ? pl.x0 - 200 : pl.x1 + 200; // (off the platform, to the nearer end)
    r.gar.stats.flees++;
  }
  const kill = (r, q, how, owner) => {
    q.state = 'dead';
    q.n = 0;
    state.kills += 1; // (salvage: a dead squad is a kill)
    r.gar.stats[how === 'bomb' ? 'squadsBombed' : 'squadsShot']++;
    if (q.kind === 'gun' && q.gun && !q.gun.dead) q.gun.slow = GG().CREW.SLOW; // (the manned cannon: a dead crew slows its gun)
    puff(q.x, q.y - 40, '#c9a875', 10);
    pop(state, q.x, q.y - 110, 'kill', '#ffd23f', 0.9);
  };

  // ---------- shells ----------
  function hits(r) {
    const G = GG(), A = G.ARCHER, SQ = G.SQUAD, CR = G.CREW, CH = G.CHAIN;
    for (const s of state.shells) {
      if (s.life <= 0) continue;
      let done = false;
      for (const f of r.faces) {
        if (f.down) continue;
        for (const p of f.posts) {
          if (p.dead || Math.hypot(s.x - p.x, s.y - p.y) > A.HIT_R) continue;
          s.life = 0;
          p.hp -= shellDmg(s, p);
          puff(s.x, s.y, '#ffcf40', 6);
          if (p.hp <= 0) wreckPost(r, p, s);
          done = true;
          break;
        }
        if (done) break;
        for (const q of f.squads) {
          if (q.state === 'dead' || q.state === 'surrender' || Math.abs(s.x - q.x) > (q.n * SQ.HIT_W) / 2 + 24 || s.y < q.y - 120 || s.y > q.y + 30) continue;
          s.life = 0;
          q.n -= CR.SHELL_MEN;
          puff(s.x, s.y, '#c9a875', 6);
          if (q.n <= 0) { kill(r, q, 'shell'); credit?.(s); }
          done = true;
          break;
        }
        if (done) break;
      }
      if (done) continue;
      for (const c of r.gar.chains) { // the chain: a shell through its span
        if (c.broken || Math.abs(s.x - c.x) > 42 || s.y < c.yTop || s.y > c.yLow) continue;
        s.life = 0;
        c.hp -= shellDmg(s, c) * CH.SHELL_MUL;
        puff(s.x, s.y, '#ffd23f', 6);
        if (c.hp <= 0) snap(r, c, 'shot');
        break;
      }
    }
    // a bomb in flight that meets a post or the chain goes off there
    for (let i = state.shipBombs.length - 1; i >= 0; i--) {
      const b = state.shipBombs[i];
      if (b.done) continue;
      let hit = r.faces.some((f) => !f.down && f.posts.some((p) => !p.dead && Math.hypot(b.x - p.x, b.y - p.y) < A.BOMB_R));
      if (!hit) hit = r.gar.chains.some((c) => !c.broken && Math.abs(b.x - c.x) < 60 && b.y > c.yTop && b.y < c.yLow);
      if (!hit) continue;
      state.shipBombs.splice(i, 1);
      if (deps.blast) deps.blast(b);
    }
  }
  function wreckPost(r, p, by) {
    if (p.dead) return;
    p.dead = true;
    p.mode = 'idle';
    r.gar.stats.postsDown++;
    state.kills += 1;
    if (by) credit?.(by);
    if (r.gar.busy === p) r.gar.busy = null;
    puff(p.x, p.y, '#ff5a1f', 14);
    pop(state, p.x, p.y - 80, 'kill');
  }

  // ---------- bombs (ring.js blast calls this for every bomb that explodes) ----------
  function blast(b) {
    const r = rr(), G = GG(), R = config.BOMBS.RADIUS;
    if (!r || !r.gar) return;
    let squads = 0;
    for (const f of r.faces) {
      for (const p of f.posts) if (!p.dead && Math.hypot(b.x - p.x, b.y - p.y) < G.ARCHER.BOMB_R) wreckPost(r, p, b);
      for (const q of f.squads) {
        if (q.state === 'dead' || Math.hypot(b.x - q.x, b.y - (q.y - 40)) > R) continue;
        const crew = q.kind === 'gun';
        kill(r, q, 'bomb');
        if (!crew) squads++;
        credit?.(b);
      }
    }
    for (const c of r.gar.chains) if (!c.broken && Math.abs(b.x - c.x) < 90 && b.y > c.yTop && b.y < c.yLow + R) { c.hp -= G.CHAIN.BOMB; if (c.hp <= 0) snap(r, c, 'bombed'); }
    if (squads) {
      const owner = state.players[b.owner];
      pop(state, b.x, b.y - 170, 'SQUAD DOWN!', '#ffd23f', 1.1);
      if (owner) moment('ring-squad', owner, { name: r.name });
    }
  }

  // ---------- the boom chain ----------
  function stepChains(r, dt) {
    const C = GG().CHAIN, g = r.gar;
    const ships = shipsLive();
    for (const c of g.chains) {
      if (c.broken) continue;
      c.snagging = false;
      for (const sh of ships) {
        const L = sh.layout, B = L.bounds, f = sh.pose.f;
        const xa = toWorldX(sh, B.x0), xb = toWorldX(sh, B.x1), top = toWorldY(sh, B.y0), bot = toWorldY(sh, B.y1);
        const ahead = (c.x - toWorldX(sh, L.refPoint.x)) * f;
        if (sh.main) { // the lookout's call, once as she closes on it
          if (ahead > 0 && ahead < C.LOOKOUT && !c.called) { c.called = true; g.stats.calls++; state.say('helm', 'LOOKOUT: BOOM CHAIN AHEAD! DIVE UNDER IT!', null, 3); sfx('horn'); }
          else if (ahead > C.LOOKOUT * 1.4 || ahead < -C.LOOKOUT) c.called = false;
        }
        if (!(Math.min(xa, xb) < c.x && Math.max(xa, xb) > c.x && top < c.yLow && bot > c.yTop)) continue;
        // snagged: the bag has the chain
        if (!c.snagging) { c.snagging = true; if (c.snag === 0) { g.stats.snags++; pop(state, c.x, top - 80, 'SNAGGED!', '#ffd23f', 1.2); } }
        const st = sh.ctx.ship, TOP = config.SHIP.TOP_SPEED * (st.topMul || 1), u = st.speed * TOP;
        st.speed *= Math.max(0, 1 - C.DRAG * dt);
        if (u > 0) sh.pose.x -= f * Math.min(C.PULL, u) * dt; // (dragged back: she cannot get through while it holds)
        st.shake = Math.max(st.shake, 0.25);
        if (c.tick <= 0) {
          c.tick = C.TICK;
          const sx = toShipX(sh, c.x), bag = L.gasbags.find((q) => sx > q.x0 + 30 && sx < q.x1 - 30) || L.gasbags[0]; // (the tick lands on the top of the bag the chain has hold of)
          const by = bag ? bag.cy - bag.ry * Math.sqrt(Math.max(0, 1 - ((clamp(sx, bag.cx - bag.rx + 30, bag.cx + bag.rx - 30) - bag.cx) / bag.rx) ** 2)) + 30 : B.y0 + 50;
          sh.sim.impact(bag ? clamp(sx, bag.cx - bag.rx + 30, bag.cx + bag.rx - 30) : sx, by, C.POWER, 1, 'chain');
          g.stats.chainPower += C.POWER;
          puff(c.x, top + 40, '#ffd23f', 5);
        }
      }
      c.tick = Math.max(0, c.tick - dt);
      if (c.snagging && (c.snag += dt) >= C.SNAP_AFTER) snap(r, c, 'strain');
    }
  }
  function snap(r, c, how) {
    if (c.broken) return;
    c.broken = true;
    c.snagging = false;
    r.gar.stats.snaps++;
    for (let k = 0; k < 6; k++) puff(c.x, c.yLow - k * 140, '#ffd23f', 8);
    pop(state, c.x, c.yLow - 200, 'SNAP', '#ffd23f', 1.5);
    sfx('impact');
    state.say('setpiece', how === 'strain' ? 'THE CHAIN SNAPPED!' : 'THE CHAIN IS BROKEN!', null, 2.5);
  }

  // ---------- catapult stones: a flame where one lands ----------
  function stones(r) {
    for (const b of state.bullets) {
      if (!b.stone || b.landed || b.life > 0.07) continue;
      b.landed = true;
      r.gar.stats.stones++;
      if (b.burn) { puff(b.x, b.y, '#ff5a1f', 10); puff(b.x, b.y - 30, '#ffb347', 6); }
    }
  }

  // ---------- signals from ring.js ----------
  // A face is breached: its archers are silenced and its men run.
  function onBreach(f) {
    const r = rr();
    if (!r || !r.gar) return;
    for (const p of f.posts || []) { if (r.gar.busy === p) r.gar.busy = null; p.dead = true; p.mode = 'idle'; p.aim = null; p.telegraph = 0; }
    if (f.special.lock) { f.special.lock = null; if (r.gar.busy === f.special) r.gar.busy = null; }
    for (const q of f.squads || []) flee(r, f, q);
    f.flag = 0;
  }
  // The crown falls: whoever is left puts down his bow and waves a white flag.
  function onCrown() {
    const r = rr();
    if (!r || !r.gar) return;
    for (const f of r.faces) for (const q of f.squads || []) if (q.state !== 'dead') { q.state = 'surrender'; q.x = q.home; r.gar.stats.surrenders++; } // (even those who ran come back, hands up)
    for (const f of r.faces) for (const p of f.posts || []) { p.mode = 'idle'; p.aim = null; p.telegraph = 0; }
    r.gar.busy = null;
  }

  return { begin, update, blast, onBreach, onCrown, bind: (d) => { deps = d; } };
}
