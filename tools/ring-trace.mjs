// A look at a ring fight, second by second (a dev aid for package R0): node tools/ring-trace.mjs [--variant fortress] [--seed 1] [--minutes 3] [--every 5] [--bots 8] [--difficulty easy]
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { installShims, seedRandom, publicDir } from './shims.mjs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
installShims();
const clock = seedRandom(Number(flag('seed', 1)));
const load = (p) => import(pathToFileURL(path.join(publicDir, p)).href);
const { config } = await load('config.js');
config.VOYAGE.CURRICULUM.ENABLED = false;
config.CREATURES.LAIR.COUNT = { short: 0, long: 0 };
config.MAPS.FORCE_KIND = 'ring';
config.RING.FORCE_VARIANT = flag('variant', 'tower');
if (process.env.RING_FORCE_BOARD) config.RING.FORCE_BOARD = true;
const { createSimulation } = await load('modules/host/simulation.js');
const sim = createSimulation();
const st = sim.state;
st.difficulty = flag('difficulty', 'easy');
const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];
const nb = Number(flag('bots', 8));
for (let i = 0; i < nb; i++) {
  const e = st.ships[0].layout.boarderEntryPoints;
  const id = 'bot' + Math.random();
  st.players[id] = { id, bot: true, name: 'Bot' + (i + 1), species: config.CREW_SPECIES[(Math.random() * config.CREW_SPECIES.length) | 0], color: colors[i % colors.length], x: e[0].x + Math.random() * (e[1].x - e[0].x), y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
}
sim.castOff();
const DT = 1 / 60, every = Number(flag('every', 5)), minutes = Number(flag('minutes', 3));
const map = st.course.map;
console.log(`map ${map.kind} ${map.W}x${map.H} cells; ring`, JSON.stringify({ ...map.ring, faces: map.ring.faces.length, spires: map.ring.spires.length, rev: map.ring.rev.length }), 'start', Math.round(map.start.x), Math.round(map.start.y), 'startDist', map.startDist);
for (let step = 1; step <= minutes * 3600; step++) {
  clock.ms += DT * 1000;
  sim.update(DT);
  if (step % (every * 60) === 0) {
    const c = st.course, r = c.ring, sh = st.ships[0];
    const sx = sh.pose.x + sh.layout.refPoint.x, sy = sh.pose.y + sh.layout.refPoint.y;
    const guns = r ? r.faces.map((f) => c.turrets.filter((t) => t.outpost === f.i && !t.dead).length) : [];
    console.log(`t${(step / 60).toFixed(0)} ship ${Math.round(sx)},${Math.round(sy)} hull ${Math.round(st.ship.hull)} prog ${(c.progress || 0).toFixed(2)} target ${c.target ? Math.round(c.target.x) : '-'} stGun ${c.stationGun ? Math.round(c.stationGun.mx) : '-'} guns ${guns.join('/')} core ${r ? r.faces.map((f) => f.down ? 'X' : f.hp.toFixed(0) + (f.open > 0 ? '*' : '')).join('/') : '-'} keep ${r ? r.keep.hp.toFixed(0) : '-'} bombs ${st.bombBay.bombs} bats ${st.bats.length} boarders ${st.boarders.length} ev "${st.ev.warn > 0 ? st.ev.warnText : ''}" bay: ${Object.values(st.players).filter((q) => sh.layout.kindOf(q.lock) === 'bombBay').length} gunners ${Object.values(st.players).filter((q) => q.lock && st.GUNS[q.lock]).length} done ${c.done}`);
  }
}
