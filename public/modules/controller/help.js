// F10 (FUN.md, config.CONTROLS.ROLE_CARDS): what the phone's ? button says. Pure text logic (no DOM) so a tool can test it: given the last ui message `n` and ui.js's SEAT_HINTS
// (one line per kind of station), pick the card - at a station its hint; free with a job on offer "YOUR JOB: <verb>" and the way; knocked out; carrying something; else the join card's words.
import { config } from '../../config.js';

export const STATION_ICONS = { helm: '☸️', gun: '🔫', boiler: '🔥', lookout: '🔭', hijack: '✈️', escort: '✈️', light: '🔦', coil: '⚡', shield: '🛡️', bombbay: '💣', swivel: '⚙️', cannon: '💥', cannonseat: '💥' };

export function helpFor(n, seatHints) {
  const R = config.CONTROLS.ROLE_CARDS;
  if (n.ko) return { icon: '💤', title: 'Knocked out', text: 'Hang tight - a crewmate can revive you.' };
  if (n.away && n.away.hint) return { icon: n.away.verb ? '🏰' : '🧗', title: n.away.verb ? 'YOUR JOB: ' + n.away.verb : 'AWAY TEAM', text: n.away.hint }; // (CASTLE.md A1: at an objective the card names the verb) // (CASTLE.md A0: off the ship, on the ground)
  if (n.locked) {
    return {
      icon: STATION_ICONS[n.kind] || '🎮',
      title: n.station || 'Your post',
      text: seatHints[n.kind] || 'You are on a station. The big button uses it. LEAVE steps off.',
    };
  }
  const j = n.job;
  if (j && j.label) return { icon: '🧭', title: 'YOUR JOB: ' + (j.verb || 'GO'), text: j.label + '. Follow the GOLD ARROW, then press the big button.' };
  if (n.carry === 'ammo') return { icon: '📦', title: 'You carry ammo', text: 'Bring the ammo to a gun or the bomb bay. The big button loads it.' };
  if (n.carry === 'coal') return { icon: '⚫', title: 'You carry coal', text: 'Bring the coal to a boiler. The big button shovels it in.' };
  if (n.carry === 'chest') return { icon: '🧰', title: 'You carry a chest', text: 'Heavy! Walk it to the rope ladder and climb, then STOW it at the hold. A second hand makes it faster. ATTACK puts it down.' };
  if (n.carry) return { icon: '🤲', title: 'In your hands', text: 'The big button uses what you hold. GRAB swaps it.' };
  return { icon: '🧭', title: 'What do I do?', text: R.JOIN_TEXT + ' Nothing to do? Walk to a station and press the big button.' };
}
