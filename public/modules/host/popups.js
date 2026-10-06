// Comic-book words that pop up over the action ("KA-BOOM!", "WHACK!"...). Any module can add one;
// the renderer draws them. Positions are world coordinates (like puffs).
const pick = (list) => list[(Math.random() * list.length) | 0];

export const WORDS = {
  kill: ['KA-BOOM!', 'BLAM!', 'KRAKOOM!'],
  bat: ['SPLAT!', 'SQUEAK!', 'POP!'],
  rocket: ['POP!', 'PFFT!', 'FIZZLE!'],
  bigHit: ['CRUNCH!', 'KRUNK!', 'WHAM!'],
  whack: ['WHACK!', 'THWACK!', 'BIFF!'],
  raider: ['BONK!', 'KO!', 'ZONK!'],
  fireOut: ['FSSSH!', 'PSSST!'],
  patch: ['BANG BANG!', 'TAP TAP!'],
  repair: ['CLANK!', 'GOOD AS NEW!'],
  boiler: ['KABLOOIE!'],
  boss: ['KA-BLOOEY!!'],
};

export function pop(state, x, y, kind, color = '#ffd23f', size = 1) {
  if (!state.popups) state.popups = [];
  if (state.popups.length > 10) state.popups.shift(); // a few at a time, not a pile
  state.popups.push({ x, y, text: pick(WORDS[kind] || [kind]), color, size, t: 0, tilt: (Math.random() - 0.5) * 0.4 });
}

export function updatePopups(state, dt) {
  if (!state.popups) return;
  for (const p of state.popups) p.t += dt;
  state.popups = state.popups.filter((p) => p.t < 1.1);
}
