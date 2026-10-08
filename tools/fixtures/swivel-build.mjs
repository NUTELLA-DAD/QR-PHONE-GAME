// Scratch test build for S.5h (pointed engines): the classic ship with her fore engine swapped for a SWIVEL engine at the nose of the main deck (a crew station beside it turns it:
// forward in cruise, up to climb, down to dive). The aft engine stays a fixed forward pod.
// Used by `node tools/botsim.mjs --build swivel` and `node tools/buildsim.mjs --check-engines`. Not a game build.
import { slotsFor } from '../../public/modules/host/buildSlots.js';

export default function swivelBuild(BUILDS) {
  const parts = BUILDS.classic.filter((p) => !(p.part === 'engine' && p.name === 'Fore Engine') && !(p.part === 'pipe' && p.to === 'Fore Engine')).map((p) => ({ ...p }));
  const slot = slotsFor('engineSwivel', parts).sort((a, b) => Math.abs(b.x - 1440) - Math.abs(a.x - 1440)).pop(); // (the spot nearest the nose)
  return slot.apply(parts);
}
