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
import { applyBuild } from '../../shipLayout.js'; // (ship 0's compatibility forward: builds are applied here before a fresh simulation reads the layout)
import { mainShip } from './ships.js';
import { BUILDS, DECK_ROWS, rowOf, buildLayout, ENGINE_DIRS, dirName, normAngle } from './shipBuild.js';
import { validate, makePlanner, judgeBotRuns, balanceGauge } from './buildCheck.js';
import { generateShip, THEMES, THEME_LABEL } from './shipGen.js';
import { CHAMPIONS } from './pvp/champions.js';
import { GAS_KEYS, gasKey } from './gases.js';
import { PALETTE, slotsFor, drawDeck, drawBag, resizeBag, erase, setBag, setGas, placeConnector, placePart, pickSlot, whyNot, thingAt, removeAt, setEngineDir, setEngineSwivel, emptyBuild, minimalBuild, snapX, rowAtY, summarize, addArmour } from './buildSlots.js';
import { blueprintView, drawBlueprint, engineArrow } from './blueprintArt.js';
import { createPartPictures } from './partArt.js';
import { createSprites } from './sprites.js';
import { createRunStats } from './buildStats.js';
import { createLogbook } from './logbookArt.js';
import { createSimulation } from './simulation.js';
import { createRenderer } from './render.js';
import { createCamera } from './camera.js';
import { createBpView, attachPanZoom } from './buildView.js'; // (zoom and pan of the blueprint)
import { initBuildUi, ui } from './buildPlay.js'; // (the big-screen shell: UI size, folding panels, views, PLAYTEST, My Ships)
import { loadWorking, loadPlaytestJob } from './playtest.js';

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
  const r = c.getBoundingClientRect(); // (the size on screen: the page may be zoomed, buildPlay.js ui.scale)
  const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
};
fitCanvas(scene);
fitCanvas(bp);
addEventListener('resize', () => { fitCanvas(scene); fitCanvas(bp); drawGauges(); });

// ---- the build being edited -------------------------------------------------------------------------------------
const multi = () => [...BUILDS.classic, { part: 'station', n: 'Fore Boiler', kind: 'boiler', p: 'main', x: 1090 }, { part: 'station', n: 'Aft Lookout', kind: 'lookout', p: 'nest', x: 700 }];
let restored = ''; // where the build came from when it is not the classic ship (the note says)
const initial = () => {
  const params = new URLSearchParams(location.search), q = params.get('build');
  try {
    if (q && q.trim().startsWith('[')) return JSON.parse(q);
    if (q === 'multi') return multi();
    if (params.get('from') === 'playtest') { const j = loadPlaytestJob(); if (j) { restored = 'Back from the playtest: the same ship.'; return j.parts; } } // (host.html's "Back to the builder")
    if (!q) { const w = loadWorking(); if (w) { restored = 'Your last working build is back (Reset to classic gives the stock ship).'; return w; } } // (autosaved by every edit)
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
let bui = null; // the big-screen shell (buildPlay.js initBuildUi), set up at the end
const view = createBpView(); // the blueprint's zoom and pan (buildView.js)
let fitFirst = true; // frame the ship on the first draw
const kPix = () => Math.min(2, devicePixelRatio || 1) * ui.scale; // canvas pixels per page pixel (the page itself may be zoomed on a big screen)
const flag = { nav: false, samples: false, slots: true, blue: false };
// the blueprint editor
let tool = 'draw'; // 'draw' (pencil) | 'bag' | 'ladder' | 'erase' | 'delete' | 'place' (part pins)
let editing = true; // the blueprint panel is shown
let bpLayout = null; // the layout of the build being edited (it can differ from the live ship when the edit cannot fly)
let bv = null; // the blueprint's paper-to-ship transform, set each frame
let drag = null; // a stroke in progress: { tool, row, a (where it started), b (where it is now) }; a ladder stroke: { tool, row (start deck row), x, y (where it is now), rowB }
let bpHover = null; // { row, cursor } while the pointer is over the paper without a stroke ({ target } for the delete tool)
let selBag = null; // GAS: the bag (number, tail to nose) the Gas buttons act on; null = the biggest. Click inside a bag with the Gasbag tool to pick it
const ALL_ROWS = Object.keys(DECK_ROWS);

// ---- the live ship ------------------------------------------------------------------------------------------------
const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];
const addBots = (s, n) => {
  const [a, b] = mainShip(s.state).layout.boarderEntryPoints;
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
  const keepKind = config.MAPS.FORCE_KIND;
  if (want3d) config.MAPS.FORCE_KIND = 'open'; // (the 3D pane orbits the ship: open sky, so there is no rock to fly through the picture)
  try {
    sim = createSimulation();
    addBots(sim, 4);
    sim.castOff();
    sim.course.startMission(1, { environment: envId });
  } finally { config.MAPS.FORCE_KIND = keepKind; }
  renderer = createRenderer({ ctx, state: sim.state, canvas: scene });
  planner = makePlanner(mainShip(sim.state).layout);
  sync3d();
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
const TOOLS = [['tDraw', 'draw'], ['tBag', 'bag'], ['tLadder', 'ladder'], ['tArmour', 'armour'], ['tErase', 'erase'], ['tDelete', 'delete'], ['tPlace', 'place'], ['tAim', 'aim']];
const toolButtons = () => { for (const [id, name] of TOOLS) $(id).className = tool === name ? 'on' : ''; };
// The pencil's OUTDOOR / COVERED toggle (S.5g): '' = the row's own kind (the top deck is open air, the hull rows are covered), 'outdoor' = an open-air walkway with rails, 'covered' = inside the hull.
let kind = '';
const coveredOpt = () => (kind === 'covered' ? true : kind === 'outdoor' ? false : undefined);
function setKind(k) { kind = kind === k ? '' : k; $('kOut').className = kind === 'outdoor' ? 'on' : ''; $('kIn').className = kind === 'covered' ? 'on' : ''; }
const TOOL_HINT = {
  draw: 'Pencil: drag along a deck row on the blueprint. Along a deck it gets longer; on an empty stretch it makes a new deck (the first one needs no ladder, later ones get one). Outdoor / Covered: an open-air walkway with rails (weather, raiders, overboard), or a deck inside the hull; draw along a deck with the other kind to turn it over.',
  armour: 'Armour: drag along a deck to plate its hull wall (covered deck) or rail (open deck) with riveted iron. Very heavy; plate does not burn and hits there do far less. The Delete tool takes a stretch off.',
  bag: 'Gasbag: drag along the dashed bag row. In empty space it draws a bag (beside another one: a row of bags, each with its own gas); across a bag it resizes it; or grab a bag\'s end (the brass dots) and drag. The twin envelope is the Twin bag button.',
  ladder: 'Ladder: drag straight down from one deck to another. Tick "slide pole" for a one-way pole (down only). Refused if a deck is missing at either end or something is in the way.',
  erase: 'Eraser: drag along a deck (or across the gasbag). What stood on that stretch goes with it (listed below the blueprint); Undo brings it back. A click on a thing deletes just that thing.',
  delete: 'Delete: click any one placed thing - a ladder, pole, station, gun, rack, vent, sandbag... (or right-click it anywhere). Undo brings it back.',
  aim: 'Aim engine: click an engine, then pick an arrow on the left (or drag the brass dot at the tip of its red thrust arrow, in any tool). Forward is speed, up lifts her (and tips the end it sits at), down dives.',
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
  drawEnginePanel();
  drawReport();
  drawGauges();
  if (bui) bui.edited(); // (autosave the working build, update the playtest buttons' line)
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
const TRAY = [['gasbag', 'Gasbag'], ['gasValve', 'Gas valve'], ['helm', 'Helm'], ['boiler', 'Boiler'], ['coal', 'Coal bunker'], ['ammo', 'Ammo hold'], ['engine', 'Engine pod'], ['engineSwivel', 'Swivel engine'], ['gun', 'Gun'], ['searchlight', 'Searchlight'], ['lookout', 'Lookout'],
  ['medbay', 'Medbay'], ['bombBay', 'Bomb bay'], ['lift', 'Lift'], ['boarding', 'Boarding point'], ['rack_hammer', 'Hammer rack'], ['rack_sword', 'Sword rack'], ['rack_hookshot', 'Hookshot rack'],
  ['extinguisher', 'Extinguisher'], ['armour', 'Armour plate'], ['vent', 'Steam vent'], ['sail', 'Mast and sail'], ['ladder', 'Ladder'], ['pole', 'Slide pole'], ['ballast', 'Sandbag'], ['ballast_hang', 'Hanging sandbag'], ['crewCannon', 'Crew cannon'], ['rack_sandbag', 'Sandbag rack'], ['rack_crate', 'Crate stack'], ['rack_towline', 'Towline reel'],
  ['gun_flame', 'Flamethrower'],
  ['gun_long', 'Long gun'], ['gun_mortar', 'Mortar'], ['gun_scatter', 'Grapeshot gun'], ['gun_flak', 'Flak gun'], ['gun_harpoon', 'Harpoon gun'], ['mineLayer', 'Mine layer'], ['ramProw', 'Ram prow'], ['dropHatch', 'Drop hatch 1'], ['dropHatch_2', 'Drop hatch 2'], ['dropHatch_3', 'Drop hatch 3']];
const tray = { id: null, moved: false, slots: [], target: null, ptr: null, why: '', img: null, x0: 0, y0: 0 }; // the tile being dragged (moved = it has left the tile)
// ---- pointed engines (S.5h) -------------------------------------------------------------------------------------------
// engDir is the way the NEXT engine will point (rotate it with the wheel or R while dragging an engine, or the arrows on the left); selEngine is the engine whose arrow the page is editing.
// Every engine on the blueprint has a red thrust arrow and a brass dot at its tip: drag the dot to turn that engine (snaps to 15 degrees); Aim engine + click an engine, then pick an arrow.
const ARROWS = ['→', '↗', '↑', '↖', '←', '↙', '↓', '↘']; // (ENGINE_DIRS in order: forward, up-forward, up, up-back, back, down-back, down, down-forward)
const isEngineTile = (id) => id === 'engine' || id === 'engineSwivel';
let engDir = 0;
let selEngine = null; // the name of the selected engine
let aim = null; // a drag of an engine's handle: { name, dir }
const engineNamed = (name) => parts.find((p) => p.part === 'engine' && p.name === name);
const stepDir = (dir, n) => normAngle(dir + (n * Math.PI) / 4);
function drawEnginePanel() {
  const mk = (el, cur, pick) => {
    el.textContent = '';
    ENGINE_DIRS.forEach((d, i) => {
      const b = document.createElement('button');
      b.textContent = ARROWS[i];
      b.title = dirName(d);
      b.className = Math.abs(normAngle(cur) - normAngle(d)) < 0.02 ? 'cur' : '';
      b.onclick = () => pick(d);
      el.appendChild(b);
    });
  };
  mk($('engArrows'), engDir, (d) => { engDir = d; drawTray(); drawEnginePanel(); });
  const e = selEngine && engineNamed(selEngine);
  if (selEngine && !e) selEngine = null;
  $('engSel').style.display = e ? 'block' : 'none';
  if (!e) return;
  $('engName').textContent = e.name;
  $('engSay').textContent = 'points ' + dirName(e.dir || 0);
  mk($('engSelArrows'), e.dir || 0, (d) => applyEdit(setEngineDir(parts, e.name, d)));
  $('engSwivel').checked = !!e.swivel;
}
function rotateEngine(n) { // wheel / R / the rotate buttons: the dragged engine, else the selected one, else the next one
  if (tray.id && isEngineTile(tray.id)) { engDir = stepDir(engDir, n); regrabGhost(); drawEnginePanel(); return; }
  const e = selEngine && engineNamed(selEngine);
  if (e) { applyEdit(setEngineDir(parts, e.name, stepDir(e.dir || 0, n))); return; }
  engDir = stepDir(engDir, n);
  drawTray();
  drawEnginePanel();
}
function regrabGhost() { // the picture on the ghost and on the paper follows the new direction
  if (!tray.id || !tray.moved) return;
  tray.img = pics.get(tray.id, 64, { dir: engDir });
  const g = $('ghost').getContext('2d');
  g.clearRect(0, 0, 136, 136);
  g.drawImage(pics.get(tray.id, 68, { dir: engDir }), 0, 0, 136, 136);
}
const dropReach = () => (bv ? (config.BUILD_EDIT.DROP_SNAP * bv.k) / bv.s : 200); // a snap distance in ship px
function drawTray() {
  const el = $('tray');
  el.textContent = '';
  const dpr = kPix();
  for (const [id, name] of TRAY) {
    const n = info[id] ? info[id].legal.length : 0;
    const tile = document.createElement('div');
    tile.className = 'tile' + (picked === id ? ' on' : '') + (n ? '' : ' none');
    tile.dataset.id = id;
    const def = PALETTE.find((t) => t.id === id);
    tile.title = (def ? def.hint : name) + (n ? '' : ' (no room right now: drag it to see why)');
    const c = document.createElement('canvas');
    c.width = c.height = Math.round(60 * dpr);
    c.getContext('2d').drawImage(pics.get(id, 60, isEngineTile(id) ? { dir: engDir } : {}), 0, 0, c.width, c.height);
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
    regrabGhost();
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
  const r = placePart(parts, id, ptr.x, ptr.y, { maxDist: dropReach(), dir: isEngineTile(id) ? engDir : undefined });
  if (!r.ok) { note('Cannot drop it there: ' + r.hint, true); return; }
  applyEdit(r);
  if (isEngineTile(id)) selectNewEngine();
}
function selectNewEngine() { // (a just-placed engine is the selected one: its arrows show on the left)
  const e = [...parts].reverse().find((p) => p.part === 'engine');
  selEngine = e ? e.name : null;
  drawEnginePanel();
}

const label = (p) => {
  switch (p.part) {
    case 'station': return `${p.n} (${p.kind})`;
    case 'gun': case 'searchlight': return `${p.part}: ${p.n}`;
    case 'engine': return `engine: ${p.name} (${dirName(p.dir || 0)}${p.swivel ? ', swivel' : ''})`;
    case 'deck': return `deck: ${p.name} ${p.x0}-${p.x1} (${p.outside ? 'outdoor' : 'covered'})`;
    case 'armour': return `armour plate (${p.p} ${p.x0}-${p.x1})`;
    case 'room': return `room: ${p.name}`;
    case 'ladder': case 'rope': case 'pole': case 'stairs': case 'lift': return `${p.part} ${p.top}>${p.bottom} x${p.xTop}`;
    case 'rack': return `rack: ${p.kind} (${p.p} ${p.x})`;
    case 'pipe': return `pipe to ${p.to}`;
    case 'gasValve': return `gas valve (${p.p} ${p.x})`;
    case 'vent': case 'extinguisher': case 'boarderEntry': return `${p.part} (${p.p} ${p.x})`;
    case 'escortDock': return `escort hook: ${p.n}`;
    case 'ballast': return `sandbag${p.hang ? ' (hanging)' : ''} (${p.p} ${p.x})`;
    case 'gasbag': return `gasbag ${p.rx * 2} px${p.twin ? ' + twin' : ''}${p.gasType ? ' (' + p.gasType + ')' : ''}`;
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
  const better = (r.advice || []).filter((a) => a.tier === 'rec').map((a) => a.label.replace(/^(a|an|two) /, ''));
  need.textContent = r.ok ? 'She can fly (a deck and a gasbag are all she needs).' + (better.length ? ' She would be better with: ' + better.join(', ') + '.' : '') : 'Needs: ' + (r.needs.length ? r.needs.join(', ') : r.fails[0]);
  const list = $('checklist');
  list.textContent = '';
  for (const c of r.checklist) {
    const li = document.createElement('span');
    li.className = 'chip ' + (c.ok ? 'done' : c.tier === 'need' ? 'todo' : c.tier === 'rec' && c.applies ? 'rec' : 'opt'); // (red = she cannot fly without it, amber = recommended, dashed = just nice to have)
    li.title = c.ok ? '' : c.why;
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
const GAUGE_H = 160; // one row of gauge cards (page px); in the narrow side panel the four cards stack two by two
function drawGauges() {
  const stacked = gauges.clientWidth < 640;
  gauges.style.height = (stacked ? GAUGE_H * 2 + 8 : GAUGE_H) + 'px';
  fitCanvas(gauges);
  const g = gctx;
  const W = gauges.width, H = gauges.height;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
  const b = result && result.budgets;
  if (!b || !b.lift) return;
  const s = kPix();
  g.scale(s, s);
  const w = W / s, h = GAUGE_H;
  const BC = config.BUILD_CHECK, BALANCE = config.BALANCE;
  const gap = 8, cw = stacked ? (w - gap) / 2 : (w - gap * 3) / 4;
  const pos = (i) => (stacked ? { x: (i % 2) * (cw + gap), y: Math.floor(i / 2) * (h + gap) } : { x: i * (cw + gap), y: 0 });
  const colour = (lv) => (lv === 'FAIL' ? L.STAMP : lv === 'WARN' ? '#c9892a' : '#4f7f3f');
  // zones: [from, to, colour] over a 0..max scale; marks: [value, text]
  const card = (i, title, big, sub, max, zones, marks, lv) => {
    const { x, y } = pos(i);
    g.save();
    g.translate(0, y);
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
    g.restore();
  };
  const green = '#9cc48a', amber = '#e2bf6a', red = '#d98a80';
  const gasNote = () => { const gs = [...new Set(parts.filter((p) => p.part === 'gasbag').map(gasKey))]; return gs.length === 1 && gs[0] === 'helium' ? '' : ' (' + gs.join(' + ') + ')'; }; // (GAS: the card says which gas the lift is of)
  card(0, 'LIFT', `gas ${b.lift.hover}`, [`hovers at gas ${b.lift.hover}`, `weight ${b.lift.mass}, lift ${b.lift.lift}${gasNote()}`, `allowed ${BC.HOVER_MIN}-${BC.HOVER_MAX}, warn over ${BC.HOVER_WARN}`], 100,
    [[0, BC.HOVER_MIN, red], [BC.HOVER_MIN, BC.HOVER_WARN, green], [BC.HOVER_WARN, BC.HOVER_MAX, amber], [BC.HOVER_MAX, 100, red]], [[b.lift.hover, String(b.lift.hover)]], b.lift.level);
  card(1, 'STEAM', `${b.steam.cruise} / ${b.steam.idle}`, [`cruise / idle pressure`, `${b.steam.boilers} boiler${b.steam.boilers === 1 ? '' : 's'}, heat ${b.steam.heat}`, `cruise ${BC.PRESS_CRUISE_MIN}+, idle under ${BC.PRESS_IDLE_MAX}`], 100,
    [[0, BC.PRESS_CRUISE_MIN, red], [BC.PRESS_CRUISE_MIN, BC.PRESS_IDLE_MAX, green], [BC.PRESS_IDLE_MAX, 100, amber]], [[b.steam.cruise, 'cruise'], [b.steam.idle, 'idle']], b.steam.level);
  const bal = b.balance, live = sim && sim.state.balance;
  if (bal) {
    // BALANCE: a beam on a fulcrum. Her centre of mass against the middle of her lift: the nose end goes down when she is nose-heavy. A faint second beam is the live balance (crew, coal, ammo ...).
    const { x, y: yo } = pos(3), col = colour(bal.level), by = h - 34, bw = cw - 24, cx = x + cw / 2;
    g.save();
    g.translate(0, yo);
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
    g.restore();
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
  const Ly = mainShip(sim.state).layout;
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
  const hit = deckRowAt(w, tool === 'erase' || tool === 'armour');
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
    if (r.ok) { g.x0 = g.x1 = r.x; g.parts = r.parts; }
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
  const r = d.tool === 'draw' ? drawDeck(parts, d.row, x0, x1, { covered: coveredOpt() }) : d.tool === 'bag' ? drawBag(parts, x0, x1) : d.tool === 'armour' ? addArmour(parts, d.row, x0, x1) : erase(parts, d.row, x0, x1);
  g.ok = r.ok;
  if (r.ok && d.tool !== 'erase') g.parts = r.parts; // (the 3D pane builds a ghost of what the stroke adds)
  if (d.tool === 'draw') g.cover =kind || (r.ok && r.outdoor !== undefined ? (r.outdoor ? 'outdoor' : 'covered') : '');
  if (!r.ok) g.label = r.hint;
  else if (d.tool === 'armour') g.label = 'armour plate ' + r.cols + ' column' + (r.cols === 1 ? '' : 's') + ' (heavy, does not burn)';
  else if (d.tool === 'draw' && r.kind === 'convert') g.label = r.hint;
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
  if (!w || e.button === 2) return;
  const handle = engineHandleAt(e);
  if (handle) { // the brass dot at the tip of an engine's thrust arrow: drag it round to aim the engine
    e.preventDefault();
    bp.setPointerCapture(e.pointerId);
    aim = { name: handle.name, dir: handle.dir || 0 };
    selEngine = handle.name;
    drawEnginePanel();
    return;
  }
  if (tool === 'aim') { // Aim engine: click an engine to pick its arrow on the left
    const t = thingAt(parts, w.x, w.y, slop()), o = t && parts[t.index];
    selEngine = o && o.part === 'engine' ? o.name : null;
    drawEnginePanel();
    note(selEngine ? `${selEngine}: pick an arrow on the left (or drag the brass dot).` : 'Click an engine (the E under a deck) or drag the brass dot on its arrow.', false);
    return;
  }
  if (tool === 'place') return;
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
// The engine whose aim handle (the brass dot on its thrust arrow) is under the pointer, or null.
const paperPoint = (e) => { const r = bp.getBoundingClientRect(); return { x: ((e.clientX - r.left) * bp.width) / r.width, y: ((e.clientY - r.top) * bp.height) / r.height }; };
function engineHandleAt(e) {
  if (!bv || !bpLayout) return null;
  const pt = paperPoint(e);
  for (const en of bpLayout.engines) {
    const q = bpLayout.platforms[en.d], tip = q && engineArrow(bv, en, q);
    if (tip && Math.hypot(tip.x - pt.x, tip.y - pt.y) < 11 * bv.k) return en;
  }
  return null;
}
bp.addEventListener('pointermove', (e) => {
  const w = bpPoint(e);
  if (!w) return;
  if (aim) { // turning an engine: it follows the pointer round its disc, in 15 degree steps
    const en = bpLayout.engines.find((q) => q.name === aim.name), q = en && bpLayout.platforms[en.d], pt = paperPoint(e);
    if (q) aim.dir = normAngle(Math.round(Math.atan2(pt.y - (bv.Y(q.y) + 14 * bv.k), pt.x - bv.X(en.x)) / (Math.PI / 12)) * (Math.PI / 12));
    return;
  }
  if (!drag && tool !== 'place' && engineHandleAt(e)) { bp.style.cursor = 'grab'; return; }
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
  if (aim) { const a = aim; aim = null; applyEdit(setEngineDir(parts, a.name, a.dir)); return; }
  if (tool === 'place') { if (hover) { edit(hover.apply(parts, { dir: engDir })); note('', false); if (picked && isEngineTile(picked)) selectNewEngine(); } return; }
  if (!drag) return;
  const d = drag;
  drag = null;
  if (d.tool === 'ladder') {
    if (d.rowB && d.rowB !== d.row) applyEdit(placeConnector(parts, d.x, d.row, d.rowB, connectorType(d)));
    return;
  }
  if (d.tool === 'bagend') { applyEdit(resizeBag(parts, d.i, d.side, d.b)); return; }
  const [x0, x1] = strokeOf(d);
  if (x1 - x0 < 20 && d.tool === 'bag' && d.start && bpLayout) { // (a click inside a bag picks it for the Gas buttons)
    const bi = bpLayout.gasbags.findIndex((b) => Math.hypot((d.start.x - b.cx) / b.rx, (d.start.y - b.cy) / b.ry) < 1);
    if (bi >= 0) { selBag = bi; note(`Bag ${bi + 1} picked: choose its gas with the Gas buttons above.`, false); }
    return;
  }
  if (x1 - x0 < 20) { // (a click with the eraser deletes the one thing under it)
    if (d.tool === 'erase' && d.start) { const t = thingAt(parts, d.start.x, d.start.y, slop()); if (t) applyEdit(removeAt(parts, d.start.x, d.start.y, slop())); }
    return;
  }
  applyEdit(d.tool === 'draw' ? drawDeck(parts, d.row, x0, x1, { covered: coveredOpt() }) : d.tool === 'bag' ? drawBag(parts, x0, x1) : d.tool === 'armour' ? addArmour(parts, d.row, x0, x1) : erase(parts, d.row, x0, x1));
});
bp.addEventListener('pointercancel', () => { drag = null; aim = null; });
bp.addEventListener('pointerleave', () => { bpHover = null; if (tool === 'place') hover = null; });
function drawBp() {
  bp.style.display = editing ? 'block' : 'none';
  if (!editing) return;
  fitCanvas(bp);
  if (!bpLayout || !bp.width) return;
  gasLabel();
  const base = blueprintView(bpLayout, bp.width, bp.height, kPix());
  bv = view.apply(base);
  if (fitFirst && bpLayout.platforms.length) { fitFirst = false; view.fit(bpLayout); bv = view.apply(base); } // (the page opens framed on the ship, not on the whole sheet)
  const ghost = drag ? ghostOf(drag) : null;
  bpGhost = ghost;
  const status = result && !result.ok ? { ok: false, text: 'CANNOT FLY yet - needs: ' + (result.needs.length ? result.needs.slice(0, 4).join(', ') + (result.needs.length > 4 ? ' ...' : '') : result.fails[0]) } : null;
  drawBlueprint(bctx, bv, bpLayout, { rowHover: drag ? drag.row : bpHover && bpHover.row, cursor: !drag && bpHover && bpHover.cursor, ghost, slots: tray.moved ? tray.slots : tool === 'place' && picked ? slots : [], hover: tray.moved ? tray.target : tool === 'place' ? hover : null, status, selBag: selBag != null && selBag < bpLayout.gasbags.length ? selBag : null, balance: result && result.budgets.balance, target: tool === 'delete' && bpHover ? bpHover.target : null, bagHandles: tool === 'bag', engine: selEngine, aim, drop: tray.moved ? { slots: tray.slots, target: tray.target, ptr: tray.ptr, img: tray.img, why: tray.why } : null });
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
scene.addEventListener('click', () => { if (hover) edit(hover.apply(parts, { dir: engDir })); });
addEventListener('keydown', (e) => { if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey && !/INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || '')) { rotateEngine(e.shiftKey ? -1 : 1); return; } if (e.key === 'Escape') { if (tray.id) { trayEnd(); note('Cancelled.', false); } else if (picked) pick(picked); } });

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
$('kOut').onclick = () => { setKind('outdoor'); setTool('draw'); };
$('kIn').onclick = () => { setKind('covered'); setTool('draw'); };
addEventListener('wheel', (e) => { if (tray.id && tray.moved && isEngineTile(tray.id)) { e.preventDefault(); rotateEngine(e.deltaY > 0 ? 1 : -1); } }, { passive: false }); // (the wheel turns the engine you are dragging)
$('engL').onclick = () => rotateEngine(-1);
$('engR').onclick = () => rotateEngine(1);
$('engSwivel').onchange = () => { if (selEngine) applyEdit(setEngineSwivel(parts, selEngine, $('engSwivel').checked)); };
$('bagShort').onclick = () => applyEdit(setBag(parts, { grow: -1 }));
$('bagLong').onclick = () => applyEdit(setBag(parts, { grow: 1 }));
$('bagTwin').onclick = () => applyEdit(setBag(parts, { twin: 'toggle' }));
// GAS (gases.js): the Gas buttons set the gas of the picked bag (the biggest when none is picked), or of every bag with "every bag" ticked. The label says which bag and what it holds.
for (const key of GAS_KEYS) $('gas_' + key).onclick = () => applyEdit(setGas(parts, { bag: selBag != null && selBag < bpLayout.gasbags.length ? selBag : null, gas: key, all: $('gasAll').checked }));
function gasLabel() {
  const bags = bpLayout ? bpLayout.gasbags : [], el = $('gasSel');
  if (!el) return;
  const bi = selBag != null && selBag < bags.length ? selBag : bags.reduce((best, b, i) => (best < 0 || b.rx > bags[best].rx ? i : best), -1);
  el.textContent = $('gasAll').checked ? `all ${bags.length} bag${bags.length === 1 ? '' : 's'}` : bi < 0 ? 'no bag yet' : `${bags.length > 1 ? 'bag ' + (bi + 1) : 'the bag'} (${config.GASES[gasKey(bags[bi])].name.toLowerCase()})`;
  for (const key of GAS_KEYS) $('gas_' + key).classList.toggle('on', bi >= 0 && gasKey(bags[bi]) === key);
}
$('reset').onclick = () => { fitFirst = true; note('', false); edit(BUILDS.classic.map((p) => ({ ...p }))); };
$('clear').onclick = () => { note('Cleared: an empty sheet. Draw your first deck with the pencil, then the gasbag; the live pane lists what she still needs. Undo brings the old ship back.', false); edit(emptyBuild()); };
$('minimal').onclick = () => { fitFirst = true; note('A small ship built from nothing with the same tools (decks, bag, parts). Undo goes back.', false); edit(minimalBuild()); };
// The ship generator (shipGen.js): a valid random ship, any theme or the one picked, drawn onto the blueprint (the editing tools work on it; Undo brings the old ship back).
{
  const sel = $('rtheme');
  for (const [id, label] of [['', 'any kind of ship'], ...THEMES.map((t) => [t, THEME_LABEL[t]])]) { const o = document.createElement('option'); o.value = id; o.textContent = label; sel.appendChild(o); }
  for (const c of CHAMPIONS) { const o = document.createElement('option'); o.value = 'hof:' + c.id; o.textContent = `Hall of Fame: ${c.name}`; sel.appendChild(o); } // (the forge's champions, to look at and change)
  let randomSeed = Math.floor(Math.random() * 1e6);
  $('random').onclick = () => {
    const champ = CHAMPIONS.find((c) => 'hof:' + c.id === sel.value);
    if (champ) { note(`${champ.name} (Hall of Fame, Elo ${champ.elo}): ${champ.summary}. Undo goes back; the tools change her.`, false); fitFirst = true; edit(champ.parts.map((p) => ({ ...p }))); return; }
    const ship = generateShip(++randomSeed, { theme: sel.value || undefined });
    if (!ship) { note('The generator could not make that kind of ship this time: press the button again.', false); return; }
    note(`${ship.name}: ${ship.summary}. Weight ${ship.mass}, lift ${ship.lift}, hover at gas ${ship.hover}, ${ship.warns} warning${ship.warns === 1 ? '' : 's'}. Undo goes back; the tools change her.`, false);
    fitFirst = true;
    edit(ship.parts);
  };
}
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
  let stats, errors = 0, firstError = '', botLayout;
  const t0 = realNow();
  try {
    config.MAPS.FORCE_KIND = 'network';
    config.ENVIRONMENTS.FORCE = envId;
    performance.now = () => clock;
    const s = createSimulation();
    botLayout = mainShip(s.state).layout;
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
  for (const c of judgeBotRuns([stats], botLayout, { strict: false })) {
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

// ---- the Live pane in 3D (WP13: view3d/buildPane.js, buildStage.js) ------------------------------------------------------
// The "3D" button (remembered in localStorage) mounts the real 3D view on a canvas of its own over the live pane: it draws the ship the page is flying, with orbit (drag, wheel, double-click for the side
// view), a day / dusk / night choice, the balance markers and a ghost of the part being dragged. It is loaded only when switched on and thrown away (WebGL context released) when switched off.
// The simulation, the gauges and the blueprint are untouched; only what draws the live pane changes. Any failure (no WebGL, a throw) puts the page back on the 2D pane.
const params3d = new URLSearchParams(location.search);
const pref3d = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } };
const setPref3d = (k, v) => { try { localStorage.setItem(k, String(v)); } catch { /* (not remembered) */ } };
let want3d = (params3d.get('b3d') != null ? params3d.get('b3d') : pref3d('airshipBuild3d', '0')) === '1';
let pane = null, paneLoading = false, bpGhost = null, paneNoteFor = null;
const paneBox = $('pane3d');
$('v3dTod').value = config.BUILD3D.TIMES.includes(params3d.get('tod')) ? params3d.get('tod') : config.BUILD3D.TIMES.includes(pref3d('airshipBuild3dTod', '')) ? pref3d('airshipBuild3dTod', '') : config.BUILD3D.TOD_DEFAULT;
$('v3dMarks').checked = pref3d('airshipBuild3dMarks', '1') === '1';
$('v3dGhost').checked = pref3d('airshipBuild3dGhost', '1') === '1';
function sync3d() { // the balance markers of the ship that is flying (the same numbers as the blueprint's markers and the BALANCE gauge)
  if (!pane || !flown || !sim) return;
  try {
    const Ly = mainShip(sim.state).layout;
    pane.setMarkers({ balance: balanceGauge(flown), engines: Ly.engines.map((e) => ({ x: e.x, y: (Ly.platforms[e.d] ? Ly.platforms[e.d].y : 0) + 14, dir: e.dir || 0 })) });
  } catch (e) { console.warn('3D markers', e); }
}
function unmount3d() {
  if (pane) { try { pane.dispose(); } catch (e) { console.warn('3D dispose', e); } pane = null; }
  document.body.classList.remove('b3d');
  paneBox.style.display = 'none';
  paneRect = '';
  paneNoteFor = null;
}
function set3d(on) {
  want3d = !!on;
  setPref3d('airshipBuild3d', want3d ? '1' : '0');
  $('v3d').className = want3d ? 'on' : '';
  document.body.classList.toggle('want3d', want3d);
  if (!want3d) unmount3d();
  else if (flown) startLive(); // (restart under an open sky: the 3D pane orbits her, see startLive)
}
async function mount3d() { // (called by the frame loop once there is a flying ship)
  if (pane || paneLoading || !sim || !want3d) return;
  paneLoading = true;
  paneBox.style.display = 'block';
  place3d();
  try {
    const mod = await import('../view3d/buildPane.js');
    if (!want3d || !sim) return;
    pane = mod.createBuildPane({ container: paneBox, state: sim.state, pixelScale: () => ui.scale, tod: $('v3dTod').value });
    pane.showMarkers($('v3dMarks').checked);
    pane.showGhost($('v3dGhost').checked);
    document.body.classList.add('b3d');
    sync3d();
  } catch (e) {
    console.warn('3D pane off:', e);
    note('3D is not available here (' + String(e && e.message ? e.message : e).slice(0, 90) + '): the live pane stays 2D.', true);
    $('hint').textContent = '3D is not available on this computer or browser: the live pane stays 2D.';
    unmount3d();
    want3d = false;
    $('v3d').className = '';
    document.body.classList.remove('want3d');
    setPref3d('airshipBuild3d', '0');
  } finally { paneLoading = false; }
}
let paneRect = '';
function place3d() { // the 3D canvas lies exactly over the live canvas (which keeps its place in the page layout and is hidden while the 3D is up)
  const w = scene.offsetWidth, h = scene.offsetHeight;
  if (w < 8 || h < 8) { if (paneRect !== 'off') { paneRect = 'off'; paneBox.style.display = 'none'; } return false; }
  const key = `${scene.offsetLeft},${scene.offsetTop},${w},${h}`;
  if (key !== paneRect) { paneRect = key; Object.assign(paneBox.style, { display: 'block', left: scene.offsetLeft + 'px', top: scene.offsetTop + 'px', width: w + 'px', height: h + 'px' }); }
  return true;
}
// What the dragged part would do, for the pane's ghost (null = nothing to show). `make` runs once, when the spot has been held a moment (the stage debounces).
function ghostSpec3d() {
  if (!editing) return null;
  if (tray.id && tray.moved) {
    const id = tray.id, dir = isEngineTile(id) ? engDir : undefined;
    const slot = tray.target;
    if (slot) return { key: `t|${id}|${slot.label}|${dir == null ? '' : dir.toFixed(2)}`, make: () => ({ parts: slot.apply(parts, { dir }), ok: slot.valid !== undefined ? slot.valid : slot.check().ok }) };
    if (tray.ptr && tray.slots.length) { // a drop that snaps nowhere: a red ghost of the part at the pointer (made at the nearest legal spot, then slid across)
      let best = null, bd = Infinity;
      for (const s of tray.slots) { const d = Math.abs(s.x - tray.ptr.x); if (d < bd) { bd = d; best = s; } }
      return { key: `x|${id}|${best.label}|${dir == null ? '' : dir.toFixed(2)}`, bad: true, offset: { x: tray.ptr.x - best.x, y: tray.ptr.y - (best.hy != null ? best.hy : best.y - 14) }, make: () => ({ parts: best.apply(parts, { dir }), ok: false }) };
    }
    return null;
  }
  const g = bpGhost;
  if (drag && g && g.ok && g.parts && ['draw', 'bag', 'armour', 'ladder'].includes(g.tool)) {
    const parts2 = g.parts;
    return { key: `s|${g.tool}|${g.row}|${g.row1 || ''}|${Math.round(g.x0)}|${Math.round(g.x1)}`, make: () => ({ parts: parts2, ok: true }) };
  }
  return null;
}
$('v3d').className = want3d ? 'on' : '';
document.body.classList.toggle('want3d', want3d);
$('v3d').onclick = () => set3d(!want3d);
$('v3dTod').onchange = () => { setPref3d('airshipBuild3dTod', $('v3dTod').value); if (pane) pane.setTod($('v3dTod').value); };
$('v3dReset').onclick = () => { if (pane) pane.resetView(); };
$('v3dMarks').onchange = () => { setPref3d('airshipBuild3dMarks', $('v3dMarks').checked ? '1' : '0'); if (pane) pane.showMarkers($('v3dMarks').checked); };
$('v3dGhost').onchange = () => { setPref3d('airshipBuild3dGhost', $('v3dGhost').checked ? '1' : '0'); if (pane) pane.showGhost($('v3dGhost').checked); };

// ---- the big view and playtest (buildPlay.js, buildView.js): their own block ----------------------------------------------
attachPanZoom(bp, view, { paperPoint, cancelStroke: () => { drag = null; aim = null; }, blockWheel: () => !!(tray.id && tray.moved && isEngineTile(tray.id)) });
bui = initBuildUi({ view, bp, scene, parts: () => parts, result: () => result, layout: () => bpLayout, want3d: () => want3d, note, onUi: () => { fitCanvas(scene); fitCanvas(bp); drawTray(); drawGauges(); },
  load: (next, text) => { edit(next); note(text, false); fitFirst = true; }, // (a loaded ship is framed)
  setEditing: (on) => { editing = on; $('oEdit').checked = on; $('centre').classList.toggle('editing', on); } });
if (restored) note(restored, false);

// ---- go ------------------------------------------------------------------------------------------------------------------
refresh(); // (a ?build= that cannot fly: nothing flies until it can, the live pane says what is missing)
window.buildTest = { view, bui, ui, get bv() { return bv; }, get pane() { return pane; }, set3d, ghostSpec3d, want3d: () => want3d, get bpLayout() { return bpLayout; }, get parts() { return parts; }, get result() { return result; }, get sim() { return sim; }, get live() { return live; }, edit, pick, slotsFor, info: () => info, runBotTest, startLive, flag, validate: () => result,
  tool: () => tool, setTool, setKind, kind: () => kind, addArmour, applyEdit, setEngineDir, setEngineSwivel, engDir: () => engDir, selEngine: () => selEngine, aim: () => aim, drawDeck, drawBag, resizeBag, erase, setBag, setGas, selBag: () => selBag, placeConnector, placePart, removeAt, thingAt, emptyBuild, minimalBuild, tray: () => tray, bpScreen: (x, y) => { const r = bp.getBoundingClientRect(); return bv ? { x: r.left + (bv.X(x) * r.width) / bp.width, y: r.top + (bv.Y(y) * r.height) / bp.height } : null; }, // (bpScreen: ship coordinates to page pixels on the blueprint, for tests)
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
    if (bui) bui.update();
    if (sim) {
      acc += dt;
      let n = 0;
      while (acc >= config.LOOP.STEP && n++ < config.LOOP.MAX_STEPS) {
        sim.update(config.LOOP.STEP);
        acc -= config.LOOP.STEP;
      }
      if (acc >= config.LOOP.STEP) acc = 0;
      if (want3d && !pane && scene.offsetWidth > 8) mount3d(); // (async: the 2D pane keeps drawing until the 3D one is up; nothing is loaded while the Blueprint view hides the live pane)
      if (pane) { // WP13: the live pane in 3D (the 2D canvas is hidden; the camera is the same follow camera)
        if (place3d()) {
          if (result !== paneNoteFor) { paneNoteFor = result; pane.setNote(result && !result.ok ? 'CANNOT FLY yet - needs: ' + (result.needs.length ? result.needs.slice(0, 4).join(', ') : result.fails[0]) + '   (flying the last ship that could)' : ''); }
          pane.request(config.BUILD3D && $('v3dGhost').checked ? ghostSpec3d() : null);
          pane.frame(now, dt, sim.state);
        }
      } else {
        const cam = scene.width > 8 ? camera.update(dt, sim.state, scene.width, scene.height) : null; // (the live pane may be hidden: the ship flies on, nothing is drawn)
        if (cam) {
          cam.shipOverlay = overlay;
          renderer.renderFrame(now, cam);
        }
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
