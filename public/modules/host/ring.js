// THE RING (LOOP.md "The 3D add-on", package R0): the orbit finale's rules. maps.js buildRingMap makes the map (an approach, then the ring stretch with its castle FACES as outposts); this module plays it:
//
//   FACES      each face has its guns (course.turrets with outpost: i), a CORE in the keep wall behind a SHUTTER, and one SPECIAL. The core cannot be hurt while the shutter is shut. The shutter opens for CORE.OPEN_FOR
//              seconds as soon as the face's guns are all down, then again every CORE.EVERY seconds (the Kraken's beak window); while it is open shells and bombs take points off the core, and at 0 the face is BREACHED.
//              A shell or a bomb on a SHUT shutter chips the KEEP's pool instead (slow and safe): at 0 every face is breached at once.
//   SPECIALS   a bat hangar (bats), a flak battery, a mortar: all wrecked by shells. A BOARDING GALLERY: a landing surface (airborne.js, a provider per ship) on the keep wall; a crewman who lands on it walks it and holds
//              Action at the keep door to plant a CHARGE, which breaches the face FUSE seconds later. Its raiders zip-line to the ship now and then.
//   REVOLVING  some turrets (t.rev, px/s) ride a rail round the ring and wrap at its end.
//   VICTORY    every core down (or the keep's pool, or on a citadel the Flagship sunk): the crown falls (state.slow, a banner), the stop completes (the reward and the moments for the Ship's Book).
//   CITADEL    the Flagship is MOORED to the citadel's faces (squadrons.js spawnBoss reads course.ring.moor); each breached face cuts a mooring, and with both cut she falls.
//
// The dynamic state is course.ring (rebuilt for every ring map by begin(map), null on any other map). Everything here is deterministic given the course's random stream.
import { config } from '../../config.js';
import { mainShip, mendHull } from './ships.js';
import { toWorldX, toWorldY, toShipX, toShipY } from './pose.js';
import { shellDmg } from './aim.js';
import { pop } from './popups.js';
import { setGoal, stationCell, stationDist } from './maps.js';
import { createGarrison } from './garrison.js'; // (CASTLE.md D1: the castle's archers, ballista, squads and boom chain; config.GARRISON)

const RG = () => config.RING;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createRing({ state, puff, credit, onMarker }) {
  const crs = () => state.course;
  const rr = () => state.course && state.course.ring;
  let deps = {}; // spawnBats, spawnBoss, dropSquad, blast (simulation.js binds them once the squadrons and the raiders exist)
  const gar = createGarrison({ state, puff, credit }); // (it plays only while course.ring.gar is set: config.GARRISON.ENABLED)
  const warn = (text, secs = 3) => { state.ev.warn = secs; state.ev.warnText = text; };
  const shipAim = () => { const sh = mainShip(state), A = sh.layout.aimPoint; return { x: toWorldX(sh, A.x), y: toWorldY(sh, A.y) }; };
  const moment = (kind, who, data) => state.moment && state.moment(kind, { who: who ? [who] : [], where: null, data }); // (the Ship's Book: data only)
  const sfx = (...a) => state.sfxQ && state.sfxQ.push(a);

  // ---------- a new map ----------
  // Called by course.js startMission with the map just made (course.map): the faces' dynamic side, the keep's pool, the citadel's moorings.
  function begin(map) {
    const course = crs();
    if (!map.ring) { course.ring = null; return; }
    const G = RG(), V = G.VARIANTS[map.ring.variant] || G.VARIANTS.tower, GS = config.GARRISON;
    const spHp = (k) => { const K = G[k.toUpperCase()] || (GS && GS[k.toUpperCase()]); return K ? K.HP || 1 : 1; }; // (a special's hit points: its block in config.RING, or the garrison's ballista)
    const faces = map.ring.faces.map((f) => ({
      i: f.i, x: f.x, y: f.y, angle: f.angle, core: { ...f.core }, hp: V.CORE_HP, max: V.CORE_HP,
      open: 0, t: 0, windows: 0, down: false, how: null, by: {}, charge: null,
      special: { ...f.special, hp: spHp(f.special.kind), max: spHp(f.special.kind), dead: false, t: 3 + f.i * 1.3 },
      gal: f.gallery ? { ...f.gallery, job: { name: 'plant', prog: 0, worked: false }, zipT: G.GALLERY.ZIP_EVERY * 0.4 } : null,
    }));
    const r = {
      variant: map.ring.variant, name: map.ring.name, xRing: map.ring.xRing, R: map.ring.R, C: map.ring.C, axisY: map.ring.axisY, faces,
      keep: { hp: V.KEEP_HP, max: V.KEEP_HP }, crown: null, zips: [],
      moor: map.ring.variant === 'citadel' ? { x: faces.reduce((a, f) => a + f.x, 0) / faces.length, y: faces[0].y - G.MOOR.UP, faces: faces.map((f) => f.i), cut: faces.map(() => false), falling: false, fallT: 0, spawned: false } : null,
      stats: { windows: 0, coreShells: 0, coreBombs: 0, chips: 0, charges: 0, planted: 0, zips: 0, raiders: 0, bats: 0, flaks: 0, mortars: 0, boards: 0, breaches: [], wraps: 0, specialsDown: 0 },
    };
    course.ring = r;
    gar.begin(r, map);
    if (state.slow !== undefined && state.slow !== 1) state.slow = 1;
  }

  // ---------- small things ----------
  const turretsOf = (f) => crs().turrets.filter((t) => t.outpost === f.i);
  const liveTurrets = (f) => turretsOf(f).filter((t) => !t.dead);
  const rank = (f) => Object.entries(f.by).sort((a, b) => b[1] - a[1])[0];
  const whoOf = (id) => (id != null && state.players[id]) || null;

  // A face is breached: the core is gone, its guns and special with it, the outpost is done (its salvage), and on a citadel a mooring is cut.
  function breach(f, how, byId) {
    const r = rr(), course = crs(), map = course.map;
    if (f.down) return;
    f.down = true;
    f.how = how;
    f.open = 0;
    f.hp = 0;
    map.outposts[f.i].done = true;
    for (const t of turretsOf(f)) t.dead = true;
    f.special.dead = true;
    for (let k = 0; k < 7; k++) puff(f.x + (k - 3) * 55, f.y - 80 - (k % 3) * 70, k % 2 ? '#ff5a1f' : '#555', 22);
    pop(state, f.x, f.y - 360, 'bigHit', '#ffd23f', 1.8);
    sfx('impact');
    const top = rank(f);
    const who = whoOf(byId != null ? byId : top && top[0]);
    r.stats.breaches.push({ face: f.i, how, by: who ? who.name : null });
    gar.onBreach(f); // (its archers are silenced, its men run)
    if (config.MAPS.OUTPOST_REFILL && state.bombBay) state.bombBay.bombs = Math.max(state.bombBay.bombs, config.BOMBS.MAX);
    if (r.moor) { const k = r.moor.faces.indexOf(f.i); if (k >= 0 && !r.moor.cut[k]) { r.moor.cut[k] = true; if (r.moor.cut.every(Boolean) && !r.moor.falling) { r.moor.falling = true; r.moor.fallT = 0; } } }
    if (how !== 'keep') {
      const left = r.faces.filter((q) => !q.down).length;
      warn(r.moor && !r.moor.falling && left ? 'MOORING CUT! ' + left + ' TO GO' : left ? 'GATE ' + (f.i + 1) + ' BREACHED! ' + left + ' TO GO' : 'THE LAST GATE IS BREACHED!', 3.5);
      moment('ring-breach', who, { name: r.name, how });
    }
  }

  // The core takes points (only while the shutter is open); a shut shutter chips the keep's pool. `by` = the player id.
  function hitCore(f, points, by, how) {
    const r = rr(), G = RG();
    if (f.down) return false;
    if (f.open > 0) {
      f.hp -= points;
      if (by != null) f.by[by] = (f.by[by] || 0) + points;
      r.stats[how === 'bomb' ? 'coreBombs' : 'coreShells']++;
      if (f.hp <= 0) breach(f, how, by);
      return true;
    }
    chip(points * (how === 'bomb' ? G.CORE.CHIP_BOMB / G.CORE.BOMB : G.CORE.CHIP_SHELL / G.CORE.SHELL));
    return false;
  }
  function chip(points) {
    const r = rr();
    if (!r || r.crown) return;
    r.keep.hp = Math.max(0, r.keep.hp - points);
    r.stats.chips++;
    if (r.keep.hp <= 0) for (const f of r.faces) if (!f.down) breach(f, 'keep');
  }

  // A shutter opening throws the face's stores open too: the bomb bay is restocked (CORE.RESTOCK), so the window can be bombed.
  const restock = () => { if (RG().CORE.RESTOCK && state.bombBay) state.bombBay.bombs = Math.max(state.bombBay.bombs, config.BOMBS.MAX); };

  // ---------- the step ----------
  function update(dt) {
    const r = rr(), course = crs(), G = RG();
    if (!r || state.ship.down > 0) return;
    const sh = mainShip(state), aim = shipAim();
    // Revolving turrets travel round the ring (and wrap at its end: the 3D view makes it seamless).
    for (const t of course.turrets) {
      if (!t.rev || t.dead) continue;
      t.mx += t.rev * dt;
      if (t.mx >= r.xRing + r.C) { t.mx -= r.C; r.stats.wraps++; }
      t.cx = t.mx;
    }
    for (const f of r.faces) {
      if (f.down) continue;
      const alive = liveTurrets(f).length;
      // The shutter: opens when the guns are down, for OPEN_FOR s, then again every EVERY s.
      if (!alive) {
        if (f.windows === 0) { f.windows = 1; f.open = G.CORE.OPEN_FOR; f.t = G.CORE.EVERY; r.stats.windows++; warn('GATE ' + (f.i + 1) + ' SHUTTER OPEN - HIT THE CORE!', 3); sfx('roar'); restock(); }
        else if ((f.t -= dt) <= 0) { f.windows++; f.open = G.CORE.OPEN_FOR; f.t = G.CORE.EVERY; r.stats.windows++; warn('GATE ' + (f.i + 1) + ' SHUTTER OPEN AGAIN!', 3); sfx('roar'); restock(); }
        if (f.open > 0 && (f.open -= dt) <= 0) { f.open = 0; if (!f.down) warn('SHUTTER CLOSED - SHOOT THE GUNS OR WAIT', 2); }
      }
      stepSpecial(f, dt, aim, sh);
      if (f.charge && (f.charge.t -= dt) <= 0) explodeCharge(f);
    }
    zipStep(dt, sh);
    // Shells: the core's box (a shut shutter turns them back and chips the keep), and the specials.
    for (const s of state.shells) {
      if (s.life <= 0) continue;
      for (const f of r.faces) {
        if (f.down) continue;
        const c = f.core, sp = f.special;
        if (Math.abs(s.x - c.x) <= c.w / 2 + 12 && Math.abs(s.y - c.y) <= c.h / 2 + 12) {
          s.life = 0;
          const pts = (shellDmg(s, f) / config.GUNS.DAMAGE) * G.CORE.SHELL;
          const wasOpen = f.open > 0;
          hitCore(f, pts, s.owner, 'shell');
          puff(s.x, s.y, wasOpen ? '#ffd23f' : '#9aa3ab', wasOpen ? 8 : 4);
          if (!wasOpen) sfx('clang', false);
          else if (f.down) credit?.(s);
          break;
        }
        if (!sp.dead && sp.kind !== 'gallery' && Math.hypot(s.x - sp.x, s.y - (sp.y - 55)) < 75) {
          s.life = 0;
          sp.hp -= shellDmg(s, sp);
          puff(s.x, s.y, '#ffcf40', 6);
          if (sp.hp <= 0) {
            sp.dead = true;
            state.kills += 1;
            r.stats.specialsDown++;
            credit?.(s);
            puff(sp.x, sp.y - 60, '#ff5a1f', 20);
            pop(state, sp.x, sp.y - 160, 'kill');
          }
          break;
        }
      }
    }
    gar.update(dt); // (the garrison: archers, ballista, squads, the chain; after the cores and specials have had their shells)
    // The gallery's charge job wears off when nobody holds it.
    for (const f of r.faces) if (f.gal) { const j = f.gal.job; if (!j.worked) j.prog = Math.max(0, j.prog - dt * 0.4); j.worked = false; }
    citadelStep(r, dt, aim);
    // Victory.
    if (!r.crown) {
      const won = r.moor ? state.bossDownLap === course.lap || (r.moor.cut.every(Boolean) && !state.boss) : r.faces.every((f) => f.down); // (a citadel falls with its Flagship, sunk any way)
      if (won) crown(r.keep.hp <= 0 ? 'keep' : r.faces.every((f) => f.down) ? 'cores' : 'flagship');
    } else crownStep(r, dt);
  }

  // ---------- the specials ----------
  function stepSpecial(f, dt, aim, sh) {
    const G = RG(), sp = f.special, r = rr();
    if (sp.dead || sp.kind === 'gallery' || sp.kind === 'ballista') return; // (the ballista is the garrison's: garrison.js)
    const K = G[sp.kind.toUpperCase()];
    if (Math.hypot(aim.x - sp.x, aim.y - sp.y) > K.RANGE || state.ship.down) { sp.t = Math.max(sp.t, 1.5); return; }
    if ((sp.t -= dt) > 0) return;
    sp.t = K.EVERY * (0.85 + 0.3 * crs().rand());
    const A = sh.layout.refPoint, vs = sh.pose.vx;
    if (sp.kind === 'hangar') {
      if (deps.spawnBats) deps.spawnBats({ x: sp.x, y: sp.y - 160 }, K.BATS);
      r.stats.bats += K.BATS;
      warn('BATS FROM THE HANGAR!', 2);
      puff(sp.x, sp.y - 140, '#4a3b5c', 8);
      return;
    }
    const fy = sp.y - 100;
    if (sp.kind === 'flak') {
      const helm = Object.values(state.players).find((q) => sh.layout.kindOf(q.lock) === 'helm');
      const miss = crs().rand() < K.MISS || (helm && Math.abs(helm.jy) > 0.3 && crs().rand() < 0.4);
      const tx = toWorldX(sh, A.x - 500 + crs().rand() * 1000), ty = toWorldY(sh, A.y - 100 + crs().rand() * 400) + (miss ? -900 : 0);
      const d = Math.hypot(tx - sp.x, ty - fy) || 1;
      state.bullets.push({ x: sp.x, y: fy, vx: ((tx - sp.x) / d) * K.SPEED + vs, vy: ((ty - fy) / d) * K.SPEED, miss, life: 5, flak: true });
      r.stats.flaks++;
    } else {
      const T = K.FLIGHT, tx = toWorldX(sh, A.x - 400 + crs().rand() * 800) + vs * T, ty = toWorldY(sh, A.y - 50 + crs().rand() * 300);
      state.bullets.push({ x: sp.x, y: fy, vx: (tx - sp.x) / T, vy: (ty - fy) / T - 0.5 * K.GRAVITY * T, ay: K.GRAVITY, life: T + 0.05, miss: crs().rand() < K.MISS, dmg: K.DAMAGE, mortar: true, ...stoneFlags(r) });
      r.stats.mortars++;
    }
    puff(sp.x, fy - 20, '#555', 4);
    if (state.flashes) state.flashes.push({ x: sp.x, y: fy - 20, ang: -Math.PI / 2, t: 0.12, color: '#ffcf80', size: 1.6 });
    sfx('cannon');
  }

  // The catapult's stone (garrison on): the mortar's shell is a stone; on the citadel and in the Ember sky it burns, and lights a deck it hits.
  const stoneFlags = (r) => (r.gar ? { stone: true, kind: 'stone', ...(r.variant === 'citadel' || (state.env && state.env.id === 'ember') ? { burn: true, fire: config.GARRISON.STONE.FIRE } : {}) } : {});

  // The gallery's raiders: a line from the keep door to the ship's boarding point; when it arrives a squad drops aboard.
  function zipStep(dt, sh) {
    const r = rr(), G = RG().GALLERY;
    const aim = shipAim();
    for (const f of r.faces) {
      const g = f.gal;
      if (!g || f.down) continue;
      if (Math.hypot(aim.x - g.door, aim.y - g.y) > G.ZIP_RANGE || state.ship.down || state.boarders.length >= G.ZIP_MAX) { g.zipT = Math.max(g.zipT, 1.5); continue; }
      if ((g.zipT -= dt) > 0) continue;
      g.zipT = G.ZIP_EVERY;
      const e = sh.layout.boarderEntryPoints[sh.layout.boarderEntryPoints.length - 1];
      r.zips.push({ face: f.i, x0: g.door, y0: g.y - 30, ex: e.x, t: 0, dur: G.ZIP_TIME });
      r.stats.zips++;
      warn('RAIDERS ZIP-LINING FROM THE GALLERY!', 2.5);
    }
    for (const z of r.zips) {
      z.t += dt;
      const s = clamp(z.t / z.dur, 0, 1);
      z.x1 = toWorldX(sh, z.ex);
      z.y1 = toWorldY(sh, z.grapple ? sh.layout.bounds.y1 - 30 : -230); // (a grapple hooks the keel)
      z.x = z.x0 + (z.x1 - z.x0) * s;
      z.y = z.y0 + (z.y1 - z.y0) * s + Math.sin(s * Math.PI) * 60;
      if (z.t >= z.dur && deps.dropSquad) { deps.dropSquad(z.ex, -200 + sh.pose.y, z.men); r.stats.raiders++; z.done = true; }
    }
    r.zips = r.zips.filter((z) => !z.done && z.t < z.dur + 0.5);
  }

  // ---------- bombs (course.js blast calls this for every bomb that explodes) ----------
  function blast(b) {
    const r = rr(), G = RG(), R = config.BOMBS.RADIUS;
    if (!r) return;
    gar.blast(b); // (squads, posts and the chain)
    for (const f of r.faces) {
      if (f.down) continue;
      const c = f.core;
      if (Math.abs(b.x - c.x) < c.w / 2 + R * 0.6 && Math.abs(b.y - c.y) < c.h / 2 + R) {
        const was = f.open > 0;
        hitCore(f, G.CORE.BOMB, b.owner, 'bomb');
        if (was && f.down) credit?.(b);
        const owner = state.players[b.owner];
        if (owner && was) { owner.stats = owner.stats || {}; owner.stats.demolished = (owner.stats.demolished || 0) + 1; }
      }
      const sp = f.special;
      if (!sp.dead && sp.kind !== 'gallery' && Math.hypot(b.x - sp.x, b.y - sp.y) < R) {
        sp.dead = true;
        state.kills += 1;
        r.stats.specialsDown++;
        puff(sp.x, sp.y - 60, '#ff5a1f', 16);
      }
    }
  }

  // ---------- the gallery: landing, walking, the charge ----------
  // The landing surfaces for `sh`'s crew (airborne.js providers; ship coordinates). Landing boards.
  function surfaces(sh) {
    const r = rr();
    if (!r || r.crown || !sh || sh.ctx.wreck) return [];
    const out = [];
    for (const f of r.faces) {
      const g = f.gal;
      if (!g || f.down) continue;
      const a = toShipX(sh, g.x0), b = toShipX(sh, g.x1);
      out.push({ id: 'ring:gallery' + f.i, y: toShipY(sh, g.y), x0: Math.min(a, b), x1: Math.max(a, b), onLand: (p) => board(sh, p, f.i) });
    }
    return out;
  }
  // Put a flying crewman on the gallery of face i (landed on it, or forced by a test): p.on = { ring: i, x } and he is a world object pinned to the ledge.
  function board(sh, p, i) {
    const r = rr(), f = r && r.faces[i], g = f && f.gal;
    if (!g || f.down) return false;
    const wx = p.fly ? p.x : toWorldX(sh, p.x);
    p.on = { ring: i, x: clamp(wx, g.x0 + 40, g.x1) };
    p.fly = true;
    p.air = false;
    p.jz = 0;
    p.fvx = p.fvy = 0;
    p.x = p.on.x;
    p.y = g.y;
    p.rot = 0;
    p.chute = 0;
    p.chuteOpen = false;
    p.cannon = false;
    p.tossed = false;
    p.hook = null;
    p.noLand = 0;
    r.stats.boards++;
    if (!p.bot) pop(state, p.x, p.y - 160, 'BOARDED!', '#ffd23f', 1.2);
    return true;
  }
  // Off the gallery: JUMP leaps toward the ship, anything else just drops him (a flyer again, with a parachute button).
  function dismount(p, how) {
    const o = p.on;
    if (!o) return;
    const sh = mainShip(state), G = RG().GALLERY;
    p.on = null;
    p.act = p.grabAct = null;
    p.fire = false;
    p.prog = 0;
    p.fly = true;
    p.air = false;
    p.tossed = true;
    p.chute = 0;
    p.rot = 0;
    if (how === 'jump') {
      const toward = Math.sign(toWorldX(sh, sh.layout.refPoint.x) - p.x) || 1;
      p.fvx = toward * G.JUMP_VX;
      p.fvy = -G.JUMP_VY;
      p.noLand = 0.3;
    } else {
      p.fvx = how === 'blast' ? -200 : 0;
      p.fvy = how === 'blast' ? -260 : 120;
      p.noLand = 0;
    }
    p.apex = toShipY(sh, p.y);
    p.lsy = p.apex;
    p.stag = 0;
  }
  const gallerySafe = (p) => { const r = rr(), f = r && r.faces[p.on.ring]; return f && f.gal && !f.down && !r.crown ? f : null; };
  function boardCheck(p) {
    if (!p.on || p.on.ring == null) return;
    if (!gallerySafe(p) || p.ko > 0 || p.fall) dismount(p, 'gone');
  }
  // One step of a crewman on a gallery (shipSim.js, where a walker's step would be): the stick walks it, JUMP leaves, hold Action at the keep door plants the charge.
  function boarderStep(sh, p, dt, holdOk) {
    const f = gallerySafe(p), G = RG().GALLERY;
    if (!f) return dismount(p, 'gone');
    const g = f.gal, o = p.on;
    p.actQ = false;
    p.grabQ = false;
    p.hook = null;
    p.lock = null;
    p.conn = null;
    if (p.bot) { // (only a test puts a bot here: it walks to the door and holds Action there)
      p.jx = (Math.abs(g.door - o.x) > 40 ? Math.sign(g.door - o.x) : 0) * sh.pose.f;
      p.fire = !f.charge;
      p.jumpQ = !!f.charge && f.charge.t < RG().GALLERY.FUSE - 1.2;
    }
    if (p.jumpQ) {
      p.jumpQ = false;
      return dismount(p, 'jump');
    }
    const dir = clamp(p.jx || 0, -1, 1) * sh.pose.f;
    if (Math.abs(dir) > 0.15) {
      o.x = clamp(o.x + dir * G.WALK * dt, g.x0 + 40, g.door + 30);
      p.face = dir < 0 ? -1 : 1;
    }
    p.x = o.x;
    p.y = g.y;
    p.fvx = p.fvy = 0;
    p.moving = Math.abs(dir) > 0.15;
    p.climb = false;
    p.rot = 0;
    p.jz = 0;
    const atDoor = Math.abs(o.x - g.door) < 90;
    const act = f.charge ? { type: 'wait', label: 'CHARGE SET! JUMP OFF - RUN!' } : atDoor ? { type: 'plant', obj: g.job, hold: true, time: G.PLANT_TIME, label: 'PLANT THE CHARGE!' } : { type: 'wait', label: 'WALK TO THE KEEP DOOR' };
    p.act = act;
    p.grabAct = null;
    if (act.type === 'plant' && p.fire && holdOk(p)) {
      g.job.worked = true;
      g.job.prog += dt / act.time;
      if (g.job.prog >= 1) {
        g.job.prog = 0;
        f.charge = { t: G.FUSE, by: p.id };
        rr().stats.planted++;
        warn('CHARGE SET AT THE KEEP DOOR! GET CLEAR!', 3);
        pop(state, g.door, g.y - 140, 'CHARGE SET!', '#ff5a1f', 1.4);
        moment('ring-charge', p, { name: rr().name });
        sfx('charge');
      }
    }
  }
  function explodeCharge(f) {
    const r = rr(), G = RG().GALLERY, who = f.charge && f.charge.by;
    f.charge = null;
    r.stats.charges++;
    for (const p of Object.values(state.players)) if (p.on && p.on.ring === f.i && Math.abs(p.on.x - f.gal.door) < G.BLAST_R) dismount(p, 'blast');
    breach(f, 'charge', who);
    state.ship.shake = Math.max(state.ship.shake, 0.4);
  }
  // A test (config.RING.FORCE_BOARD, bots.js): put this bot on a gallery. Returns true when he is aboard.
  function forceBoard(sh, p) {
    const r = rr();
    if (!r) return false;
    const f = r.faces.find((q) => q.gal && !q.down);
    if (!f) return false;
    return board(sh, p, f.i);
  }

  // ---------- the citadel's Flagship ----------
  function citadelStep(r, dt, aim) {
    const m = r.moor;
    if (!m) return;
    if (!m.spawned && !state.boss && state.bossDownLap !== crs().lap && Math.hypot(aim.x - m.x, aim.y - m.y) < 6500 && deps.spawnBoss) {
      m.spawned = true;
      deps.spawnBoss();
    }
  }

  // ---------- the crown falls ----------
  function crown(how) {
    const r = rr();
    if (r.crown) return;
    r.crown = { how, t: 0, done: false };
    warn(r.name + ' FALLS!', 6);
    pop(state, r.faces[0].x, r.faces[0].y - 500, 'boss', '#ffd23f', 2.4);
    for (const f of r.faces) for (let k = 0; k < 6; k++) puff(f.x + (k - 3) * 90, f.y - 120 - k * 40, k % 2 ? '#ff5a1f' : '#ffd23f', 20);
    state.slow = RG().CROWN.SLOW;
    gar.onCrown(); // (the garrison surrenders)
    for (const p of Object.values(state.players)) if (p.on && p.on.ring != null) dismount(p, 'gone');
    const last = r.stats.breaches.length ? state.players && Object.values(state.players).find((q) => q.name === r.stats.breaches[r.stats.breaches.length - 1].by) : null;
    moment('ring-fall', last || null, { name: r.name, how });
  }
  function crownStep(r, dt) {
    const C = RG().CROWN, course = crs();
    r.crown.t += dt;
    if (r.crown.t >= C.SLOW_FOR && state.slow !== 1) state.slow = 1;
    if (r.crown.t >= C.DONE_AFTER && !r.crown.done) {
      r.crown.done = true;
      state.slow = 1;
      if (!course.done) {
        course.done = true;
        mendHull(state, C.HULL);
        course.pendingNext = true;
        course.progress = 1;
        warn(r.name + ' HAS FALLEN! MISSION ' + course.lap + ' COMPLETE', 4);
        if (onMarker) onMarker({ kind: 'home', lap: course.lap + 1 });
      }
    }
  }

  // ---------- the stop's progress (course.js mapProgress calls this for a ring map) ----------
  // Like an outpost raid: the faces are fought nearest first; the goal the route points at is the station over the nearest standing gun of the target face, else over its core.
  function progress(sx, sy) {
    const r = rr(), course = crs(), map = course.map;
    const down = r.faces.filter((f) => f.down).length;
    course.progress = r.crown ? 1 : Math.min(0.99, RG().PROGRESS_APPROACH * clamp(sx / r.xRing, 0, 1) + (1 - RG().PROGRESS_APPROACH) * (down / r.faces.length));
    if (course.done) return;
    const left = map.outposts.filter((o) => !o.done);
    if (!left.length) return;
    if (!course.target || course.target.done) {
      course.target = left.map((o) => ({ o, d: stationDist(map, o, sx, sy) })).sort((a, b) => a.d - b.d)[0].o;
      course.stationGun = null;
      course.stationFace = null;
      course.stuckBest = null;
      setGoal(map, stationCell(map, course.target));
    }
    if (!course.target.done && (!course.stationGun || course.stationGun.dead)) {
      const idx = map.outposts.indexOf(course.target);
      const live = course.turrets.filter((t) => t.outpost === idx && !t.dead);
      course.stationGun = live.sort((a, b) => Math.abs(a.mx - sx) - Math.abs(b.mx - sx))[0] || null;
      if (course.stationGun) { setGoal(map, stationCell(map, { x: course.stationGun.mx, y: course.stationGun.my - 20 })); course.stuckBest = null; }
      else if (course.stationFace !== course.target) { course.stationFace = course.target; setGoal(map, stationCell(map, course.target)); course.stuckBest = null; }
    }
  }

  return { begin, update, blast, progress, surfaces, board, boardCheck, boarderStep, forceBoard, dismount, hitCore, chip, bind: (d) => { deps = d; gar.bind(d); }, garrison: gar, get state() { return rr(); } };
}

// ---- helpers for the drawing, the HUD and the tools (pure; take course.ring) ----
// The ring angle (0 .. 2 pi, clockwise from the top of the dial) of a world x on a ring map; negative on the approach.
export const ringAngle = (r, x) => (x - r.xRing) / r.R;
// The face whose shutter is open now (or null).
export const openFace = (r) => (r ? r.faces.find((f) => !f.down && f.open > 0) || null : null);
