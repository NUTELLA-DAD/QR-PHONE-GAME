// Build test page (Phase S.5): put parts on the ship, watch the validator and the three gauges (LIFT / STEAM / HANDS), fly her with 4 bots.
//   left   the part palette (click a part, then a brass pin on the ship) and the list of placed parts (x removes one)
//   centre the BLUEPRINT (ink on cream paper): the pencil draws decks along the deck rows, the eraser rubs them out, "Bag -/+" and "Twin bag" change the
//          gasbag, and part pins show here too; below it the live ship with bots; toggles draw the nav graph (travel-time heat from the boiler), the collision samples, the slots, a blue overlay
//   bottom the gauges and the validator report; "Run 60 s bot test" flies a fast copy and reports; "Copy build JSON" for ?build= and tools/buildsim.mjs
// Same skeleton as styleTest.js. Load a build with ?build=classic | multi | [JSON parts list].
import { config } from '../../config.js';
import { SHIP_LAYOUT, applyBuild } from '../../shipLayout.js';
import { BUILDS, DECK_ROWS, rowOf } from './shipBuild.js';
import { validate, makePlanner, judgeBotRuns } from './buildCheck.js';
import { PALETTE, slotsFor, drawDeck, erase, setBag, snapX, rowAtY, summarize } from './buildSlots.js';
import { blueprintView, drawBlueprint } from './blueprintArt.js';
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
let tool = 'draw'; // 'draw' (pencil) | 'erase' | 'place' (part pins)
let editing = true; // the blueprint panel is shown
let bpLayout = null; // the layout of the build being edited (it can differ from the live ship when the edit cannot fly)
let bv = null; // the blueprint's paper-to-ship transform, set each frame
let drag = null; // a stroke in progress: { tool, row, a (where it started), b (where it is now) }
let bpHover = null; // { row, cursor } while the pointer is over the paper without a stroke

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
const toolButtons = () => { for (const [id, name] of [['tDraw', 'draw'], ['tErase', 'erase'], ['tPlace', 'place']]) $(id).className = tool === name ? 'on' : ''; };
function setTool(t) {
  tool = t;
  if (t !== 'place') picked = null;
  toolButtons();
  drag = null;
  showPicked();
  if (t !== 'place') $('hint').textContent = t === 'draw' ? 'Pencil: drag along a deck row on the blueprint. Along a deck it gets longer; on an empty stretch it makes a new deck with a ladder.' : 'Eraser: drag along a deck. What stood on that stretch goes with it (listed below the blueprint); Undo brings it back.';
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
  if (!result.ok) $('hint').textContent = 'This build cannot fly (see the report): the ship shown is the last one that could. Undo or remove/add parts to fix it.';
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
  const BC = config.BUILD_CHECK;
  const gap = 8, cw = (w - gap * 2) / 3;
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
    sub.forEach((t, k) => g.fillText(t, x + 12, 67 + k * 12));
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
  card(2, 'HANDS', `${b.hands.perPlayer} each`, [`${b.hands.stations} manned stations`, `at ${b.hands.crew} crew; ${b.hands.at4} at 4, ${b.hands.at6} at 6`, `warn over ${BC.HANDS_PER_PLAYER}`], 5,
    [[0, 1.5, amber], [1.5, BC.HANDS_PER_PLAYER, green], [BC.HANDS_PER_PLAYER, 5, red]], [[b.hands.perPlayer, String(b.hands.perPlayer)]], b.hands.level);
}
setInterval(() => {
  if (!sim) return;
  const sh = sim.state.ship;
  const bits = [`Live: gas ${Math.round(sh.gas)}, steam ${Math.round(sh.press)}, hull ${Math.round(sh.hull)}, alt ${Math.round(sh.alt)}`];
  if (result && result.budgets.lift) bits.push(`(the gauges predict hover ${result.budgets.lift.hover}, cruise steam ${result.budgets.steam.cruise}; the game itself does not yet weigh parts: S.6)`);
  $('live').textContent = bits.join(' ');
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
    const g2 = Ly.gasbag;
    if (g2) { g.beginPath(); g.ellipse(g2.cx, g2.cy, g2.rx, g2.ry, 0, 0, 6.2832); g.stroke(); }
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
// Which row a stroke at this height means: the pencil snaps to the nearest drawable row; the eraser to the nearest deck under the pointer.
function rowFor(w) {
  if (tool === 'draw') return rowAtY(w.y);
  const near = bpLayout.platforms.filter((q) => w.x > q.x0 - 40 && w.x < q.x1 + 40 && Math.abs(q.y - w.y) < 45).sort((a, b) => Math.abs(a.y - w.y) - Math.abs(b.y - w.y))[0];
  return near ? { row: rowOf(near) } : { why: 'No deck there: drag the eraser along a deck.' };
}
const strokeOf = (d) => [Math.min(d.a, d.b), Math.max(d.a, d.b)];
// What the stroke would do (a ghost for the paper and a note): { tool, row, x0, x1, ok, label }.
function ghostOf(d) {
  const [x0, x1] = strokeOf(d);
  const g = { tool: d.tool, row: d.row, x0, x1, ok: false, label: '' };
  if (x1 - x0 < 20) { g.label = d.tool === 'draw' ? 'drag along the row' : 'drag along the deck'; return g; }
  const r = d.tool === 'draw' ? drawDeck(parts, d.row, x0, x1) : erase(parts, d.row, x0, x1);
  g.ok = r.ok;
  if (!r.ok) g.label = r.hint;
  else if (d.tool === 'draw') g.label = (r.kind === 'new' ? 'new ' + r.deck + ' (with a ladder)' : r.deck + ' +' + r.grew + ' column' + (r.grew === 1 ? '' : 's')) + '   ' + r.cols + ' col = ' + Math.round(x1 - x0) + ' px';
  else g.label = 'erase ' + r.cols + ' column' + (r.cols === 1 ? '' : 's') + (r.removed.length ? ' - removes ' + summarize(r.removed) : '');
  return g;
}
bp.addEventListener('pointerdown', (e) => {
  const w = bpPoint(e);
  if (!w || tool === 'place') return;
  e.preventDefault();
  const r = rowFor(w);
  if (!r.row) { note(r.why, true); return; }
  bp.setPointerCapture(e.pointerId);
  const x = snapX(parts, w.x);
  drag = { tool, row: r.row, a: x, b: x };
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
    if (hover) $('hint').textContent = hover.label + (hover.warns.length ? '  (warning: ' + hover.warns[0] + ')' : '');
    return;
  }
  if (drag) { drag.b = snapX(parts, w.x); return; }
  const r = rowFor(w);
  bpHover = r.row ? { row: r.row, cursor: { x: snapX(parts, w.x), y: DECK_ROWS[r.row] } } : { why: r.why, cursor: null };
});
bp.addEventListener('pointerup', (e) => {
  if (tool === 'place') { if (hover) { edit(hover.apply(parts)); note('', false); } return; }
  if (!drag) return;
  const d = drag;
  drag = null;
  const [x0, x1] = strokeOf(d);
  if (x1 - x0 < 20) return;
  applyEdit(d.tool === 'draw' ? drawDeck(parts, d.row, x0, x1) : erase(parts, d.row, x0, x1));
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
  const status = result && !result.ok ? { ok: false, text: 'CANNOT FLY: ' + result.fails[0] } : null;
  drawBlueprint(bctx, bv, bpLayout, { rowHover: drag ? drag.row : bpHover && bpHover.row, cursor: !drag && bpHover && bpHover.cursor, ghost, slots: tool === 'place' && picked ? slots : [], hover: tool === 'place' ? hover : null, status });
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
  if (hover) $('hint').textContent = hover.label + (hover.warns.length ? '  (warning: ' + hover.warns[0] + ')' : '');
});
scene.addEventListener('click', () => { if (hover) edit(hover.apply(parts)); });
addEventListener('keydown', (e) => { if (e.key === 'Escape' && picked) pick(picked); });

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
$('tDraw').onclick = () => setTool('draw');
$('tErase').onclick = () => setTool('erase');
$('tPlace').onclick = () => setTool('place');
$('bagShort').onclick = () => applyEdit(setBag(parts, { grow: -1 }));
$('bagLong').onclick = () => applyEdit(setBag(parts, { grow: 1 }));
$('bagTwin').onclick = () => applyEdit(setBag(parts, { twin: 'toggle' }));
$('reset').onclick = () => { note('', false); edit(BUILDS.classic.map((p) => ({ ...p }))); };
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
refresh();
if (!sim) startLive(BUILDS.classic); // (a ?build= that cannot fly: show the classic ship until it is fixed)
window.buildTest = { get parts() { return parts; }, get result() { return result; }, get sim() { return sim; }, get live() { return live; }, edit, pick, slotsFor, info: () => info, runBotTest, startLive, flag, validate: () => result,
  tool: () => tool, setTool, applyEdit, drawDeck, erase, setBag, bpScreen: (x, y) => { const r = bp.getBoundingClientRect(); return bv ? { x: r.left + (bv.X(x) * r.width) / bp.width, y: r.top + (bv.Y(y) * r.height) / bp.height } : null; }, // (bpScreen: ship coordinates to page pixels on the blueprint, for tests)
  screen: (x, y) => { const p = shipMatrix.transformPoint(new DOMPoint(x, y)), r = scene.getBoundingClientRect(); return { x: r.left + (p.x * r.width) / scene.width, y: r.top + (p.y * r.height) / scene.height }; } }; // (screen: ship coordinates to page pixels, for tests)

let last = performance.now();
let acc = 0;
const frame = (now) => {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  try {
    fitCanvas(scene);
    drawBp();
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
  } catch (e) {
    (window.gameErrors = window.gameErrors || []).push('buildtest: ' + e.message);
    if ((window.gameErrors || []).length < 4) console.error(e);
  }
};
requestAnimationFrame(frame);
