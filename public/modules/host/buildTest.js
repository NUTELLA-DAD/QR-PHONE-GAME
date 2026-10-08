// Build test page (Phase S.5): put parts on the ship, watch the validator and the three gauges (LIFT / STEAM / HANDS), fly her with 4 bots.
//   left   the PARTS TRAY: little pictures of parts (partArt.js) to DRAG onto the blueprint (a ghost follows the pointer and snaps to the nearest legal spot, the rest of the
//          paper is dimmed, hovering a bad spot says why; drop = placePart, drop off the paper = cancel; mouse, pen and touch). Click a picture instead and the
//          brass pins show (the old way). Below: the parts by name and the list of placed parts (x removes one)
//   centre the BLUEPRINT (ink on cream paper): the pencil draws decks along the deck rows, the Gasbag tool draws a bag (in empty space beside a bag: another, side by side;
//          drag a bag's end to resize it), the Ladder tool drags a ladder (or slide pole)
//          between two decks, the eraser rubs decks out, Delete (or right-click) removes any single thing, "Bag -/+" and "Twin bag" change the
//          gasbag, and part pins show here too. "Clear" starts from nothing: the live pane says what she still needs until she can fly; below it the live ship with bots; toggles draw the nav graph (travel-time heat from the boiler), the collision samples, the slots, a blue overlay
//   bottom the gauges and the validator report; "Run 60 s bot test" flies a fast copy and reports; "Copy build JSON" for ?build= and tools/buildsim.mjs
// Same skeleton as styleTest.js. Load a build with ?build=classic | multi | [JSON parts list].
import { config } from '../../config.js';
import { SHIP_LAYOUT, applyBuild } from '../../shipLayout.js';
import { BUILDS, DECK_ROWS, rowOf, buildLayout } from './shipBuild.js';
import { validate, makePlanner, judgeBotRuns } from './buildCheck.js';
import { PALETTE, slotsFor, drawDeck, drawBag, resizeBag, erase, setBag, placeConnector, placePart, pickSlot, whyNot, thingAt, removeAt, emptyBuild, minimalBuild, snapX, rowAtY, summarize } from './buildSlots.js';
import { blueprintView, drawBlueprint } from './blueprintArt.js';
import { createPartPictures } from './partArt.js';
import { createSprites } from './sprites.js';
import { createRunStats } from './buildStats.js';
import { createLogbook } from './logbookArt.js';
import { createSimulation } from './simulation.js';
import { createRenderer } from './render.js';
import { createCamera } from './camera.js';

const $ = (id) => document.getElementById(id);
const L = config.LOGBOOK;
const root = document.documentElement.style;
for (const [k, v] of [['--paper', L.PAPER], ['--shade', L.PAPER_SHADE], ['--ink', L.INK], ['--soft', L.INK_SOFT], ['--pin', L.PIN], ['--stamp', L.STAMP], ['--display', config.FONTS.DISPLAY], ['--text', config.FONTS.TEXT]]) root.setProperty(k, v);

const scene = $('scene');
const gauges = $('gauges');
const bp = $('bp');
const bctx = bp.getContext('2d');
const ctx = scene.getContext('2d');
const gctx = gauges.getContext('2d');
const logbook = createLogbook({ ctx: gctx });
const camera = createCamera();
const fitCanvas = (c) => {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
};
fitCanvas(scene);
fitCanvas(bp);
addEventListener('resize', () => { fitCanvas(scene); fitCanvas(bp); drawGauges(); });

// ---- the build being edited -------------------------------------------------------------------------------------
const multi = () => [...BUILDS.classic, { part: 'station', n: 'Fore Boiler', kind: 'boiler', p: 'main', x: 1090 }, { part: 'station', n: 'Aft Lookout', kind: 'lookout', p: 'nest', x: 700 }];
const initial = () => {
  const q = new URLSearchParams(location.search).get('build');
  try {
    if (q && q.trim().startsWith('[')) return JSON.parse(q);
    if (q === 'multi') return multi();
  } catch (e) { console.warn('bad ?build=', e); }
  return BUILDS.classic;
};
const baseline = new Set(BUILDS.classic.map((p) => JSON.stringify(p))); // parts that came with the classic ship (the rest are shown as new)
let parts = initial().map((p) => ({ ...p }));
let flown = null; // the parts the live ship was last built from (the last build that could fly)
const history = [];
let picked = null; // palette type chosen
let slots = []; // its legal slots
let hover = null;
let result = null;
let planner = null;
let info = {}; // palette id -> { legal, all }
let envId = config.ENVIRONMENTS.DEFAULT;
let sim = null, renderer = null, shipMatrix = null;
let live = null; // the last bot-test report
const flag = { nav: false, samples: false, slots: true, blue: false };
// the blueprint editor
let tool = 'draw'; // 'draw' (pencil) | 'bag' | 'ladder' | 'erase' | 'delete' | 'place' (part pins)
let editing = true; // the blueprint panel is shown
let bpLayout = null; // the layout of the build being edited (it can differ from the live ship when the edit cannot fly)
let bv = null; // the blueprint's paper-to-ship transform, set each frame
let drag = null; // a stroke in progress: { tool, row, a (where it started), b (where it is now) }; a ladder stroke: { tool, row (start deck row), x, y (where it is now), rowB }
let bpHover = null; // { row, cursor } while the pointer is over the paper without a stroke ({ target } for the delete tool)
const ALL_ROWS = Object.keys(DECK_ROWS);

// ---- the live ship ------------------------------------------------------------------------------------------------
const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];
const addBots = (s, n) => {
  const [a, b] = SHIP_LAYOUT.boarderEntryPoints;
  for (let i = 0; i < n; i++) {
    const id = 'bot' + i;
    s.state.players[id] = { id, bot: true, name: 'Bot' + (i + 1), species: config.CREW_SPECIES[i % config.CREW_SPECIES.length], color: colors[i % colors.length], x: a.x + Math.random() * (b.x - a.x), y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
  }
};
// (Re)start the live ship from `p`: apply the layout, then a fresh sim with 4 bots on a fresh mission. Builds only change here, never mid-flight.
function startLive(p = flown) {
  if (!p) return; // (nothing has flown yet: the live pane says what she needs)
  applyBuild(p);
  flown = p;
  sim = createSimulation();
  addBots(sim, 4);
  sim.castOff();
  sim.course.startMission(1, { environment: envId });
  renderer = createRenderer({ ctx, state: sim.state, canvas: scene });
  planner = makePlanner(SHIP_LAYOUT);
}

// ---- editing ---------------------------------------------------------------------------------------------------------
function edit(next) {
  history.push(parts);
  parts = next;
  refresh();
}
function removePart(i) {
  const p = parts[i];
  if (p.part === 'deck') return applyEdit(erase(parts, p.row, p.x0, p.x1)); // (a deck takes what stands on it with it)
  const name = p.n || p.name;
  edit(parts.filter((o, j) => j !== i && !(name && (o.to === name || (o.part === 'escortDock' && o.n === name)))));
}
const TOOLS = [['tDraw', 'draw'], ['tBag', 'bag'], ['tLadder', 'ladder'], ['tErase', 'erase'], ['tDelete', 'delete'], ['tPlace', 'place']];
const toolButtons = () => { for (const [id, name] of TOOLS) $(id).className = tool === name ? 'on' : ''; };
const TOOL_HINT = {
  draw: 'Pencil: drag along a deck row on the blueprint. Along a deck it gets longer; on an empty stretch it makes a new deck (the first one needs no ladder, later ones get one).',
  bag: 'Gasbag: drag along the dashed bag row. In empty space it draws a bag (beside another one: a row of bags, each with its own gas); across a bag it resizes it; or grab a bag\'s end (the brass dots) and drag. The twin envelope is the Twin bag button.',
  ladder: 'Ladder: drag straight down from one deck to another. Tick "slide pole" for a one-way pole (down only). Refused if a deck is missing at either end or something is in the way.',
  erase: 'Eraser: drag along a deck (or across the gasbag). What stood on that stretch goes with it (listed below the blueprint); Undo brings it back. A click on a thing deletes just that thing.',
  delete: 'Delete: click any one placed thing - a ladder, pole, station, gun, rack, vent, sandbag... (or right-click it anywhere). Undo brings it back.',
};
function setTool(t) {
  tool = t;
  if (t !== 'place') picked = null;
  toolButtons();
  drag = null;
  bpHover = null;
  showPicked();
  if (t !== 'place') $('hint').textContent = TOOL_HINT[t];
}
function pick(id) {
  picked = picked === id ? null : id;
  if (picked) { tool = 'place'; toolButtons(); }
  showPicked();
}
function showPicked() {
  slots = picked && info[picked] ? info[picked].legal : [];
  hover = null;
  if (!picked && tool === 'place') $('hint').textContent = 'Click a part in the palette, then a brass pin on the blueprint or the ship.';
  drawPalette();
  if (!tray.id) drawTray(); // (not while a tile is being dragged: it is the element holding the pointer)
  const t = PALETTE.find((q) => q.id === picked);
  $('hint').textContent = t ? `${t.label}: ${slots.length} legal spot${slots.length === 1 ? '' : 's'} - ${t.hint}` : '';
}
// Apply a blueprint edit (drawDeck / erase / setBag result): the ship regenerates (layout, art bake, a fresh sim with bots) and the note says what happened.
function applyEdit(r) {
  if (!r.ok) { note(r.hint, true); return false; }
  edit(r.parts);
  const why = result.ok ? '' : '  CANNOT FLY: ' + result.fails[0];
  note((r.kind === 'erase' ? (r.removed.length ? 'removed: ' + summarize(r.removed) : 'removed: nothing else was on it') + '. ' : '') + r.hint.replace(/ removed: .*$/, '') + why + '  (Undo puts it back.)', !result.ok);
  return true;
}
function note(text, bad) {
  $('bpNote').textContent = text;
  $('bpNote').className = bad ? 'bad' : '';
}
function refresh() {
  result = validate(parts, { cell: config.MAPS.CELL });
  if (result.layout) bpLayout = result.layout;
  if (result.ok) startLive(parts);
  info = {};
  for (const t of PALETTE) { const all = slotsFor(t.id, parts, { legalOnly: false }); info[t.id] = { all, legal: all.filter((s) => s.ok) }; }
  showPicked();
  drawParts();
  drawReport();
  drawGauges();
  if (!result.ok) $('hint').textContent = 'This build cannot fly yet (see the report): ' + (flown ? 'the ship shown is the last one that could. ' : 'nothing is flying until it can. ') + 'Keep building, or Undo.';
}

// ---- left panel ------------------------------------------------------------------------------------------------------
function drawPalette() {
  const el = $('palette');
  el.textContent = '';
  for (const t of PALETTE) {
    const n = info[t.id] ? info[t.id].legal.length : 0;
    const b = document.createElement('button');
    b.className = picked === t.id ? 'on' : '';
    b.disabled = !n;
    b.innerHTML = `<b>${t.label}</b><br>${n} spot${n === 1 ? '' : 's'}`;
    const why = info[t.id] && info[t.id].all.find((s) => !s.ok);
    b.title = n ? t.hint : why ? 'Not allowed: ' + (why.fails[0] || '') : 'No room';
    b.onclick = () => pick(t.id);
    el.appendChild(b);
  }
}
// ---- the parts tray: pictures to drag onto the blueprint (S.5d) ------------------------------------------------------
// A tile is a little picture of a part (partArt.js, drawn in the ship's own style; the sprites it uses load in the background and the pictures are redrawn when they have).
// Press on a tile and move: a ghost of the picture follows the pointer (mouse, pen or finger). Over the blueprint the legal spots stay bright and everything else is dimmed;
// the picture snaps to the nearest legal spot, and over a bad place the note says why. Let go on the paper to place it (the pure placePart does it), anywhere else to cancel.
// A press with no movement is a click: the part is picked and its brass pins show (the old way).
const sprites = createSprites();
const pics = createPartPictures({ sprites });
sprites.load().then(() => { pics.refresh(); drawTray(); }).catch(() => {});
const TRAY = [['gasbag', 'Gasbag'], ['helm', 'Helm'], ['boiler', 'Boiler'], ['coal', 'Coal bunker'], ['ammo', 'Ammo hold'], ['engine', 'Engine pod'], ['gun', 'Gun'], ['searchlight', 'Searchlight'], ['lookout', 'Lookout'],
  ['medbay', 'Medbay'], ['bombBay', 'Bomb bay'], ['lift', 'Lift'], ['boarding', 'Boarding point'], ['rack_hammer', 'Hammer rack'], ['rack_sword', 'Sword rack'], ['rack_hookshot', 'Hookshot rack'],
  ['rack_ice', 'Ice locker'], ['extinguisher', 'Extinguisher'], ['vent', 'Steam vent'], ['ladder', 'Ladder'], ['pole', 'Slide pole'], ['ballast', 'Sandbag'], ['ballast_hang', 'Hanging sandbag']];
const tray = { id: null, moved: false, slots: [], target: null, ptr: null, why: '', img: null, x0: 0, y0: 0 }; // the tile being dragged (moved = it has left the tile)
const dropReach = () => (bv ? (config.BUILD_EDIT.DROP_SNAP * bv.k) / bv.s : 200); // a snap distance in ship px
function drawTray() {
  const el = $('tray');
  el.textContent = '';
  const dpr = Math.min(2, devicePixelRatio || 1);
  for (const [id, name] of TRAY) {
    const n = info[id] ? info[id].legal.length : 0;
    const tile = document.createElement('div');
    tile.className = 'tile' + (picked === id ? ' on' : '') + (n ? '' : ' none');
    tile.dataset.id = id;
    const def = PALETTE.find((t) => t.id === id);
    tile.title = (def ? def.hint : name) + (n ? '' : ' (no room right now: drag it to see why)');
    const c = document.createElement('canvas');
    c.width = c.height = Math.round(60 * dpr);
    c.getContext('2d').drawImage(pics.get(id, 60), 0, 0, c.width, c.height);
    const b = document.createElement('b'), i = document.createElement('i');
    b.textContent = name;
    i.textContent = n ? `${n} spot${n === 1 ? '' : 's'}` : 'no room';
    tile.append(c, b, i);
    tile.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || tray.id) return;
      e.preventDefault();
      tile.setPointerCapture(e.pointerId);
      Object.assign(tray, { id, moved: false, slots: [], target: null, ptr: null, why: '', img: null, x0: e.clientX, y0: e.clientY });
    });
    tile.addEventListener('pointermove', (e) => { if (tray.id === id) trayMove(e); });
    tile.addEventListener('pointerup', (e) => { if (tray.id === id) trayUp(e); });
    tile.addEventListener('pointercancel', () => { if (tray.id === id) trayEnd(); });
    el.appendChild(tile);
  }
}
function trayMove(e) {
  if (!tray.moved) {
    if (Math.hypot(e.clientX - tray.x0, e.clientY - tray.y0) < 6) return; // (still a click)
    tray.moved = true;
    tray.slots = info[tray.id] ? info[tray.id].legal : [];
    tray.img = pics.get(tray.id, 64);
    const g = $('ghost').getContext('2d');
    g.clearRect(0, 0, 136, 136);
    g.drawImage(pics.get(tray.id, 68), 0, 0, 136, 136);
  }
  const gh = $('ghost'), r = bp.getBoundingClientRect();
  const inside = !!bv && editing && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  const was = tray.target;
  tray.target = null;
  tray.why = '';
  tray.ptr = null;
  if (inside) {
    const w = bpPoint(e);
    tray.ptr = w;
    tray.target = pickSlot(tray.slots, w.x, w.y, dropReach());
    if (!tray.target) tray.why = whyNot(parts, tray.id, w.x, w.y);
    else if (tray.target !== was) { const v = tray.target.check(); $('hint').textContent = tray.target.label + (v.warns.length ? '  (warning: ' + v.warns[0] + ')' : ''); }
    if (!tray.target) $('hint').textContent = tray.why;
  } else $('hint').textContent = 'Drop it on the blueprint (anywhere else cancels).';
  gh.style.display = inside && tray.target ? 'none' : 'block'; // (snapped: the paper draws the picture on its spot)
  gh.className = inside ? 'bad' : 'off'; // (red over a bad place on the paper; faint off the paper, where letting go cancels)
  gh.style.transform = `translate(${e.clientX - 34}px, ${e.clientY - 34}px)`;
}
function trayEnd() {
  Object.assign(tray, { id: null, moved: false, slots: [], target: null, ptr: null, why: '', img: null });
  $('ghost').style.display = 'none';
}
function trayUp(e) {
  const { id, moved, ptr } = tray;
  trayEnd();
  if (!moved) { pick(id); return; } // a click on a tile: the old way (pick it, then a brass pin)
  if (!ptr) { note('Cancelled: a part is placed by dropping it on the blueprint.', false); return; }
  const r = placePart(parts, id, ptr.x, ptr.y, { maxDist: dropReach() });
  if (!r.ok) { note('Cannot drop it there: ' + r.hint, true); return; }
  applyEdit(r);
}

const label = (p) => {
  switch (p.part) {
    case 'station': return `${p.n} (${p.kind})`;
    case 'gun': case 'searchlight': return `${p.part}: ${p.n}`;
    case 'engine': return `engine: ${p.name}`;
    case 'deck': return `deck: ${p.name} ${p.x0}-${p.x1}`;
    case 'room': return `room: ${p.name}`;
    case 'ladder': case 'rope': case 'pole': case 'stairs': case 'lift': return `${p.part} ${p.top}>${p.bottom} x${p.xTop}`;
    case 'rack': return `rack: ${p.kind} (${p.p} ${p.x})`;
    case 'pipe': return `pipe to ${p.to}`;
    case 'vent': case 'extinguisher': case 'boarderEntry': return `${p.part} (${p.p} ${p.x})`;
    case 'escortDock': return `escort hook: ${p.n}`;
    case 'ballast': return `sandbag${p.hang ? ' (hanging)' : ''} (${p.p} ${p.x})`;
    case 'gasbag': return `gasbag ${p.rx * 2} px${p.twin ? ' + twin' : ''}`;
    case 'medbay': return `medbay (${p.p} ${p.x})`;
    default: return p.part;
  }
};
function drawParts() {
  const el = $('parts');
  el.textContent = '';
  $('partCount').textContent = `(${parts.length})`;
  const order = parts.map((p, i) => ({ p, i, isNew: !baseline.has(JSON.stringify(p)) })).sort((a, b) => b.isNew - a.isNew || a.i - b.i);
  for (const { p, i, isNew } of order) {
    const li = document.createElement('li');
    li.className = isNew ? 'new' : '';
    const t = document.createElement('span');
    t.textContent = (isNew ? '+ ' : '') + label(p);
    t.title = JSON.stringify(p);
    const x = document.createElement('button');
    x.textContent = 'x';
    x.title = 'Remove this part';
    x.disabled = p.part === 'frame';
    x.onclick = () => removePart(i);
    li.append(t, x);
    el.appendChild(li);
  }
}

// ---- bottom: report and gauges ---------------------------------------------------------------------------------------
function drawReport() {
  const r = result;
  $('verdict').innerHTML = `<span class="${r.ok ? 'PASS' : 'FAIL'}">${r.ok ? 'PASS' : 'FAIL'}</span>${r.warns.length ? ` <span class="WARN" style="font-size:13px">${r.warns.length} warning${r.warns.length === 1 ? '' : 's'}</span>` : ''}`;
  const need = $('needs');
  need.className = r.ok ? 'ok' : 'bad';
  need.textContent = r.ok ? 'She can fly.' : 'Needs: ' + (r.needs.length ? r.needs.join(', ') : r.fails[0]);
  const list = $('checklist');
  list.textContent = '';
  for (const c of r.checklist) {
    const li = document.createElement('span');
    li.className = 'chip ' + (c.ok ? 'done' : 'todo');
    li.textContent = (c.ok ? '\u2713 ' : '\u25cb ') + c.label.replace(/^(a|an|two) /, '');
    list.appendChild(li);
  }
  const el = $('report');
  el.textContent = '';
  for (const c of r.checks) {
    const d = document.createElement('div');
    d.className = 'chk-line';
    d.innerHTML = `<span class="${c.level}">${c.level}</span><span>${c.group}</span><span></span>`;
    d.lastChild.textContent = c.text;
    el.appendChild(d);
  }
}
function drawGauges() {
  fitCanvas(gauges);
  const g = gctx;
  const W = gauges.width, H = gauges.height;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
  const b = result && result.budgets;
  if (!b || !b.lift) return;
  const s = Math.min(2, devicePixelRatio || 1);
  g.scale(s, s);
  const w = W / s, h = H / s;
  const BC = config.BUILD_CHECK, BALANCE = config.BALANCE;
  const gap = 8, cw = (w - gap * 3) / 4;
  const colour = (lv) => (lv === 'FAIL' ? L.STAMP : lv === 'WARN' ? '#c9892a' : '#4f7f3f');
  // zones: [from, to, colour] over a 0..max scale; marks: [value, text]
  const card = (i, title, big, sub, max, zones, marks, lv) => {
    const x = i * (cw + gap);
    logbook.paper(x, 2, cw, h - 8, { r: 8, pins: false });
    g.fillStyle = L.INK;
    g.font = `15px ${config.FONTS.DISPLAY}`;
    g.textAlign = 'left';
    g.fillText(title, x + 12, 24);
    g.fillStyle = colour(lv);
    g.font = `17px ${config.FONTS.DISPLAY}`;
    g.fillText(big, x + 12, 50);
    g.fillStyle = L.INK_SOFT;
    g.font = `11px ${config.FONTS.TEXT}`;
    sub.forEach((t, k) => g.fillText(t, x + 12, 67 + k * 12, cw - 20));
    const bx = x + 12, bw = cw - 24, by = h - 38;
    for (const [a, z, c] of zones) { g.fillStyle = c; g.fillRect(bx + (a / max) * bw, by, ((z - a) / max) * bw, 12); }
    g.strokeStyle = L.INK;
    g.lineWidth = 2;
    g.strokeRect(bx, by, bw, 12);
    for (const [v, t] of marks) {
      const mx = bx + (Math.max(0, Math.min(max, v)) / max) * bw;
      g.fillStyle = L.INK;
      g.beginPath(); g.moveTo(mx, by - 2); g.lineTo(mx - 5, by - 10); g.lineTo(mx + 5, by - 10); g.closePath(); g.fill();
      g.font = `10px ${config.FONTS.TEXT}`;
      g.textAlign = 'center';
      g.fillText(t, mx, by + 24);
    }
    g.textAlign = 'left';
  };
  const green = '#9cc48a', amber = '#e2bf6a', red = '#d98a80';
  card(0, 'LIFT', `gas ${b.lift.hover}`, [`hovers at gas ${b.lift.hover}`, `weight ${b.lift.mass}, lift ${b.lift.lift}`, `allowed ${BC.HOVER_MIN}-${BC.HOVER_MAX}, warn over ${BC.HOVER_WARN}`], 100,
    [[0, BC.HOVER_MIN, red], [BC.HOVER_MIN, BC.HOVER_WARN, green], [BC.HOVER_WARN, BC.HOVER_MAX, amber], [BC.HOVER_MAX, 100, red]], [[b.lift.hover, String(b.lift.hover)]], b.lift.level);
  card(1, 'STEAM', `${b.steam.cruise} / ${b.steam.idle}`, [`cruise / idle pressure`, `${b.steam.boilers} boiler${b.steam.boilers === 1 ? '' : 's'}, heat ${b.steam.heat}`, `cruise ${BC.PRESS_CRUISE_MIN}+, idle under ${BC.PRESS_IDLE_MAX}`], 100,
    [[0, BC.PRESS_CRUISE_MIN, red], [BC.PRESS_CRUISE_MIN, BC.PRESS_IDLE_MAX, green], [BC.PRESS_IDLE_MAX, 100, amber]], [[b.steam.cruise, 'cruise'], [b.steam.idle, 'idle']], b.steam.level);
  const bal = b.balance, live = sim && sim.state.balance;
  if (bal) {
    // BALANCE: a beam on a fulcrum. Her centre of mass against the middle of her lift: the nose end goes down when she is nose-heavy. A faint second beam is the live balance (crew, coal, ammo ...).
    const x = 3 * (cw + gap), col = colour(bal.level), by = h - 34, bw = cw - 24, cx = x + cw / 2;
    logbook.paper(x, 2, cw, h - 8, { r: 8, pins: false });
    g.fillStyle = L.INK; g.font = `15px ${config.FONTS.DISPLAY}`; g.textAlign = 'left'; g.fillText('BALANCE', x + 12, 24);
    g.fillStyle = col; g.font = `17px ${config.FONTS.DISPLAY}`; g.fillText(bal.com && bal.col ? (bal.deg === 0 ? 'level' : `${bal.deg > 0 ? 'nose' : 'tail'}-heavy ${Math.abs(bal.deg)}\u00b0`) : 'no bag yet', x + 12, 50);
    g.fillStyle = L.INK_SOFT; g.font = `11px ${config.FONTS.TEXT}`;
    const sub = bal.com && bal.col ? [`weight x ${Math.round(bal.com.x)}, lift x ${Math.round(bal.col.x)}`, `level within ${BALANCE.LEVEL_PX} px, warn ${BALANCE.WARN_PX}, fail ${BALANCE.FAIL_PX}`] : ['draw a gasbag, then add parts', ''];
    sub.forEach((t, k) => g.fillText(t, x + 12, 67 + k * 12, cw - 20));
    if (live) g.fillText(`live now: ${Math.abs(live.deg) < 0.05 ? 'level' : (live.deg > 0 ? 'nose ' : 'tail ') + Math.abs(live.deg).toFixed(1) + '\u00b0'}`, x + 12, 91);
    const beam = (deg, style, width) => {
      const a = (Math.max(-18, Math.min(18, deg * 3)) * Math.PI) / 180, r = bw / 2 - 6;
      g.strokeStyle = style; g.lineWidth = width; g.beginPath(); g.moveTo(cx - Math.cos(a) * r, by - Math.sin(a) * r); g.lineTo(cx + Math.cos(a) * r, by + Math.sin(a) * r); g.stroke();
      return [cx + Math.cos(a) * r, by + Math.sin(a) * r, cx - Math.cos(a) * r, by - Math.sin(a) * r];
    };
    g.fillStyle = L.INK; g.beginPath(); g.moveTo(cx, by + 3); g.lineTo(cx - 10, by + 18); g.lineTo(cx + 10, by + 18); g.closePath(); g.fill();
    if (live) beam(live.deg, 'rgba(58,44,32,0.28)', 6);
    const [nx, ny, tx, ty] = beam(bal.deg, col, 4);
    g.fillStyle = col; for (const [px, py] of [[nx, ny], [tx, ty]]) { g.beginPath(); g.arc(px, py, 5, 0, 6.2832); g.fill(); }
    g.fillStyle = L.INK_SOFT; g.font = `10px ${config.FONTS.TEXT}`; g.textAlign = 'center'; g.fillText('TAIL', x + 24, h - 10); g.fillText('NOSE', x + cw - 24, h - 10); g.textAlign = 'left';
  }
  card(2, 'HANDS', `${b.hands.perPlayer} each`, [`${b.hands.stations} manned stations`, `at ${b.hands.crew} crew; ${b.hands.at4} at 4, ${b.hands.at6} at 6`, `warn over ${BC.HANDS_PER_PLAYER}`], 5,
    [[0, 1.5, amber], [1.5, BC.HANDS_PER_PLAYER, green], [BC.HANDS_PER_PLAYER, 5, red]], [[b.hands.perPlayer, String(b.hands.perPlayer)]], b.hands.level);
}
setInterval(() => {
  if (!sim) { $('live').textContent = 'Nothing is flying yet.'; return; }
  const sh = sim.state.ship;
  const bits = [`Live: gas ${Math.round(sh.gas)}, steam ${Math.round(sh.press)}, hull ${Math.round(sh.hull)}, alt ${Math.round(sh.alt)}`];
  if (result && result.budgets.lift) bits.push(`(the gauges predict hover ${result.budgets.lift.hover}, cruise steam ${result.budgets.steam.cruise}; the game itself does not yet weigh parts: S.6)`);
  if (sim.state.bags.length > 1) bits.push(`bags ${sim.state.bags.map((b) => Math.round(b.gas) + (b.down ? ' (FLAT)' : '')).join(' / ')}`);
  const bl = sim.state.balance;
  if (bl) bits.push(`trim ${Math.abs(bl.deg) < 0.05 ? 'level' : (bl.deg > 0 ? 'nose-heavy ' : 'tail-heavy ') + Math.abs(bl.deg).toFixed(1) + '\u00b0'} (crew and coal move it)`);
  $('live').textContent = bits.join(' ');
  drawGauges(); // (the live beam)
}, 500);

// ---- overlays, drawn in the ship's own coordinates (render.js calls view.shipOverlay) --------------------------------
const heat = (cost) => `hsl(${Math.round(120 - Math.min(1, cost / 12) * 120)},75%,42%)`;
function overlay(g, t) {
  shipMatrix = g.getTransform();
  const Ly = SHIP_LAYOUT;
  if (flag.blue) {
    g.fillStyle = 'rgba(22,52,98,0.7)';
    g.fillRect(-4000, -4000, 9000, 9000);
    g.strokeStyle = '#dbe9ff';
    g.fillStyle = '#dbe9ff';
    g.lineWidth = 3;
    for (const g2 of Ly.gasbags) { g.beginPath(); g.ellipse(g2.cx, g2.cy, g2.rx, g2.ry, 0, 0, 6.2832); g.stroke(); }
    for (const r of Ly.hitRects) g.strokeRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
    Ly.platforms.forEach((q) => { g.lineWidth = 6; g.beginPath(); g.moveTo(q.x0, q.y); g.lineTo(q.x1, q.y); g.stroke(); });
    g.lineWidth = 3;
    for (const c of Ly.connectors) { g.beginPath(); g.moveTo(c.xTop, Ly.platforms[c.top].y); g.lineTo(c.xBottom, Ly.platforms[c.bottom].y); g.setLineDash(c.type === 'pole' ? [4, 8] : []); g.stroke(); g.setLineDash([]); }
    for (const s of Ly.stations) g.fillRect(s.x - 8, Ly.platforms[s.d].y - 26, 16, 26);
    g.font = '22px Georgia';
    for (const s of Ly.stations) g.fillText(s.n, s.x - 20, Ly.platforms[s.d].y - 34);
  }
  if (flag.nav && planner) {
    const boiler = Ly.stations.find((s) => s.kind === 'boiler');
    Ly.platforms.forEach((q, d) => {
      for (let x = q.x0; x < q.x1; x += 20) {
        const cost = boiler ? planner.plan(boiler.d, boiler.x, d, Math.min(q.x1, x + 10)).cost : 0;
        g.fillStyle = Number.isFinite(cost) ? heat(cost) : '#222';
        g.fillRect(x, q.y - 4, Math.min(20, q.x1 - x), 8);
      }
    });
    g.lineWidth = 4;
    for (const c of Ly.connectors) {
      const a = [c.xTop, Ly.platforms[c.top].y], b = [c.xBottom, Ly.platforms[c.bottom].y];
      g.strokeStyle = c.type === 'pole' ? '#8338ec' : '#ffffff';
      g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke();
      for (const [px, py, fill] of [[a[0], a[1], '#fff'], [b[0], b[1], c.type === 'pole' ? '#bbb' : '#fff']]) { g.fillStyle = fill; g.strokeStyle = '#222'; g.lineWidth = 2; g.beginPath(); g.arc(px, py, 9, 0, 6.2832); g.fill(); g.stroke(); }
      if (c.type === 'pole') { g.fillStyle = '#8338ec'; g.beginPath(); g.moveTo(b[0], b[1] - 14); g.lineTo(b[0] - 9, b[1] - 32); g.lineTo(b[0] + 9, b[1] - 32); g.closePath(); g.fill(); }
      g.lineWidth = 4;
    }
    if (boiler) { g.fillStyle = '#fff'; g.font = 'bold 26px Georgia'; g.fillText('heat: seconds from the boiler (green near, red 12 s+)', Ly.bounds.x0 + 20, Ly.bounds.y1 + 60); }
  }
  if (flag.samples) {
    g.fillStyle = 'rgba(220,40,40,0.9)';
    for (const [x, y] of Ly.samples) { g.beginPath(); g.arc(x, y, 9, 0, 6.2832); g.fill(); }
    g.lineWidth = 3;
    const box = (r, c, dash) => { g.strokeStyle = c; g.setLineDash(dash); g.strokeRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0); g.setLineDash([]); };
    box(Ly.bounds, '#1fb5c9', [14, 8]);
    box(Ly.fitBox, '#ff8c42', [10, 10]);
    box(Ly.hullRect, '#888', [4, 8]);
    g.fillStyle = '#ff8c42'; g.font = 'bold 24px Georgia';
    g.fillText(`cave fit box: tunnel ${Ly.caveNeed.tunnel} x shaft ${Ly.caveNeed.shaft} squares`, Ly.fitBox.x0 + 10, Ly.fitBox.y0 - 10);
  }
  if (flag.slots && picked) {
    for (const s of slots) {
      const on = hover === s;
      g.beginPath(); g.arc(s.x, s.y - 30, on ? 24 : 16, 0, 6.2832);
      g.fillStyle = on ? '#ffe9a0' : '#ffd24a'; g.fill();
      g.lineWidth = 5; g.strokeStyle = L.INK; g.stroke();
      if (on) {
        g.strokeStyle = 'rgba(201,168,90,.8)'; g.lineWidth = 5; g.beginPath(); g.moveTo(s.x, s.y - 14); g.lineTo(s.x, s.y); g.stroke();
        g.font = 'bold 26px Georgia'; g.fillStyle = '#fff'; g.strokeStyle = '#222'; g.lineWidth = 5; g.strokeText(s.label, s.x - 60, s.y - 70); g.fillText(s.label, s.x - 60, s.y - 70);
      }
    }
  }
}

// ---- the blueprint: pencil, eraser, pins ------------------------------------------------------------------------------
const bpPoint = (e) => {
  const r = bp.getBoundingClientRect();
  return bv ? bv.toWorld(((e.clientX - r.left) * bp.width) / r.width, ((e.clientY - r.top) * bp.height) / r.height) : null;
};
// Which row a stroke at this height means: the pencil snaps to the nearest drawable row; the eraser to the nearest deck under the pointer (or the gasbag
// when the pointer is inside it); the gasbag tool to the gasbag band; the ladder tool to the nearest deck under the pointer.
const BAG_BAND = [60, 420]; // pointer heights that mean "the gasbag row" (between the nest row and the top deck row)
function deckRowAt(w, anyX = false) { // (anyX: the eraser may start off the end of a deck, on its row)
  const near = (bpLayout ? bpLayout.platforms : []).filter((q) => (anyX || (w.x > q.x0 - 40 && w.x < q.x1 + 40)) && Math.abs(q.y - w.y) < 45).sort((a, b) => Math.abs(a.y - w.y) - Math.abs(b.y - w.y))[0];
  return near ? { row: rowOf(near) } : null;
}
function rowFor(w) {
  if (tool === 'bag') return w.y > BAG_BAND[0] && w.y < BAG_BAND[1] ? { row: 'gasbag' } : { why: 'Drag along the dashed gasbag band to draw the bag.' };
  if (tool === 'draw') return rowAtY(w.y);
  const hit = deckRowAt(w, tool === 'erase');
  if (hit) return hit;
  if (tool === 'erase' && bpLayout && bpLayout.gasbags.some((bag) => Math.hypot((w.x - bag.cx) / bag.rx, (w.y - bag.cy) / bag.ry) < 1)) return { row: 'gasbag' };
  return { why: tool === 'ladder' ? 'Start the ladder on a deck and drag down to another deck.' : 'No deck there: drag the eraser along a deck.' };
}
const strokeOf = (d) => [Math.min(d.a, d.b), Math.max(d.a, d.b)];
// The bag end under a point (the Gasbag tool grabs it to resize that bag): { i (bag number, tail to nose), side ('x0' tail end, 'x1' nose end), x } or null.
function bagEndAt(w) {
  const bags = bpLayout ? bpLayout.gasbags : [];
  const reach = (bv ? (14 * bv.k) / bv.s : 14);
  for (let i = 0; i < bags.length; i++) for (const side of ['x0', 'x1']) if (Math.hypot(w.x - bags[i][side], w.y - bags[i].cy) < reach) return { i, side, x: bags[i][side] };
  return null;
}
const slop = () => (bv ? (12 * bv.k) / bv.s : 12); // ship px that make 12 screen px: how close a click must be to a thin thing
const connectorType = (d) => ($('oPole').checked ? 'pole' : d.row === 'nest' || d.rowB === 'nest' ? 'rope' : 'ladder');
// What the stroke would do (a ghost for the paper and a note): { tool, row, x0, x1, ok, label }.
function ghostOf(d) {
  if (d.tool === 'ladder') {
    const g = { tool: 'ladder', row: d.row, row1: d.rowB || d.row, x0: d.x, x1: d.x, ok: false, label: '', type: connectorType(d) };
    if (!d.rowB || d.rowB === d.row) { g.label = 'drag down to another deck'; return g; }
    const r = placeConnector(parts, d.x, d.row, d.rowB, g.type);
    g.ok = r.ok;
    g.label = r.ok ? r.hint : r.hint;
    if (r.ok) g.x0 = g.x1 = r.x;
    return g;
  }
  if (d.tool === 'bagend') { // dragging one end of a bag
    const r = resizeBag(parts, d.i, d.side, d.b);
    const g = { tool: 'bag', row: 'gasbag', x0: d.b, x1: d.b, ok: r.ok, label: r.hint };
    if (r.ok) try { g.bags = buildLayout(r.parts).gasbags; } catch { /* no preview */ }
    return g;
  }
  const [x0, x1] = strokeOf(d);
  const g = { tool: d.tool, row: d.row, x0, x1, ok: false, label: '' };
  if (x1 - x0 < 20) { g.label = d.tool === 'draw' ? 'drag along the row' : d.tool === 'bag' ? 'drag along the bag row' : 'drag along the deck'; return g; }
  const r = d.tool === 'draw' ? drawDeck(parts, d.row, x0, x1) : d.tool === 'bag' ? drawBag(parts, x0, x1) : erase(parts, d.row, x0, x1);
  g.ok = r.ok;
  if (!r.ok) g.label = r.hint;
  else if (d.tool === 'bag') {
    g.label = r.hint;
    try { g.bags = buildLayout(r.parts).gasbags; } catch { /* no preview */ }
  } else if (d.tool === 'draw') g.label = (r.kind === 'new' ? 'new ' + r.deck + (r.added.length > 1 ? ' (with a ladder)' : ' (the first deck)') : r.deck + ' +' + r.grew + ' column' + (r.grew === 1 ? '' : 's')) + '   ' + r.cols + ' col = ' + Math.round(x1 - x0) + ' px';
  else g.label = 'erase ' + r.cols + ' column' + (r.cols === 1 ? '' : 's') + (r.removed.length ? ' - removes ' + summarize(r.removed) : '');
  return g;
}
bp.addEventListener('contextmenu', (e) => { // right-click anywhere on a thing deletes it
  const w = bpPoint(e);
  if (!w) return;
  e.preventDefault();
  applyEdit(removeAt(parts, w.x, w.y, slop()));
});
bp.addEventListener('pointerdown', (e) => {
  const w = bpPoint(e);
  if (!w || tool === 'place' || e.button === 2) return;
  e.preventDefault();
  if (tool === 'delete') { applyEdit(removeAt(parts, w.x, w.y, slop())); return; }
  const r = rowFor(w);
  if (!r.row) { note(r.why, true); return; }
  bp.setPointerCapture(e.pointerId);
  if (tool === 'ladder') { drag = { tool, row: r.row, x: Math.round(w.x / 10) * 10, y: w.y, rowB: null }; note('', false); return; }
  const end = tool === 'bag' ? bagEndAt(w) : null; // grabbing a bag's end resizes that bag
  if (end) { drag = { tool: 'bagend', row: 'gasbag', i: end.i, side: end.side, b: end.x }; note('', false); return; }
  const x = snapX(parts, w.x, tool === 'bag');
  drag = { tool, row: r.row, a: x, b: x, start: w };
  note('', false);
});
bp.addEventListener('pointermove', (e) => {
  const w = bpPoint(e);
  if (!w) return;
  if (tool === 'place') {
    hover = null;
    if (picked && bv) {
      let best = 22 * bv.k;
      for (const s of slots) { const d = Math.hypot(bv.X(s.x) - bv.X(w.x), bv.Y(s.y) - 18 * bv.k - bv.Y(w.y)); if (d < best) { best = d; hover = s; } }
    }
    bp.style.cursor = hover ? 'pointer' : 'default';
    if (hover) { const v = hover.check(); $('hint').textContent = hover.label + (v.warns.length ? '  (warning: ' + v.warns[0] + ')' : ''); }
    return;
  }
  if (tool === 'delete') {
    const t = thingAt(parts, w.x, w.y, slop());
    bpHover = { target: t };
    bp.style.cursor = t ? 'pointer' : 'default';
    $('hint').textContent = t ? 'Click to delete ' + t.label + '.' : TOOL_HINT.delete;
    return;
  }
  if (drag && drag.tool === 'ladder') {
    drag.y = w.y;
    const hit = deckRowAt({ x: drag.x, y: w.y });
    drag.rowB = hit ? hit.row : null;
    return;
  }
  if (drag) { drag.b = snapX(parts, w.x, drag.tool === 'bag' || drag.tool === 'bagend'); return; }
  bp.style.cursor = tool === 'bag' && bagEndAt(w) ? 'ew-resize' : 'crosshair';
  const r = rowFor(w);
  bpHover = r.row ? { row: r.row, cursor: tool === 'ladder' ? null : { x: snapX(parts, w.x), y: r.row === 'gasbag' ? config.BUILD_EDIT.BAG_CY : DECK_ROWS[r.row] } } : { why: r.why, cursor: null };
});
bp.addEventListener('pointerup', (e) => {
  if (tool === 'place') { if (hover) { edit(hover.apply(parts)); note('', false); } return; }
  if (!drag) return;
  const d = drag;
  drag = null;
  if (d.tool === 'ladder') {
    if (d.rowB && d.rowB !== d.row) applyEdit(placeConnector(parts, d.x, d.row, d.rowB, connectorType(d)));
    return;
  }
  if (d.tool === 'bagend') { applyEdit(resizeBag(parts, d.i, d.side, d.b)); return; }
  const [x0, x1] = strokeOf(d);
  if (x1 - x0 < 20) { // (a click with the eraser deletes the one thing under it)
    if (d.tool === 'erase' && d.start) { const t = thingAt(parts, d.start.x, d.start.y, slop()); if (t) applyEdit(removeAt(parts, d.start.x, d.start.y, slop())); }
    return;
  }
  applyEdit(d.tool === 'draw' ? drawDeck(parts, d.row, x0, x1) : d.tool === 'bag' ? drawBag(parts, x0, x1) : erase(parts, d.row, x0, x1));
});
bp.addEventListener('pointercancel', () => { drag = null; });
bp.addEventListener('pointerleave', () => { bpHover = null; if (tool === 'place') hover = null; });
function drawBp() {
  bp.style.display = editing ? 'block' : 'none';
  if (!editing) return;
  fitCanvas(bp);
  if (!bpLayout || !bp.width) return;
  bv = blueprintView(bpLayout, bp.width, bp.height, Math.min(2, devicePixelRatio || 1));
  const ghost = drag ? ghostOf(drag) : null;
  const status = result && !result.ok ? { ok: false, text: 'CANNOT FLY yet - needs: ' + (result.needs.length ? result.needs.slice(0, 4).join(', ') + (result.needs.length > 4 ? ' ...' : '') : result.fails[0]) } : null;
  drawBlueprint(bctx, bv, bpLayout, { rowHover: drag ? drag.row : bpHover && bpHover.row, cursor: !drag && bpHover && bpHover.cursor, ghost, slots: tray.moved ? tray.slots : tool === 'place' && picked ? slots : [], hover: tray.moved ? tray.target : tool === 'place' ? hover : null, status, balance: result && result.budgets.balance, target: tool === 'delete' && bpHover ? bpHover.target : null, bagHandles: tool === 'bag', drop: tray.moved ? { slots: tray.slots, target: tray.target, ptr: tray.ptr, img: tray.img, why: tray.why } : null });
  if (!drag && bpHover && bpHover.why && tool !== 'place') $('hint').textContent = bpHover.why;
}

// ---- clicking slots --------------------------------------------------------------------------------------------------
const toShip = (e) => {
  if (!shipMatrix) return null;
  const r = scene.getBoundingClientRect();
  const pt = shipMatrix.inverse().transformPoint(new DOMPoint(((e.clientX - r.left) * scene.width) / r.width, ((e.clientY - r.top) * scene.height) / r.height));
  return { x: pt.x, y: pt.y };
};
scene.addEventListener('mousemove', (e) => {
  const p = picked && toShip(e);
  hover = null;
  if (p) {
    let best = 60;
    for (const s of slots) { const d = Math.hypot(s.x - p.x, s.y - 30 - p.y); if (d < best) { best = d; hover = s; } }
  }
  scene.style.cursor = hover ? 'pointer' : 'crosshair';
  if (hover) { const v = hover.check(); $('hint').textContent = hover.label + (v.warns.length ? '  (warning: ' + v.warns[0] + ')' : ''); }
});
scene.addEventListener('click', () => { if (hover) edit(hover.apply(parts)); });
addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (tray.id) { trayEnd(); note('Cancelled.', false); } else if (picked) pick(picked); } });

// ---- buttons ---------------------------------------------------------------------------------------------------------
for (const [id, key] of [['oNav', 'nav'], ['oSamples', 'samples'], ['oSlots', 'slots'], ['oBlue', 'blue']]) {
  $(id).checked = flag[key];
  $(id).onchange = () => { flag[key] = $(id).checked; };
}
const envs = Object.keys(config.ENVIRONMENTS).filter((k) => config.ENVIRONMENTS[k] && config.ENVIRONMENTS[k].name);
for (const id of envs) { const o = document.createElement('option'); o.value = id; o.textContent = config.ENVIRONMENTS[id].name; $('env').appendChild(o); }
$('env').value = envId;
$('env').onchange = () => { envId = $('env').value; startLive(); };
$('undo').onclick = () => { if (history.length) { parts = history.pop(); note('', false); refresh(); } };
$('oEdit').onchange = () => { editing = $('oEdit').checked; $('centre').classList.toggle('editing', editing); };
for (const [id, name] of TOOLS) $(id).onclick = () => setTool(name);
$('bagShort').onclick = () => applyEdit(setBag(parts, { grow: -1 }));
$('bagLong').onclick = () => applyEdit(setBag(parts, { grow: 1 }));
$('bagTwin').onclick = () => applyEdit(setBag(parts, { twin: 'toggle' }));
$('reset').onclick = () => { note('', false); edit(BUILDS.classic.map((p) => ({ ...p }))); };
$('clear').onclick = () => { note('Cleared: an empty sheet. Draw your first deck with the pencil, then the gasbag; the live pane lists what she still needs. Undo brings the old ship back.', false); edit(emptyBuild()); };
$('minimal').onclick = () => { note('A small ship built from nothing with the same tools (decks, bag, parts). Undo goes back.', false); edit(minimalBuild()); };
$('copy').onclick = async () => {
  const text = JSON.stringify(parts);
  try { await navigator.clipboard.writeText(text); } catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }
  $('hint').textContent = `Copied the build (${parts.length} parts, ${text.length} characters). Save it as a .json file for "node tools/buildsim.mjs --build file.json", or open buildtest.html?build=<it>.`;
};

// "Run 60 s bot test": a fast copy of the ship flown by 6 bots on a cave map for 60 simulated seconds, then a short report.
function runBotTest() {
  if (!result.ok) { $('bot').textContent = 'Fix the build first (it has FAILs).'; return; }
  const keepMap = config.MAPS.FORCE_KIND, keepEnv = config.ENVIRONMENTS.FORCE, realNow = performance.now.bind(performance);
  let clock = 0;
  let stats, errors = 0, firstError = '';
  const t0 = realNow();
  try {
    config.MAPS.FORCE_KIND = 'network';
    config.ENVIRONMENTS.FORCE = envId;
    performance.now = () => clock;
    const s = createSimulation();
    addBots(s, config.BUILD_CHECK.BOT_BOTS);
    s.castOff();
    const rs = createRunStats(s.state);
    const dt = 1 / 60;
    for (let i = 0; i < 60 * 60; i++) {
      try { clock += dt * 1000; s.update(dt); rs.step(dt); } catch (e) { errors++; firstError = firstError || String(e && e.message); }
    }
    stats = { ...rs.result(), errors };
  } finally {
    config.MAPS.FORCE_KIND = keepMap;
    config.ENVIRONMENTS.FORCE = keepEnv;
    performance.now = realNow;
  }
  const el = $('bot');
  el.textContent = '';
  const head = document.createElement('div');
  head.innerHTML = `<b>60 s bot test</b> (${config.BUILD_CHECK.BOT_BOTS} bots, cave map, ${(realNow() - t0).toFixed(0)} ms): ${stats.kills} kills, hull ${stats.avgHull}, walking ${stats.walkPct}% of crew time, ${stats.wrecks} wreck${stats.wrecks === 1 ? '' : 's'}, ${stats.tows} tug rescue${stats.tows === 1 ? '' : 's'}${firstError ? ' - first error: ' + firstError : ''}`;
  el.appendChild(head);
  for (const c of judgeBotRuns([stats], SHIP_LAYOUT, { strict: false })) {
    const d = document.createElement('div');
    d.className = 'chk-line';
    d.innerHTML = `<span class="${c.level}">${c.level}</span><span>${c.group}</span><span></span>`;
    d.lastChild.textContent = c.text;
    el.appendChild(d);
  }
  live = stats;
  startLive(); // (the test used the shared ship data: put the live ship back on a fresh mission)
}
$('run').onclick = () => { $('bot').textContent = 'Running...'; setTimeout(runBotTest, 30); };

// ---- go ------------------------------------------------------------------------------------------------------------------
refresh(); // (a ?build= that cannot fly: nothing flies until it can, the live pane says what is missing)
window.buildTest = { get parts() { return parts; }, get result() { return result; }, get sim() { return sim; }, get live() { return live; }, edit, pick, slotsFor, info: () => info, runBotTest, startLive, flag, validate: () => result,
  tool: () => tool, setTool, applyEdit, drawDeck, drawBag, resizeBag, erase, setBag, placeConnector, placePart, removeAt, thingAt, emptyBuild, minimalBuild, tray: () => tray, bpScreen: (x, y) => { const r = bp.getBoundingClientRect(); return bv ? { x: r.left + (bv.X(x) * r.width) / bp.width, y: r.top + (bv.Y(y) * r.height) / bp.height } : null; }, // (bpScreen: ship coordinates to page pixels on the blueprint, for tests)
  screen: (x, y) => { const p = shipMatrix.transformPoint(new DOMPoint(x, y)), r = scene.getBoundingClientRect(); return { x: r.left + (p.x * r.width) / scene.width, y: r.top + (p.y * r.height) / scene.height }; } }; // (screen: ship coordinates to page pixels, for tests)

// While the build cannot fly: a stamp over the live pane saying what she still needs.
function drawBanner() {
  if (!result || result.ok) return;
  const g = ctx, k = Math.min(2, devicePixelRatio || 1);
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  const text = 'CANNOT FLY yet - needs: ' + (result.needs.length ? result.needs.join(', ') : result.fails[0]) + (flown ? '   (flying the last ship that could)' : '');
  g.font = `${Math.round(15 * k)}px ${config.FONTS.DISPLAY}`;
  const maxW = scene.width - 40 * k, lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && g.measureText(line + ' ' + word).width > maxW) { lines.push(line); line = word; } else line = line ? line + ' ' + word : word;
  }
  lines.push(line);
  const h = lines.length * 22 * k + 14 * k;
  g.fillStyle = 'rgba(243,234,214,0.92)';
  g.fillRect(20 * k, 14 * k, maxW, h);
  g.strokeStyle = L.STAMP;
  g.lineWidth = 2.6 * k;
  g.strokeRect(20 * k, 14 * k, maxW, h);
  g.fillStyle = L.STAMP;
  g.textAlign = 'left';
  lines.forEach((t, i) => g.fillText(t, 32 * k, 36 * k + i * 22 * k));
  g.restore();
}

let last = performance.now();
let acc = 0;
const frame = (now) => {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  try {
    fitCanvas(scene);
    drawBp();
    if (sim) {
      acc += dt;
      let n = 0;
      while (acc >= config.LOOP.STEP && n++ < config.LOOP.MAX_STEPS) {
        sim.update(config.LOOP.STEP);
        acc -= config.LOOP.STEP;
      }
      if (acc >= config.LOOP.STEP) acc = 0;
      const view = camera.update(dt, sim.state, scene.width, scene.height);
      if (view) {
        view.shipOverlay = overlay;
        renderer.renderFrame(now, view);
      }
    } else {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#8fb4d0';
      ctx.fillRect(0, 0, scene.width, scene.height);
    }
    drawBanner();
  } catch (e) {
    (window.gameErrors = window.gameErrors || []).push('buildtest: ' + e.message);
    if ((window.gameErrors || []).length < 4) console.error(e);
  }
};
requestAnimationFrame(frame);
