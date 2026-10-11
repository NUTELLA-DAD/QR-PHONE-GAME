// THE LOG WRITER (SHIPS_BOOK.md L1): turns the moments of a stop (moments.js) into short sentences in the banner voice, and the stops of a run into the postcard's lines.
// Node-safe, no DOM, NO random numbers: a variant is picked by a hash of what happened (so a seeded botsim stays byte for byte what it was), and a sentence the run has already told is never told twice.
// Rules of the voice: a sentence always names someone; a number only when it is small or funny ("twice"); no stat-row phrasing; never "nobody did much".
//
//   writeStop(moments, info, ctx)  -> { no, name, head, text, cands: [{ text, kind, weight, who }] }   info = { no, name }; ctx = { used: Set, players: [..] }
//   postcard(entries, opts)        -> [{ no, name, first, text, kind }]                                 entries = the run.log of writeStop results; opts = { lines, min, perStop }
//   playOf(moment)                 -> "Mia planted the charge" (the short phrase after PLAY OF THE MISSION)
//   gentleLine(players, no)        -> a kind line naming whoever did the most (for a scorecard with no awards)
import { config } from '../../config.js';

// ---- small helpers ----
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; return h; };
const ucfirst = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const lowfirst = (s) => (s ? s[0].toLowerCase() + s.slice(1) : s);
export const nameList = (names) => (names.length <= 1 ? names[0] || '' : names.length === 2 ? names[0] + ' and ' + names[1] : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1]);
const TIMES = ['', 'once', 'twice', 'three times', 'four times', 'five times', 'six times', 'seven times', 'eight times', 'nine times'];
// "THE IRON WIDOW" / "The Iron Widow" / "Iron Widow" -> "the Iron Widow"
export const titled = (name) => {
  const w = String(name || '').toLowerCase().replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).map((x, i) => (i > 0 && ['of', 'the', 'and'].includes(x) ? x : ucfirst(x)));
  if (!w.length) return '';
  if (w[0].toLowerCase() === 'the') w[0] = 'the';
  else w.unshift('the');
  return w.join(' ');
};
const things = (names) => { // "the aft gun deck and the tail gun"
  const list = (names || []).filter(Boolean).slice(0, 2).map((s) => 'the ' + String(s).replace(/^the /i, '').toLowerCase());
  return list.length ? nameList(list) : 'a piece of the ship';
};
const inWhere = (where) => (where ? ' in the ' + String(where).replace(/^the /i, '').toLowerCase() : '');

// ---- the sentences: kind -> 3 variants. {who} all the names, {who1} the first, {where} / {inwhere}, {C} the creature, {G} the gunship, {things}, {times}, {item}, {stop} ----
const SENT = {
  'fire-first': ['{who} put out the first fire of the stop{inwhere} before it could spread.', 'The first fire{inwhere} went out under {who1}\'s extinguisher.', '{who} met the first flames{inwhere} with a spray of foam and won.'],
  'revive-fire': ['{who} hauled a fallen crewmate to their feet with the fire all around{inwhere}.', 'With the flames still going{inwhere}, {who} stayed to bring a friend round.', '{who} would not leave a friend on the floor while the deck burned.'],
  overboard: ['{who} fell overboard and came back dripping.', '{who} went over the side and was fished out, with dignity mostly intact.', '{who} took a short, cold trip over the rail.'],
  'overboard-twice': ['{who} fell overboard twice. Nobody is saying anything.', '{who} went over the side {times}, which is one more time than anybody planned.', '{who} has now been fished out of the sky {times}.'],
  'overboard-lunatic': ['{who} has now gone over the side {times}. Somebody should tie {who1} to something.', '{times}: that is how often {who} has left the ship without the ship\'s permission.', '{who} fell overboard {times}, and we are starting to think it is on purpose.'],
  'boarding-kill': ['{who} took the fight to the gunship and sent one of her crew tumbling.', 'A gunship hand met {who1}\'s blade on her own deck.', '{who} went over the rail onto the enemy and came back one raider lighter.'],
  'cannon-board': ['{who} was fired out of the crew cannon and landed on the gunship\'s deck, sword first.', 'The crew cannon sent {who} clean across the sky and onto an enemy deck.', '{who} flew in through the front door of the gunship, by cannon.'],
  'cannon-miss': ['{who} was shot out of the crew cannon and missed everything, sky included.', '{who} left the crew cannon with great confidence and nothing to land on.', 'The crew cannon fired {who} into the blue; the target was not in the blue.'],
  'gunship-shot': ['{who} fired the shot that sent {G} spinning into the clouds.', '{G} went down under {who1}\'s guns.', 'It was {who1}\'s last shell that broke {G} in two.'],
  'gunship-charge': ['{who} crept aboard {G}, planted the charge and ran.', '{who} set the charge on {G}, and the sky lit up behind the crew.', '{G} blew apart at {who1}\'s hand, and the boarders were back aboard just in time.'],
  'gunship-captured': ['{who} took the wheel of {G}, and her crew gave up.', '{G} surrendered to {who} without another shot.', '{who} stood at the helm of {G} and she struck her colours.'],
  'gunship-fled': ['{G} turned tail with {who1}\'s shells still ringing in her hull.', '{who} hit {G} so hard that she ran for home.', '{G} fled the field, and {who1} had the last word.'],
  'creature-win:sever': ['{who} cut off the last of {C}\'s arms and it had nothing left to hold with.', 'The last tentacle of {C} fell to {who1}\'s blade.', '{C} lost its final arm to {who}.'],
  'creature-win:mouth': ['{who} fed {C} bombs until it had had quite enough.', 'A bomb from {who1} went down the throat of {C}, and the fight went out of it.', '{C} choked on {who1}\'s last bomb.'],
  'creature-win:tow': ['{who} hauled {C} onto the rocks and left it there.', '{C} was dragged onto the rocks, with {who} on the line.', '{who1}\'s harpoon line walked {C} straight into the rocks.'],
  'creature-win:board': ['{who} climbed aboard {C} and put a blade in its heart.', '{who} went right onto {C} and finished it from the inside.', '{C} met {who1}\'s sword where it was softest.'],
  'creature-win:hp': ['{who} fired the last shell into {C}, and it sank.', '{C} fell, and the last blow was {who1}\'s.', '{who} brought {C} down at last.'],
  'creature-win:choke': ['{C} choked on its own fire, with {who} to thank.', '{who} turned the flame of {C} against it.', '{C} breathed out once too often, and {who1} was waiting.'],
  'creature-win:bombs': ['{who} dropped bombs into the open mouth of {C}, and that was that.', '{C} swallowed {who1}\'s bombs and did not enjoy them.', '{who} fed {C} a bomb or two, and the roaring stopped.'],
  'creature-win:flak': ['{who1}\'s flak found {C}, and it came down.', '{who} shot {C} out of the sky with the flak guns.', '{C} flew into {who1}\'s flak once too often.'],
  'creature-win:pluck': ['{who} plucked {C} bare, and it dropped out of the sky.', '{C} lost its last wing feathers to {who}.', '{who} took the last feather, and {C} took the long way down.'],
  'creature-win:gizzard': ['{who} sent a bolt of lightning back into the gizzard of {C}.', '{C} swallowed a thunderbolt, courtesy of {who}.', '{who1}\'s coil gave {C} back the lightning it had been throwing.'],
  'creature-win:mortar': ['{who} blasted {C} off its rock with a mortar shell.', '{C} was sitting pretty until {who1}\'s mortar arrived.', '{who} dropped a mortar shell on {C}\'s roost, and that was the end of the roost.'],
  'creature-freed:hack': ['{who} hacked at the tentacle holding the ship until it let go.', '{C} had the ship by the throat until {who} cut her loose.', '{who} swung at the grip on the hull and did not stop until it opened.'],
  'creature-freed:perch': ['{C} perched on the bag; {who} hacked at it until it let go.', '{who} drove {C} off the gasbag with a sword and a great deal of shouting.', 'Nobody sits on our bag, and {who} told {C} so with a sword.'],
  breakoff: ['{who} watched {things} break away and drop out of the sky.', '{things} came off in a shower of splinters, and {who} was close enough to feel it.', 'We lost {things}; {who} was the last one standing near it.'],
  'breakoff-bay': ['The bomb bay went up with a bang, and {who} was standing nearest.', '{who} was beside the bomb bay when it went, and is still ringing.', 'Bang went the bomb bay; {who1} caught the wind of it.'],
  rebuild: ['{who} put a hand up to buy back {things} at the Yard.', '{things} came back on at the Yard, and {who} paid the bill.', '{who} would not leave the dock until {things} were on again.'],
  'going-down-saved': ['She was going down, and {who} pumped and patched until she held.', '{who} kept her in the air when she had no business staying there.', 'With the ground rushing up, {who} dumped weight and she held.'],
  'helm-held': ['{who} held the helm steady while everything went wrong.', 'The hull was in ribbons, and {who} never left the wheel.', '{who} kept her head into the wind through the worst of it.'],
  limp: ['She broke up, but a spare gasbag and {who} got her home.', '{who} stitched the spare gasbag on, and she limped away.', 'She went down in pieces, and {who} put her back together in the air.'],
  'ship-lost': ['{who} was the last one aboard when she broke up over {stop}.', 'She went down over {stop}, and {who} saluted as she fell.', '{stop} was the end of her, with {who1} still at the post.'],
  'flagship-down': ['{who} fired the shot that sank the Flagship, and the Broken Skies were ours.', 'The Flagship broke in half, and it was {who1}\'s shell that did it.', '{who} put the Flagship in the clouds where she belongs.'],
  'boss-down': ['{who} shot the great zeppelin out of the sky.', 'The big zeppelin fell, and {who1}\'s guns were the last to speak.', '{who} brought the zeppelin down to the delight of everyone below.'],
  sandbag: ['{who} carried one {item} through a whole stop and never once put it down.', '{who} and a {item} were not parted for a whole stop.', '{who} still has not put that {item} down.'],
  'scrap-first': ['{who} stowed the first scrap of the voyage, and the hold stopped being empty.', 'The first bundle of scrap went into the hold in {who1}\'s arms.', '{who} found the hold bin and put the first scrap in it.'],
  'scrap-hook': ['{who} hooked a bundle of scrap out of thin air and reeled it in.', 'A falling bundle met {who1}\'s hookshot and came aboard.', '{who} fished scrap out of the sky with a hook and a steady arm.'],
  'hulk-hauled': ['{who} hauled a wrecked hulk alongside and stripped it of scrap.', 'The hulk came alongside on {who1}\'s harpoon line, and the crew took it apart.', '{who} reeled in the hulk and the scrap came off it in armfuls.'],
  'scrap-dumped': ['{who} dumped the scrap to climb, and she rose.', 'The whole hold went over the side at {who1}\'s hand, and the ship was glad of it.', '{who} threw the scrap away to save the ship, which is exactly what scrap is for.'],
  quiet: ['{who} kept the kettle on while the sky stayed quiet.', 'It was a calm one, and {who} polished the brass.', '{who} had time to admire the view.'],
};
// What the busiest crewman of a job gets (moments of kind 'leader'): stat -> 3 variants. No numbers: the stat is only a hint.
const LEADER = {
  kills: ['{who} shot down more of them than the rest of the crew together.', 'The guns belonged to {who} this time.', '{who} turned the gun deck into a shooting gallery.'],
  raiders: ['{who} beat back raider after raider on the catwalk.', 'Raiders kept coming and {who1} kept sending them home.', '{who} swung a sword like a man with a train to catch.'],
  holes: ['{who} patched hole after hole, and the hull is still mostly there.', 'The hull is held together by {who1}\'s patches.', '{who} spent the stop on their knees with a patch kit.'],
  fires: ['{who} was on every fire before it got going.', 'Flames did not last long with {who} about.', '{who} put out so many fires that the extinguisher is smoking.'],
  repairs: ['{who} kept the hammer busy; the ship ran on {who1}\'s repairs.', '{who} fixed everything that broke, usually twice.', 'Whatever broke, {who} was already holding the spanner.'],
  ammo: ['{who} hauled shells all the way down the ship and back.', 'The guns never ran dry while {who} had legs.', '{who} was the ammunition train.'],
  coal: ['{who} fed the boiler until it purred.', 'The engines ran on {who1}\'s coal and sheer stubbornness.', '{who} shovelled enough coal to heat a small town.'],
  revives: ['{who} picked the crew up off the floor, again and again.', 'Whoever fell down, {who} was soon kneeling beside them.', '{who} ran the medical bay on foot.'],
  defused: ['{who} defused a bomb with a steady hand and a bad feeling.', '{who} cut the right wire, which is more than most of us would.', 'A bomb ticked on the deck until {who1} sat on it, politely.'],
  vent: ['{who} kept the steam from blowing the boiler off the ship.', 'The boiler stayed in one piece thanks to {who1}\'s hand on the valve.', '{who} let off steam, as much as anyone ever has.'],
  demolished: ['{who} flattened the outposts, one bomb at a time.', 'The outposts never forgave {who1}\'s bombing.', '{who} rained bombs on the enemy buildings.'],
  sabotage: ['{who} sneaked aboard the enemy and spoiled her day.', '{who} left a nasty surprise on the gunship.', 'Something went bang on the gunship, and {who1} was nearby.'],
  boarding: ['{who} swung across to the enemy as if the ropes were stairs.', '{who} was first over the rail, as usual.', '{who} took the hookshot and the gunship took notice.'],
  sails: ['{who} hauled the sails up in a hurry and the ship leaned into the wind.', 'The sails went up when {who} said so.', '{who} spent the stop on the ropes.'],
  thrown: ['{who} threw sandbags with real conviction.', 'A good deal of ballast left the ship by {who1}\'s arm.', '{who} lightened the ship with a series of heroic throws.'],
  spots: ['{who} spotted everything in the sky, and a few clouds besides.', 'From the lookout, {who} called every target before it arrived.', '{who1}\'s sharp eyes in the nest saved us a lot of surprises.'],
  cannon: ['{who} climbed into the crew cannon and made it look normal.', '{who} was shot out of the cannon, on purpose.', 'The crew cannon had one regular customer, {who1}.'],
  shovels: ['{who} shovelled the deck clear of cargo.', 'The hold got lighter with every swing of {who1}\'s shovel.', '{who} tidied the ship by throwing things over the side.'],
  cuts: ['{who} cut away a piece of the ship to keep the rest in the air.', 'It took nerve, but {who} cut the right joint.', '{who} took a saw to the ship and the ship was grateful.'],
  dumped: ['{who} dumped the heavy stuff and she rose like a bird.', '{who} threw the weight overboard, for lift.', 'The lift came from {who1}\'s quick dump.'],
  hatch: ['{who} worked the cargo hatch like a man with a plan.', 'The hatch opened and closed on {who1}\'s whim.', '{who} dropped cargo through the floor and called it strategy.'],
  captures: ['{who} took a helm that was not ours, and nobody minded.', '{who} stood at an enemy wheel and looked well there.', '{who} walked in and captured the bridge.'],
  stowed: ['{who} carried scrap to the hold all stop.', 'The hold filled up in {who1}\'s arms.', '{who} was the hold\'s best friend, bundle after bundle.'],
  bats: ['{who} swatted bats off the ship all stop.', 'Every bat on board got to know {who1}\'s boot.', '{who} fought the bats and the bats lost.'],
};
// The short phrase after "PLAY OF THE MISSION:" (the name comes first): kind -> variants.
const PLAY = {
  'fire-first': ['put out the first fire'], 'revive-fire': ['carried on reviving with the fires still burning'], overboard: ['went for a swim'], 'overboard-twice': ['went overboard again'], 'overboard-lunatic': ['went over the side yet again'],
  'boarding-kill': ['took the fight to the gunship'], 'cannon-board': ['flew from the crew cannon onto the gunship'], 'cannon-miss': ['missed the whole sky with the crew cannon'],
  'gunship-shot': ['fired the shot that sank {G}'], 'gunship-charge': ['planted the charge'], 'gunship-captured': ['took the helm of {G}'], 'gunship-fled': ['drove {G} off'],
  'creature-win': ['brought down {C}'], 'creature-freed': ['hacked {C} loose'], breakoff: ['was beside it when {things} came off'], 'breakoff-bay': ['was next to the bomb bay when it went'], rebuild: ['bought {things} back'],
  'going-down-saved': ['pulled her out of the dive'], 'helm-held': ['held the helm through the worst of it'], limp: ['got her home on the spare gasbag'], 'ship-lost': ['stayed to the last'],
  'flagship-down': ['sank the Flagship'], 'boss-down': ['shot down the zeppelin'], sandbag: ['carried the {item} the whole stop'],
  'scrap-first': ['stowed the first scrap'], 'scrap-hook': ['hooked scrap out of the sky'], 'hulk-hauled': ['hauled a hulk alongside'], 'scrap-dumped': ['dumped the scrap to climb'],
};
const PLAY_LEADER = { kills: 'ruled the guns', raiders: 'beat back the raiders', holes: 'patched the hull', fires: 'fought the fires', repairs: 'kept her running', ammo: 'kept the guns fed', coal: 'fed the boiler', revives: 'picked everyone up', defused: 'defused the bomb', vent: 'saved the boiler', demolished: 'bombed the outposts', sabotage: 'sabotaged the gunship', boarding: 'led the boarding', sails: 'worked the sails', thrown: 'threw ballast', spots: 'spotted for the guns', cannon: 'flew the crew cannon', shovels: 'cleared the decks', cuts: 'cut her free', dumped: 'dumped the weight', hatch: 'worked the hatch', captures: 'took the bridge', bats: 'swatted the bats', stowed: 'filled the hold' };
const AGAIN = ['Once more, ', 'Yet again, ', 'As ever, ', 'Still, ', 'And then, ', 'Later, '];
export const TEMPLATES = { SENT, LEADER, PLAY, PLAY_LEADER }; // (for tools/log-check.mjs: every template is filled with odd data and must come out clean)
const GENTLE = ['A quiet stop. {who} did the most, mostly by being there.', 'Not much to report, but {who} was the busiest of the lot.', 'A gentle one. {who} kept the ship\'s spirits up.'];

// ---- filling a template ----
function vars(m) {
  const d = m.data || {}, all = m.who && m.who.length ? m.who : ['The crew'];
  const names = all.length > 3 ? [all[0], all[1], 'the rest of the crew'] : all; // (a whole crew who voted the same way is not read out one by one)
  const G = titled(d.name || d.gunship || 'the gunship'), C = titled(d.creature || 'the beast');
  const n = d.n | 0;
  return {
    who: nameList(names), who1: names[0], where: m.where || '', inwhere: inWhere(m.where), C, G, things: things(d.names), item: d.item || 'sandbag', stop: m.stopName || 'the stop',
    times: TIMES[Math.min(9, Math.max(1, n))] || n + ' times',
  };
}
const fill = (tpl, v) => ucfirst(tpl.replace(/\{(\w+)\}/g, (_, k) => (v[k] != null ? v[k] : '')).replace(/\s+([.,;])/g, '$1').replace(/\s{2,}/g, ' ').trim());
// Which variant list a moment uses.
function keyOf(m) {
  const d = m.data || {};
  if (m.kind === 'creature-win') return SENT['creature-win:' + d.way] ? 'creature-win:' + d.way : 'creature-win:hp';
  if (m.kind === 'creature-freed') return d.how === 'perch' ? 'creature-freed:perch' : 'creature-freed:hack';
  if (m.kind === 'overboard') return (d.n | 0) === 2 ? 'overboard-twice' : 'overboard';
  return m.kind;
}
// One sentence for a moment. ctx.used = the sentences the run has told (a repeat takes the next variant, or is skipped by the caller).
export function sentence(m, ctx = {}) {
  const used = ctx.used || new Set();
  const counts = (used.counts ||= {}); // (how often each line has been told this run: the next telling starts at the next variant)
  const ck = m.kind === 'leader' ? 'leader:' + (m.data || {}).stat : keyOf(m);
  const list = m.kind === 'leader' ? LEADER[(m.data || {}).stat] || SENT.quiet : SENT[ck] || SENT.quiet;
  const v = vars(m);
  const h = hash(`${m.kind}|${m.stop}|${(m.who || []).join(',')}|${(m.data || {}).stat || ''}|${(m.data || {}).n || ''}`) + (counts[ck] || 0);
  let text = null;
  for (let i = 0; i < list.length && text === null; i++) {
    const t = fill(list[(h + i) % list.length], v);
    if (!used.has(t)) text = t;
  }
  if (text === null && ctx.again) { // (all three told already, and the caller must have a line: the same thing happening once more, with a word in front)
    const bases = list.map((_, i) => fill(list[(h + i) % list.length], v));
    const soft = (b) => (b.startsWith(v.who) || b.startsWith(v.who1) ? b : lowfirst(b)); // (a name keeps its capital letter)
    for (let i = 0; i < AGAIN.length && text === null; i++) for (const b of bases) { const t = AGAIN[(h + i) % AGAIN.length] + soft(b); if (text === null && !used.has(t)) text = t; }
    for (let k = 2; text === null && k < 200; k++) { const t = bases[0].replace(/[.!]$/, '') + ' - number ' + k + '.'; if (!used.has(t)) text = t; } // (a run so long that even that is used up)
  }
  if (text === null) return null; // (all told: the caller moves on to the next moment)
  used.add(text);
  counts[ck] = (counts[ck] || 0) + 1;
  return text;
}
// "Mia planted the charge"
export function playOf(m) {
  if (!m) return null;
  const names = m.who && m.who.length ? m.who : ['The crew'];
  const v = vars(m);
  const phrase = m.kind === 'leader' ? PLAY_LEADER[(m.data || {}).stat] || 'did the most' : (PLAY[m.kind] || ['made the play'])[0];
  const body = phrase.replace(/\{(\w+)\}/g, (_, k) => (v[k] != null ? v[k] : ''));
  return nameList(names) + ' ' + body;
}
// The crewman who did the most of anything (the first of equals; the first aboard when nobody did anything), or null.
const busy = (players) => {
  let best = null, bs = -1;
  for (const p of (players || []).filter((q) => q && !q.mate && !q.enemy && q.name)) { const s = Object.values(p.stats || {}).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0); if (s > bs) { best = p; bs = s; } }
  return best;
};
export function gentleLine(players, no = 0) {
  const best = busy(players);
  const who = best ? best.name : 'The crew';
  return fill(GENTLE[hash('gentle' + no + who) % GENTLE.length], { who });
}

// ---- a stop ----
// The moments of one stop -> its head, its dock line and the candidate sentences the postcard may use (heaviest first, different people before the same one twice).
export function writeStop(moments, info, ctx = {}) {
  const L = config.LOG;
  const used = ctx.used || new Set();
  const list = moments.filter((m) => m.weight > 0).sort((a, b) => b.weight - a.weight || a.n - b.n);
  const picked = [];
  const whos = new Set();
  const take = (m, again) => { const t = sentence(m, { used, again }); if (t) picked.push({ text: t, kind: m.kind, weight: m.weight, who: m.who.slice(), stat: (m.data || {}).stat }); return !!t; };
  const rest = [];
  for (const m of list) { // first the heaviest moment of each different person, then whatever is left
    const key = m.who[0] || '';
    if (whos.has(key) || picked.length >= 6) { rest.push(m); continue; }
    if (take(m)) whos.add(key);
  }
  for (const m of rest) if (picked.length < 6) take(m);
  if (!picked.length && list.length) take(list[0], true); // (every line of the heaviest has been told: tell it again, with a word in front)
  if (!picked.length) { // a stop where nothing was written down: still somebody's line
    const who = busy(ctx.players);
    const t = sentence({ kind: 'quiet', stop: info.no, who: [who ? who.name : 'The crew'], data: {} }, { used, again: true });
    if (t) picked.push({ text: t, kind: 'quiet', weight: 0.5, who: [who ? who.name : 'The crew'] });
  }
  const head = `Stop ${info.no}, ${info.name}.`;
  return { no: info.no, name: info.name, head, text: head + ' ' + picked.slice(0, L.DOCK_SENTENCES).map((c) => c.text).join(' '), cands: picked, play: playOf(list[0] || null), playKind: list[0] ? list[0].kind : null, playCrew: list[0] ? (list[0].data.crew || []).slice() : [] };
}

// ---- the postcard: the lines of the whole run, 6 to 10, in the order they happened ----
export function postcard(entries, opts = {}) {
  const L = config.LOG;
  const max = opts.lines ?? L.POSTCARD_LINES, min = opts.min ?? L.POSTCARD_MIN;
  const stops = entries.filter((e) => e && e.cands && e.cands.length);
  const per = Math.max(opts.perStop ?? L.PER_STOP, Math.ceil(min / Math.max(1, stops.length)));
  const pool = [];
  stops.forEach((e, si) => e.cands.slice(0, per).forEach((c, rank) => pool.push({ si, rank, c, e })));
  pool.sort((a, b) => a.rank - b.rank || b.c.weight - a.c.weight || a.si - b.si);
  const chosen = pool.slice(0, max).sort((a, b) => a.si - b.si || a.rank - b.rank);
  const seen = new Set();
  return chosen.map((x) => {
    const first = !seen.has(x.si);
    seen.add(x.si);
    return { no: x.e.no, name: x.e.name, first, text: x.c.text, kind: x.c.kind, who: x.c.who };
  });
}
