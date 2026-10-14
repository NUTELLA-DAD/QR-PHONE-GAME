// THE NEMESIS'S MARKS IN 3D (SHIPS_BOOK.md L4, 3D.md section 38). Her ship wears her colours (registry.js nemesisTheme) and these two painted pieces, like the Flagship's big emblem and name board:
//   * her SEAL (the round badge of the Book: her emblem in her trim colour on her cloth colour, a pip for each level she has grown; host/nemesisArt.js drawBadge, so the TV card and the ship match) painted large on
//     both flanks of her biggest gasbag. A shallow dome that follows the bag's own skin, a child of the bag's node so it swells and sags with the gas. 1 draw call (both flanks).
//   * her NAME PLATE, "THE BLACK HARRIER": a cream board on two chains hung under her keel, one plane facing each side, so either side of her reads from the sofa. 1 draw call.
// Normal gunships never call this. Everything is rigid and painted once (a canvas each); nothing moves on a clock. Fictional heraldry only. Never throws (a failure leaves her without the marks).
//   buildNemesisMarks(ctx, model, { look, name, level }) -> { parts, dispose() }
import { THREE, gradientMap, rimify, INK } from '../style.js';
import { drawBadge } from '../../host/nemesisArt.js';
import { BAG_RZ } from './bag.js';
import { config } from '../../../config.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, Number.isFinite(v) ? v : a));
const CREAM = '#f3e7c4';

// Both pictures are painted in code. The font is the logbook's; if it has not arrived yet the picture is painted again when it does.
function fontReady(cb) { try { if (document.fonts && document.fonts.load) document.fonts.load("700 40px 'Limelight'").then(cb, () => {}); } catch { /* the fallback font stays */ } }
const tex = (cv) => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true; t.needsUpdate = true; return t; };

function paintSeal(cv, look, level) {
  const g = cv.getContext('2d');
  if (!g) return;
  g.clearRect(0, 0, cv.width, cv.height);
  const r = cv.width / 2 - 6;
  g.fillStyle = INK; g.beginPath(); g.arc(cv.width / 2, cv.height / 2, r + 6, 0, Math.PI * 2); g.fill(); // (a thick ink rim: the seal reads from far away)
  drawBadge(g, cv.width / 2, cv.height / 2, r, look, level);
}

function paintPlate(cv, name, look, drop) {
  const g = cv.getContext('2d');
  if (!g) return;
  const W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  const ink = INK, a = (look && look.a) || '#8c2f2f', b = (look && look.b) || '#f2d36b';
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.strokeStyle = ink; g.lineWidth = 9; // two chains from the keel to the board
  for (const x of [W * 0.2, W * 0.8]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, drop + 6); g.stroke(); }
  g.strokeStyle = '#a89a78'; g.lineWidth = 4;
  for (const x of [W * 0.2, W * 0.8]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, drop + 6); g.stroke(); }
  const x0 = 8, y0 = drop, w = W - 16, h = H - drop - 8, r = 26; // the board: cream, an ink border, her cloth colour as an inner frame
  const rr = (x, y, ww, hh, rad) => { g.beginPath(); g.moveTo(x + rad, y); g.arcTo(x + ww, y, x + ww, y + hh, rad); g.arcTo(x + ww, y + hh, x, y + hh, rad); g.arcTo(x, y + hh, x, y, rad); g.arcTo(x, y, x + ww, y, rad); g.closePath(); };
  rr(x0, y0, w, h, r); g.fillStyle = ink; g.fill();
  rr(x0 + 7, y0 + 7, w - 14, h - 14, r - 6); g.fillStyle = CREAM; g.fill();
  rr(x0 + 17, y0 + 17, w - 34, h - 34, r - 12); g.lineWidth = 8; g.strokeStyle = a; g.stroke();
  g.fillStyle = b; for (const x of [x0 + 30, x0 + w - 30]) { g.beginPath(); g.arc(x, y0 + h / 2, 9, 0, Math.PI * 2); g.fill(); g.lineWidth = 3; g.strokeStyle = ink; g.stroke(); } // a rivet at each end
  const text = String(name || '').toUpperCase();
  const F = (config.FONTS && config.FONTS.DISPLAY) || 'serif';
  let px = Math.floor(h * 0.5);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (; px > 20; px -= 2) { g.font = `${px}px ${F}`; if (g.measureText(text).width <= w - 150) break; }
  const cy = y0 + h / 2 + 3;
  g.lineWidth = Math.max(5, px * 0.12); g.strokeStyle = CREAM; g.strokeText(text, W / 2, cy); // (a cream halo, then her cloth colour: dark letters on a pale board)
  g.fillStyle = a; g.fillText(text, W / 2, cy);
}

export function buildNemesisMarks(ctx, model, o = {}) {
  const parts = [];
  const look = o.look || {};
  const bags = model.dyn.bags || [];
  const mats = [], texs = [];
  let seal = null, plate = null;
  // ---- the seal on the biggest gasbag ---------------------------------------------------------------------------------------------------------------------------------------------------------------
  try {
    let best = null;
    bags.forEach((bg, i) => { const G0 = ctx.bags[bg.i != null ? bg.i : i]; if (G0 && (!best || G0.rx * G0.ry > best.G0.rx * best.G0.ry)) best = { bg, G0 }; });
    if (best) {
      const { bg, G0 } = best, rx = G0.rx, ry = G0.ry;
      const prof = (u) => { const p = u < 0 ? 1.75 : 2.0; return ry * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u), p)), 1 / p); };
      const R = clamp(ry * 0.72, 30, 160), cx = rx * 0.12, cy = ry * 0.02, RINGS = 8, SEGS = 32;
      const pos = [], uv = [], idx = [];
      for (const sgn of [1, -1]) {
        const base = pos.length / 3;
        for (let k = 0; k <= RINGS; k++) {
          for (let s = 0; s < (k ? SEGS : 1); s++) {
            const a = (s / SEGS) * Math.PI * 2, d = (k / RINGS) * R, px = Math.cos(a) * d, py = Math.sin(a) * d;
            const x = cx + px, y = cy + py, u = clamp(x / rx, -0.9, 0.9), r = Math.max(8, prof(u));
            const z = r * BAG_RZ * Math.sqrt(Math.max(0.12, 1 - Math.pow(clamp(y / r, -0.95, 0.95), 2))) + 3; // (the bag's own skin, 3 units proud)
            pos.push(x, y, sgn * z);
            uv.push(0.5 + (sgn * px) / (2 * R), 0.5 + py / (2 * R)); // (the far flank is seen from behind: the picture is turned so it reads from there too)
          }
        }
        const ring = (k) => (k === 0 ? [base] : Array.from({ length: SEGS }, (_, s) => base + 1 + (k - 1) * SEGS + s));
        for (let k = 1; k <= RINGS; k++) {
          const inner = ring(k - 1), outer = ring(k);
          for (let s = 0; s < SEGS; s++) {
            const s1 = (s + 1) % SEGS, o0 = outer[s], o1 = outer[s1];
            const i0 = inner.length === 1 ? inner[0] : inner[s], i1 = inner.length === 1 ? inner[0] : inner[s1];
            const flip = sgn > 0;
            if (inner.length === 1) idx.push(...(flip ? [i0, o0, o1] : [i0, o1, o0]));
            else { idx.push(...(flip ? [i0, o0, o1] : [i0, o1, o0])); idx.push(...(flip ? [i0, o1, i1] : [i0, i1, o1])); }
          }
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const cv = document.createElement('canvas'); cv.width = cv.height = 256;
      paintSeal(cv, look, o.level | 0);
      const map = tex(cv);
      const toon = rimify(new THREE.MeshToonMaterial({ map, gradientMap, alphaTest: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      const plain = new THREE.MeshLambertMaterial({ map, alphaTest: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      seal = new THREE.Mesh(geo, toon);
      seal.userData.toon = toon; seal.userData.plain = plain; // (applyLook swaps the pair)
      seal.frustumCulled = false;
      bg.node.add(seal);
      parts.push(seal);
      mats.push(toon, plain); texs.push(map);
      fontReady(() => { paintSeal(cv, look, o.level | 0); map.needsUpdate = true; });
    }
  } catch (e) { console.warn('nemesis seal', e); }
  // ---- the name plate under the keel ---------------------------------------------------------------------------------------------------------------------------------------------------------------
  try {
    const H = ctx.H, X = ctx.X, Y = ctx.Y;
    const hx0 = H ? H.xL : ctx.hx0, hx1 = H ? H.xR : ctx.hx1;
    let bottom = H ? H.yKeel : Math.max(...(ctx.P || []).map((q) => q.y), 600) + 25;
    if (H && H.boxes) for (const q of H.boxes) bottom = Math.max(bottom, q.y1);
    const Wp = clamp((hx1 - hx0) * 0.7, 380, 720), drop = clamp(Wp * 0.15, 56, 100), board = Wp * 0.17, Hp = drop + board;
    const cvW = 1024, cvH = Math.round(cvW * (Hp / Wp)), cdrop = Math.round((drop / Hp) * cvH);
    const cv = document.createElement('canvas'); cv.width = cvW; cv.height = cvH;
    paintPlate(cv, o.name, look, cdrop);
    const map = tex(cv);
    const basic = new THREE.MeshBasicMaterial({ map, alphaTest: 0.4, side: THREE.FrontSide });
    const pts = [], uvs = [], ids = [];
    const mx = X((hx0 + hx1) / 2), top = Y(bottom) + 6, zz = 4;
    for (const sgn of [1, -1]) {
      const b0 = pts.length / 3;
      for (const [px, py] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) { pts.push(mx + (px * Wp) / 2, top - (1 - py) * Hp / 2, sgn * zz); uvs.push(sgn > 0 ? (px + 1) / 2 : (1 - px) / 2, (py + 1) / 2); }
      ids.push(...(sgn > 0 ? [b0, b0 + 3, b0 + 1, b0 + 1, b0 + 3, b0 + 2] : [b0, b0 + 1, b0 + 3, b0 + 1, b0 + 2, b0 + 3]));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(ids);
    geo.computeVertexNormals();
    plate = new THREE.Mesh(geo, basic);
    plate.frustumCulled = false;
    model.content.add(plate);
    parts.push(plate);
    mats.push(basic); texs.push(map);
    fontReady(() => { paintPlate(cv, o.name, look, cdrop); map.needsUpdate = true; });
  } catch (e) { console.warn('nemesis plate', e); }
  return {
    parts, seal, plate,
    dispose() { for (const p of parts) if (p.geometry) p.geometry.dispose(); for (const m of mats) m.dispose(); for (const t of texs) t.dispose(); },
  };
}
