// AWARDS v2 (SHIPS_BOOK.md L7): who gets the little trophies on a stop's scorecard. Pure data in, rows out: no DOM, no random numbers, nothing written to the game.
//   chooseAwards({ players, falls, drops, play })  -> rows [{ key, title, icon, name, color, value, unit, score }], at most config.AWARDS.MAX, the best first
//     players  [{ name, color, stats }]          the crew and this stop's stats
//     falls    { name: n }                        overboard falls this stop (the Book's moments)
//     drops    [{ ref: { name, color }, n }]      loads let go of when knocked out or thrown over the side (moments.js takeTally('drops'))
//     play     { crew: [{ name, color }], weight } the stop's top moment (the Log's play of the mission), or null
//   awardText(row)  the line on the winner's phone
// A stat award needs config.AWARDS.STATS[key].min and scores count / target; the hero, butterfingers and overboard awards are moments with their own score (config.AWARDS). The best score wins
// first, nobody wins more than PER_PERSON (so a stop with several heroes is told with several names), the first of equals wins a tie.
import { config } from '../../config.js';

export function chooseAwards({ players = [], falls = {}, drops = [], play = null } = {}) {
  const A = config.AWARDS;
  const list = (players || []).filter((p) => p && p.name && !p.mate && !p.enemy);
  const colorOf = (name, d = '#e8d9b0') => (list.find((p) => p.name === name) || {}).color || d;
  const cands = [];
  const order = Object.keys(A.STATS);
  // The play of the mission: the hero is whoever the Log names first.
  const hero = play && play.crew && play.crew[0];
  if (hero && hero.name && (play.weight || 0) >= A.HERO.MIN_WEIGHT) cands.push({ key: 'hero', title: A.HERO.TITLE, icon: A.HERO.ICON, name: hero.name, color: hero.color || colorOf(hero.name), value: null, unit: A.HERO.UNIT, score: A.HERO.SCORE + Math.min(1, ((play.weight || 0) - A.HERO.MIN_WEIGHT) / 10) });
  // Fell overboard more than once in one stop.
  let fall = null;
  for (const [name, n] of Object.entries(falls || {})) if (n >= A.OVERBOARD.MIN && (!fall || n > fall.n)) fall = { name, n };
  if (fall) cands.push({ key: 'overboard', title: fall.n === 2 ? A.OVERBOARD.TITLE : A.OVERBOARD.MANY.replace('{n}', String(fall.n)), icon: A.OVERBOARD.ICON, name: fall.name, color: colorOf(fall.name), value: fall.n, unit: A.OVERBOARD.UNIT, score: A.OVERBOARD.SCORE + A.OVERBOARD.PER * (fall.n - 2) });
  // Dropped the most loads.
  let drop = null;
  for (const r of drops || []) if (r && r.ref && r.n >= A.BUTTER.MIN && (!drop || r.n > drop.n)) drop = r;
  if (drop) cands.push({ key: 'butter', title: A.BUTTER.TITLE, icon: A.BUTTER.ICON, name: drop.ref.name, color: drop.ref.color || colorOf(drop.ref.name), value: drop.n, unit: A.BUTTER.UNIT, score: A.BUTTER.SCORE + A.BUTTER.PER * (drop.n - A.BUTTER.MIN) });
  // The best of each stat.
  for (const key of order) {
    const S = A.STATS[key];
    let best = null, bv = 0;
    for (const p of list) { const v = (p.stats && p.stats[key]) || 0; if (v > bv) { best = p; bv = v; } }
    if (best && bv >= S.min) cands.push({ key, title: S.title, icon: S.icon, name: best.name, color: best.color, value: Math.round(bv), unit: S.unit, score: bv / S.target });
  }
  cands.sort((a, b) => b.score - a.score); // (stable: the first of equals keeps its place - hero, overboard, butterfingers, then the stats in config order)
  const per = {}, rows = [];
  for (const c of cands) {
    if (rows.length >= A.MAX) break;
    if ((per[c.name] || 0) >= A.PER_PERSON) continue;
    per[c.name] = (per[c.name] || 0) + 1;
    rows.push(c);
  }
  return rows;
}

// What a winner's phone says under the award's name.
export function awardText(r) {
  if (!r) return '';
  return r.value == null ? `You ${r.unit}! The whole crew saw it.` : `${r.value} ${r.unit}. Well done, ${r.name}!`;
}
