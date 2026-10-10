// WP14: AUTO-DETECT for the 3D view (3D.md sections 5 and 6). No imports, so the host can ask BEFORE it loads Three.js.
//
//   probeGpu()    makes a throwaway WebGL2 context and reads what the graphics card says it is (WEBGL_debug_renderer_info) and what it can do.
//   classifyGpu() the rules (pure, so the check tool can test them):
//        no WebGL2, a software renderer (SwiftShader, llvmpipe, a virtual machine's card, "Basic Render") or too small / no half-float targets -> '2d'
//        a discrete card (NVIDIA GeForce / RTX / GTX, AMD Radeon RX / Pro, Intel Arc A / B, Apple M)                                             -> 'high'
//        integrated (Intel UHD / Iris / HD, AMD Vega / "Radeon(TM) Graphics" / 680M, phone chips) and anything we do not recognise              -> 'medium'
//   autoDetect()  the answer the host uses when nobody chose a view: { view: '3d' | '2d', tier, level (perf.js level to start at), ceiling (the highest level the governor may climb to), gpu, reason }.
//
// The perf governor (host/perf.js) then steps down High -> Medium -> Low -> 2D when frames are slow and back up when there is room (never above `ceiling`), and what it
// settled on is remembered per graphics card in localStorage.airshipProbe so the next start does not repeat the slow minutes. The player's own Detail / View choices stay in
// localStorage.airshipDetail / airshipView and always win. ?gpu=<text> in the address fakes the card's name (for tests), ?gpu=none fakes "no WebGL".
export const PROBE_KEY = 'airshipProbe';

const SOFTWARE = /swiftshader|llvmpipe|softpipe|lavapipe|software|basic render|mesa offscreen|vmware|svga3d|virtualbox|virgl|parallels|microsoft basic|\bwarp\b|gdi generic/i;
const AMD_INTEGRATED = /vega|radeon\W*(tm\W*)?graphics|radeon\W*(tm\W*)?\d{3}m\b|radeon\W*(r[2-5])\b|radeon\W*hd\W*[2-6]\d{3}\b/i;
const DISCRETE = /nvidia|geforce|\brtx\b|\bgtx\b|quadro|titan|tesla|radeon\W*(rx|pro|vii|r9|r7)\b|intel\W*(r\W*)?arc\W*(tm\W*)?\W*[a-z]\d{3}|apple\W*m\d/i;
const LOW_DISCRETE = /geforce\W*(gt|mx)\W*\d|geforce\W*(gtx\W*)?(9[0-4]0m|8[0-9]0m)|\bmx\d{2,3}\b|quadro\W*(k|nvs)/i;
const INTEGRATED = /intel|uhd|iris|hd graphics|mali|adreno|powervr|videocore|apple\W*gpu|qualcomm|tegra/i;

// A name (and the little numbers the card reports) -> { tier: 'high' | 'medium' | '2d', reason }.
export function classifyGpu(name, caps = {}) {
  const n = String(name || '');
  if (caps.webgl2 === false) return { tier: '2d', reason: 'no WebGL 2' };
  if (SOFTWARE.test(n)) return { tier: '2d', reason: 'software renderer' };
  if (caps.maxTexture && caps.maxTexture < 2048) return { tier: '2d', reason: 'tiny textures (' + caps.maxTexture + ')' };
  if (caps.floatTargets === false) return { tier: '2d', reason: 'no half-float render targets' };
  let tier = 'medium', reason = 'integrated or unknown GPU';
  if (AMD_INTEGRATED.test(n)) { tier = 'medium'; reason = 'integrated AMD GPU'; }
  else if (LOW_DISCRETE.test(n)) { tier = 'medium'; reason = 'entry-level discrete GPU'; }
  else if (DISCRETE.test(n)) { tier = 'high'; reason = 'discrete GPU'; }
  else if (INTEGRATED.test(n)) { tier = 'medium'; reason = /intel/i.test(n) ? 'integrated Intel GPU' : 'integrated / mobile GPU'; }
  else if (!n) reason = 'GPU name hidden';
  if (tier === 'high' && caps.maxTexture && caps.maxTexture < 4096) { tier = 'medium'; reason += ', small texture limit'; }
  return { tier, reason };
}

// Ask the graphics card. Never throws. { webgl2, gpu (its name), maxTexture, floatTargets }.
export function probeGpu(search = '') {
  const out = { webgl2: false, gpu: '', maxTexture: 0, floatTargets: true };
  try {
    const fake = new URLSearchParams(search || '').get('gpu');
    if (fake === 'none') return out;
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return out;
    out.webgl2 = true;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    out.gpu = String((dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) || '');
    out.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0;
    out.floatTargets = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    if (fake) out.gpu = fake;
  } catch { /* (a broken graphics stack: the caller sees webgl2 false) */ }
  return out;
}

const readMemory = () => { try { return JSON.parse(localStorage.getItem(PROBE_KEY) || 'null') || {}; } catch { return {}; } };
const writeMemory = (m) => { try { localStorage.setItem(PROBE_KEY, JSON.stringify(m)); } catch { /* (not remembered) */ } };
// (what this card settled on or gave up on; main.js calls it as the governor moves: { level }, { gaveUp: true })
export function rememberProbe(patch) { writeMemory({ ...readMemory(), ...patch }); }

// perf.js levels: 3 high, 1 medium, 0 low (2 'good' is the 2D-only Sharp step).
const LEVEL = { high: 3, medium: 1, '2d': 3 };
export function autoDetect(search = '') {
  const p = probeGpu(search);
  const c = classifyGpu(p.gpu, p);
  const mem = readMemory();
  const same = !!mem.gpu && mem.gpu === p.gpu;
  const r = { view: c.tier === '2d' ? '2d' : '3d', tier: c.tier, level: LEVEL[c.tier], ceiling: c.tier === 'medium' ? 1 : 3, gpu: p.gpu, reason: c.reason, probe: p, remembered: false };
  if (same && mem.gaveUp && r.view === '3d') { // this card was too slow for 3D last time: start in 2D (the pause menu's View button tries again and wins from then on)
    r.view = '2d'; r.tier = '2d'; r.reason = 'too slow for 3D last time (' + c.reason + ')'; r.remembered = true;
  } else if (same && Number.isFinite(mem.level) && r.view === '3d') {
    r.level = Math.max(0, Math.min(r.level, mem.level)); r.remembered = true;
  }
  r.text = (p.webgl2 ? (p.gpu || 'unknown GPU') : 'no WebGL') + ' -> ' + r.tier + ' (' + r.reason + ')';
  if (!same) writeMemory({ gpu: p.gpu, tier: c.tier }); // (a new card: forget what the old one settled on)
  return r;
}
