// Playtest and My Ships: the plumbing between the build page (buildtest.html) and the real host game (host.html).
//   * The build page saves the ship being built under a storage key and opens host.html?playtest=coop (or =versus&foe=<shelf id>), &bots=N, so a long build never meets a URL limit.
//     host.html?build=[parts JSON] still works too (the old dev flag); with both, the URL wins. readPlaytestJob reads either.
//   * The host flies THAT ship: co-op sets it as the voyage's start build ('playtest'); Versus puts it on the shelf as "mine" and picks it for red (armVersus), against the chosen shelf ship.
//   * "Back to the builder" on the host's pause menu opens buildtest.html?from=playtest, which loads the same parts again.
//   * My Ships: named designs kept in this computer's storage (save, rename, delete, load), and the working build (autosaved, so a refresh does not lose it).
// Storage is localStorage with sessionStorage and then a plain object as fall-backs (private windows, headless tools). No DOM here.
import { config } from '../../config.js';
import { budgets } from './shipBuild.js';
import { liftGauge } from './buildCheck.js';

const KEY_JOB = 'airshipPlaytest', KEY_DESIGNS = 'airshipDesigns', KEY_WORK = 'airshipWorking';
const P = () => config.PLAYTEST;
const mem = {};
const store = {
  get(k) {
    try { const v = localStorage.getItem(k); if (v != null) return v; } catch { /* (no localStorage) */ }
    try { const v = sessionStorage.getItem(k); if (v != null) return v; } catch { /* (no sessionStorage) */ }
    return k in mem ? mem[k] : null;
  },
  set(k, v) {
    mem[k] = v;
    let ok = false;
    try { localStorage.setItem(k, v); ok = true; } catch { /* (full or blocked) */ }
    try { sessionStorage.setItem(k, v); ok = true; } catch { /* (blocked) */ }
    return ok;
  },
};
const readJson = (k, dflt) => { try { const v = JSON.parse(store.get(k)); return v == null ? dflt : v; } catch { return dflt; } };
export const isParts = (p) => Array.isArray(p) && p.length > 0 && p.every((q) => q && typeof q === 'object' && typeof q.part === 'string');
const clone = (parts) => JSON.parse(JSON.stringify(parts));

// ---- the working build (autosaved by the build page) and the playtest hand-over ----------------------------------------------
export function saveWorking(parts) { store.set(KEY_WORK, JSON.stringify(parts)); }
export function loadWorking() { const p = readJson(KEY_WORK, null); return isParts(p) ? p : null; }
export function savePlaytestJob(job) { store.set(KEY_JOB, JSON.stringify({ parts: job.parts, name: job.name || '' })); }
export function loadPlaytestJob() { const j = readJson(KEY_JOB, null); return j && isParts(j.parts) ? { parts: j.parts, name: String(j.name || '') } : null; }

// The URL of the host page for a job { parts, name, mode: 'coop' | 'versus', foe, bots }. The parts travel in storage; if storage did not keep them, they go in the URL (?build=).
export function playtestUrl(job) {
  savePlaytestJob(job);
  const q = new URLSearchParams();
  q.set('playtest', job.mode === 'versus' ? 'versus' : 'coop');
  if (job.mode === 'versus') q.set('foe', job.foe || P().FOE_DEFAULT);
  if (job.bots > 0) q.set('bots', String(job.bots));
  const back = loadPlaytestJob();
  if (!back || JSON.stringify(back.parts) !== JSON.stringify(job.parts)) q.set('build', JSON.stringify(job.parts));
  return 'host.html?' + q.toString();
}
// What the host was asked to play: { parts, name, mode, foe, bots } or null. ?build=[JSON] (not 'classic') or ?playtest=coop|versus|1 (parts from storage).
export function readPlaytestJob(search) {
  const q = new URLSearchParams(search);
  const asked = q.get('build'), pt = q.get('playtest');
  let parts = null, name = '';
  try { if (asked && asked !== 'classic' && asked.trim().startsWith('[')) parts = JSON.parse(asked); } catch (e) { console.warn('bad ?build=', e); }
  if (!isParts(parts)) parts = null;
  if (!parts && pt) { const j = loadPlaytestJob(); if (j) { parts = j.parts; name = j.name; } }
  if (!parts) return null;
  const mode = pt === 'versus' ? 'versus' : 'coop';
  if (asked && !pt) savePlaytestJob({ parts, name }); // (a plain ?build=: remember it so "Back to the builder" can bring it back)
  return { parts, name, mode, foe: q.get('foe') || P().FOE_DEFAULT, bots: Math.max(0, Math.min(8, Math.round(Number(q.get('bots')) || 0))) };
}

// ---- My Ships: named designs ------------------------------------------------------------------------------------------------
const cleanName = (n) => String(n || '').replace(/\s+/g, ' ').trim().slice(0, P().NAME_MAX);
const readDesigns = () => { const d = readJson(KEY_DESIGNS, []); return Array.isArray(d) ? d.filter((e) => e && e.id && isParts(e.parts)) : []; };
const writeDesigns = (list) => store.set(KEY_DESIGNS, JSON.stringify(list));
export const listDesigns = () => readDesigns().sort((a, b) => b.t - a.t);
export const getDesign = (id) => readDesigns().find((e) => e.id === id) || null;
const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();
// Save under a name: an existing design with that name is replaced, otherwise a new one is added.
export function saveDesign(name, parts) {
  const nm = cleanName(name);
  if (!nm) return { ok: false, hint: 'Give the ship a name first.' };
  if (!isParts(parts)) return { ok: false, hint: 'There is nothing to save.' };
  const list = readDesigns();
  const old = list.find((e) => sameName(e.name, nm));
  if (!old && list.length >= P().DESIGNS_MAX) return { ok: false, hint: `My Ships is full (${P().DESIGNS_MAX}): delete one first.` };
  const e = old || { id: 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: nm };
  e.name = nm;
  e.parts = clone(parts);
  e.t = Date.now();
  writeDesigns(old ? list : [...list, e]);
  return { ok: true, design: e, replaced: !!old, hint: (old ? 'Replaced "' : 'Saved "') + nm + '" in My Ships.' };
}
export function renameDesign(id, name) {
  const nm = cleanName(name), list = readDesigns(), e = list.find((q) => q.id === id);
  if (!e) return { ok: false, hint: 'No such design.' };
  if (!nm) return { ok: false, hint: 'A ship needs a name.' };
  if (list.some((q) => q.id !== id && sameName(q.name, nm))) return { ok: false, hint: 'Another ship is already called "' + nm + '".' };
  e.name = nm;
  writeDesigns(list);
  return { ok: true, design: e, hint: 'Renamed to "' + nm + '".' };
}
export function deleteDesign(id) {
  const list = readDesigns(), e = list.find((q) => q.id === id);
  if (!e) return { ok: false, hint: 'No such design.' };
  writeDesigns(list.filter((q) => q.id !== id));
  return { ok: true, hint: 'Deleted "' + e.name + '".' };
}

// ---- Versus: the playtest ship on the shelf, picked for red -----------------------------------------------------------------
// A shelf entry (shelf.js shape) for any parts list. The validator has judged it on the build page; it may be over the tonnage cap (a playtest does not care).
export function customEntry(parts, name) {
  const b = budgets(parts), lift = liftGauge(parts);
  return { id: P().SHIP_ID, name: cleanName(name) || 'My Ship', blurb: 'The ship from the build page', parts, mass: Math.round(b.mass), lift: Math.round(lift.lift), hover: lift.hover, hands: Math.round(b.hands), warns: 0 };
}
// Put the job's ship on the shelf (the cached shelf array itself, so the match and its "New ships" vote both see it) and make red fly it against the shelf ship job.foe.
// With bots the match starts at once, with each side's bots; without, the lobby opens (phones join, CAST OFF) and CAST OFF starts the match with these picks, no vote.
export function armVersus(simulation, job, buildShelf) {
  const M = simulation.match, shelf = buildShelf();
  const mine = customEntry(job.parts, job.name), at = shelf.findIndex((e) => e.id === mine.id);
  if (at >= 0) shelf[at] = mine; else shelf.push(mine);
  const picks = { red: shelf.findIndex((e) => e.id === mine.id), blue: Math.max(0, shelf.findIndex((e) => e.id === job.foe)) };
  simulation.setSession('versus');
  const start = (o = {}) => { M.shelf = shelf; M.applyPicks(picks); return M.begin({ ...o, shelf: false }); };
  if (job.bots > 0) {
    M.addBots('red', job.bots);
    M.addBots('blue', job.bots);
    return start();
  }
  const begin = M.begin;
  M.begin = (o = {}) => { // (CAST OFF in the lobby)
    M.shelf = shelf;
    M.applyPicks(picks);
    return begin({ ...o, shelf: false });
  };
  return true;
}
