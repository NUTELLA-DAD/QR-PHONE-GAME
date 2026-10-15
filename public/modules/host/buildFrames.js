// FRAMES: BUILD A PART IN FLIGHT (LOOP.md G4, config.FRAMES). A small Yard part bought as a FRAME at the dock is delivered as an empty scaffold on its Yard place; the crew carry scrap bundles to it (a bundle in the hands,
// hold Action at the frame, config.FRAMES.TIME seconds a bundle) and when it is full the part comes alive (simulation.js finishFrame -> shipSim.js growPart). Node-safe, no live ship: the records live in state.run.frames
// (the voyage's, ship 0's - another ship never has one) and the TV reads them to draw the scaffold.
//   framesOn()                       the switch: SCRAP on and config.FRAMES.ENABLED (NO_FRAMES=1 in a tool turns it off)
//   framable(entryId)                may this Yard part be bought as a frame
//   bundlesFor(basePrice)            how many bundles a frame for a part of that salvage price takes
//   framesOf(world) / pendingOf(world)   the voyage's frames / the ones still to be built (not done)
//   frameSpot(ship, f) -> { d, x }   where the crew stand to build it: the deck point nearest the part's place (worked out again when the ship's layout changes)
//   nearFrame(ship, d, x)            the frame a crewman at deck d, x can work (main ship only), or null
//   frameWords(f)                    "BUILD GUN MOUNT (1/3)"
//   work(f, p, dt)                   one tick of a held Action with a bundle in the hands: answers { done } when a bundle went in (the caller takes it from his hands), else null
//   stepFrames(world, dt)            once a world step: a bundle nobody works on loses its progress
//   calmFor(world, phases)           is it quiet enough to build (the bots' rule and the phones' arrows)
//   buildersOf(f)                    the names of whoever put bundles in, the busiest first
// A frame record: { id, entry, name, need, fill, prog, x, y, where, letter, ghost, paid, base (the parts list she wore when it was bought), parts (the list with the part on it), by: { <player id>: { name, n } }, ok, done }
import { config } from '../../config.js';
import { scrapOn } from './scrap.js';

const FR = () => config.FRAMES;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const framesOn = () => scrapOn() && FR().ENABLED;
export const framable = (entryId) => framesOn() && FR().PARTS.includes(entryId);
export const bundlesFor = (base) => Math.max(FR().MIN, Math.min(FR().MAX, config.SCRAP.HOLD_CAP, Math.round(base / FR().PER)));
export const framesOf = (world) => (framesOn() && world.run && world.run.frames) || [];
export const pendingOf = (world) => framesOf(world).filter((f) => !f.done);
export const frameWords = (f) => `BUILD ${String(f.name).toUpperCase()} (${f.fill}/${f.need})`;

// The deck point nearest the part's place (a gun on a sponson, a lamp on a catwalk, a ladder between two decks): the crew reach out to the frame from there.
export function frameSpot(ship, f) {
  const L = ship.layout;
  if (f.spot && f.spotV === L.version) return f.spot;
  let best = null;
  L.platforms.forEach((q, d) => {
    if (q.x1 - q.x0 < 90) return;
    const dx = Math.max(0, q.x0 - f.x, f.x - q.x1), cost = dx + Math.abs(q.y - f.y) * 0.6;
    if (!best || cost < best.cost) best = { d, cost, x: clamp(f.x, q.x0 + 35, q.x1 - 35) };
  });
  f.spot = best ? { d: best.d, x: best.x } : { d: 0, x: f.x };
  f.spotV = L.version;
  return f.spot;
}

// The frame a crewman standing on deck d at x can build. Only the main ship has them.
export function nearFrame(ship, d, x) {
  if (!ship.main || !framesOn() || !ship.world || !ship.world.run) return null;
  for (const f of pendingOf(ship.world)) {
    const s = frameSpot(ship, f);
    if (s.d === d && Math.abs(s.x - x) <= FR().REACH) return f;
  }
  return null;
}

export function work(f, p, dt) {
  f.worked = true;
  f.prog = (f.prog || 0) + dt / FR().TIME;
  if (f.prog < 1) return null;
  f.prog = 0;
  f.fill++;
  const rec = (f.by[p.id] ||= { name: p.name, n: 0 });
  rec.n++;
  return { done: f.fill >= f.need };
}

export function stepFrames(world, dt) {
  for (const f of pendingOf(world)) {
    if (!f.worked) f.prog = Math.max(0, (f.prog || 0) - dt * FR().DECAY);
    f.worked = false;
  }
}

// Is the sky quiet enough to build? Only in one of the tempo's `phases` (the pacing director's calm and escape: no set piece, no trickle of enemies), and never while she falls, with raiders aboard, a fire burning
// (more than FRAMES.BOTS.MAX_FIRES), a gunship hunting or a live creature about. The bots take it as a rule (BOTS.ALLOW); the arrows on the phones follow it too (ARROWS), so the gunners and the stokers are never short of hands in a crisis.
export function calmFor(world, phases) {
  const tp = world.tempo, g = world.gunship;
  return world.phase === 'flying' && !!tp && phases.includes(tp.phase) && !world.goingDown && !(world.ship && world.ship.down > 0) && !(world.boarders || []).length && (world.fires || []).length <= FR().BOTS.MAX_FIRES
    && !(g && g.phase !== 'sinking' && g.phase !== 'leaving') && !(world.creature && !world.creature.dying);
}

// P5: the same question for a voyage that started on the RAFT while she has fewer guns than RAFT.BOTS.BUILD_ANY_PHASE_UNTIL_GUNS: there is nobody to send off a gun, and the gun is what she is building, so the phones' arrows and the bots build in ANY phase of
// the pacing (still never in a fall, with raiders aboard, a fire, a gunship or a creature). Everything else: calmFor(world, phases).
export function framesCalm(world, phases) {
  const R = config.RAFT, ship = world.ships && world.ships[0];
  if (R && R.ENABLED && world.run && world.run.raft && ship && ship.layout && ship.layout.stations.filter((s) => s.kind === 'gun').length < R.BOTS.BUILD_ANY_PHASE_UNTIL_GUNS) return calmFor(world, ['build', 'peak', 'calm', 'escape']);
  return calmFor(world, phases);
}

export const buildersOf =(f) => Object.values(f.by || {}).filter((r) => r.name).sort((a, b) => b.n - a.n || String(a.name).localeCompare(b.name)).map((r) => r.name);
