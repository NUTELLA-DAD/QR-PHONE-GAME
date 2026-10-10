// Quality tiers for the 3D view (3D.md sections 1 and 6) and the look kill-switches.
//
//   High:   bloom + colour grade + finish + SMAA, sun shadows 4096, up to 6 real lantern lights a ship, the lamp's own shadow.
//   Medium: bloom + colour grade + finish + FXAA, sun shadows 2048, 2 lantern lights a ship.
//   Low:    the colour grade only (no bloom, no finish, no anti-aliasing), no shadows, no lantern lights (the lamps still glow as plain bright colour), pixel ratio 0.75.
//
// The tier comes from (in this order): ?tier=high|medium|low in the address, the settings' `tier` (a name or a function, the host maps the perf governor's level to it, tierFromLevel),
// then the old Detail setting (high -> high, low -> low). The kill-switches live in style.js `look` (bloom, lut, grain, fog, rim, lanterns, shadows, post);
// the address sets them with ?look=nobloom,nofog,noshadows (a comma list of "no<switch>" / "<switch>"; "nopost" = no composer at all, the old direct draw with tone mapping).
import { look } from './style.js';

export const TIERS = {
  high: { name: 'high', bloom: true, finish: true, aa: 'smaa', shadows: true, shadowSize: 4096, lanterns: 6, spotShadow: true, pixelRatioMax: 2 },
  medium: { name: 'medium', bloom: true, finish: true, aa: 'fxaa', shadows: true, shadowSize: 2048, lanterns: 2, spotShadow: false, pixelRatioMax: 1.5 },
  low: { name: 'low', bloom: false, finish: false, aa: null, shadows: false, shadowSize: 1024, lanterns: 0, spotShadow: false, pixelRatioMax: 0.75 },
};
export const TIER_NAMES = ['high', 'medium', 'low'];

// perf.js levels: 0 low, 1 medium, 2 good, 3 high.
export const tierFromLevel = (level) => (level >= 3 ? 'high' : level >= 1 ? 'medium' : 'low');

// The address: ?look=nobloom,nofog  and  ?tier=medium. Returns { tier, flags } and applies the flags to `look`.
const SWITCHES = ['bloom', 'lut', 'grain', 'fog', 'rim', 'lanterns', 'shadows', 'post', 'outlines', 'dark', 'clouds', 'water', 'vfx', 'glows', 'beam', 'lightning', 'fungal'];
export function readAddress(search) {
  const out = { tier: '', flags: {} };
  try {
    const q = new URLSearchParams(search || '');
    const t = (q.get('tier') || '').toLowerCase();
    if (TIERS[t]) out.tier = t;
    for (const tok of (q.get('look') || '').toLowerCase().split(/[,\s]+/)) {
      if (!tok) continue;
      const on = !tok.startsWith('no');
      const name = on ? tok : tok.slice(2);
      if (SWITCHES.includes(name)) out.flags[name] = on;
    }
  } catch { /* (no address: defaults) */ }
  Object.assign(look, out.flags);
  return out;
}

// Which tier is wanted right now. S = the settings object of createView3D.
export function resolveTier(S, addressTier) {
  let name = addressTier || (typeof S.tier === 'function' ? S.tier() : S.tier);
  if (!TIERS[name]) name = (S.detail || 'high') === 'high' ? 'high' : 'low';
  return TIERS[name];
}
