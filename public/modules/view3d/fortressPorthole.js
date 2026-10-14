// LOOP.md R5: THE FORTRESS PORTHOLE. On a ring map the castle curves away on both sides of the ship, so a gate whose SHUTTER has just opened (its guns are down; the core is open to shells and bombs for a few seconds)
// is usually off the picture. While a shutter is open and its face is not on screen, a round window with a brass rim hangs at the edge of the picture and shows that face from a camera of its own - the gatehouse, the
// open core alcove glowing, the wall - with a plate "GATE 2 - CORE OPEN 4s" under it. It is a view-only extra window like the friends' portholes (portholes.js draws the picture: this file plans it, and draws the rim
// and the plate in 3D over it, because the HUD layer for the other portholes lives in host/); budget one window, Medium and High only (Low keeps the face list on the HUD as before).
// Stepped: the window fades in and out in four shades at 8 fps, the plate's seconds change once a second, nothing moves. No sine of the time. It never throws (index.js wraps it in a try).
import { THREE, look } from './style.js';
import { config } from '../../config.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fin = Number.isFinite;
const K = () => config.DEPTH3D || {};
const FC = () => K().FORTRESS || {};

function colored(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  geo.deleteAttribute('uv'); geo.deleteAttribute('normal');
  return geo;
}

export function createFortressPorthole({ renderer, state, mapPt }) {
  const F = { cur: null, item: null, stats: { shown: 0, face: -1, ms: 0 } };
  const PC = () => config.PORTHOLES || {};
  // ---- the rim: an ink ring, a brass band, an ink line inside, eight rivets, a pointer notch (unit radius = the window's radius) ----
  const ink = (config.INK || '#1f1a18'), col = (PC().COLORS || {});
  const rimGeo = mergeGeometries([
    colored(new THREE.RingGeometry(1.0, 1.07, 56), ink),
    colored(new THREE.RingGeometry(0.885, 1.0, 56), '#c4503a'),
    colored(new THREE.RingGeometry(0.93, 0.955, 56), col.brass || '#c49a4c'),
    colored(new THREE.RingGeometry(0.865, 0.885, 56), ink),
    ...Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2 + 0.2, g = new THREE.CircleGeometry(0.036, 10); g.translate(Math.cos(a) * 0.942, Math.sin(a) * 0.942, 0); return colored(g, col.brass || '#e0c070'); }),
  ].map((g) => (g.index ? g.toNonIndexed() : g)), false);
  const rimMat = new THREE.MeshBasicMaterial({ vertexColors: true, depthTest: false, depthWrite: false, transparent: true, side: THREE.DoubleSide });
  rimMat.toneMapped = false;
  const rim = new THREE.Mesh(rimGeo, rimMat);
  rim.frustumCulled = false;
  // the notch: a small triangle on the rim, toward the face (left or right)
  const notchGeo = colored(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array([1.07, 0.14, 0, 1.07, -0.14, 0, 1.26, 0, 0]), 3)), '#c4503a');
  const notch = new THREE.Mesh(notchGeo, rimMat);
  notch.frustumCulled = false;
  // the plate: a painted canvas under the window
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const plateMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
  plateMat.toneMapped = false;
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(1, 96 / 512), plateMat);
  plate.frustumCulled = false;
  let plateText = '', plateHot = false;
  const paintPlate = (text, hot) => {
    if (text === plateText && hot === plateHot) return;
    plateText = text; plateHot = hot;
    const g = cv.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, 512, 96);
    g.lineJoin = 'round';
    const r = 20; g.beginPath(); g.moveTo(r, 4); g.arcTo(508, 4, 508, 92, r); g.arcTo(508, 92, 4, 92, r); g.arcTo(4, 92, 4, 4, r); g.arcTo(4, 4, 508, 4, r); g.closePath();
    g.fillStyle = hot ? '#f6d9c8' : '#f3e7c4'; g.fill(); g.lineWidth = 6; g.strokeStyle = ink; g.stroke();
    g.fillStyle = hot ? '#a8281c' : '#4a2a20'; g.font = '700 46px ' + ((config.FONTS && config.FONTS.TEXT) || 'sans-serif'); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 256, 52, 480);
    tex.needsUpdate = true;
  };
  const os = new THREE.Scene();
  os.add(rim, notch, plate);
  const oc = new THREE.OrthographicCamera(0, 100, 100, 0, -10, 10);

  // ---- the plan: which face (if any) gets the window, and where it hangs (canvas px, like the other portholes' items) ----
  let a = 0, faceI = -1, lastT = -1;
  F.plan = ({ w, h, t, tier, others = [] }) => {
    F.item = null;
    const ring = state.course && state.course.ring;
    const on = K().ENABLED !== false && look.depth && tier && tier.name !== 'low' && ((K().TIERS || {})[tier.name] || {}).fortress && ring && state.phase === 'flying' && !ring.crown && state.course.map && state.course.map.ring;
    let want = null;
    if (on) {
      const seen = (f) => { const p = mapPt(f.core.x, f.core.y); return p && p.x > 0.05 && p.x < 0.95 && p.y > 0.1 && p.y < 0.88; };
      const open = ring.faces.filter((f) => !f.down && f.open > 0 && f.core && fin(f.core.x) && !seen(f));
      want = open.find((f) => f.i === faceI) || open.sort((p, q) => q.open - p.open)[0] || null; // (the same face while it still qualifies; else the one open longest)
    }
    const step = Math.floor(t * 8);
    if (step !== lastT) { lastT = step; a = clamp(a + (want ? 0.25 : -0.25), 0, 1); } // (four held shades in, four out)
    if (want) faceI = want.i;
    const face = want || (a > 0 && ring ? ring.faces.find((f) => f.i === faceI) : null);
    if (!face || a <= 0) { if (!want && a <= 0) faceI = -1; F.cur = null; F.stats.shown = 0; return []; }
    const R = (FC().R || 0.13) * h, side = (PC().SAFE ? PC().SAFE.SIDE : 0.012) * w + 8, gap = PC().GAP || 10;
    const top = (PC().SAFE ? PC().SAFE.TOP : 0.3) * h, bottom = h - (PC().SAFE ? PC().SAFE.BOTTOM : 0.1) * h;
    const spots = [[w - R - side, 0.5], [R + side, 0.5], [w - R - side, 0.68], [R + side, 0.68], [w - R - side, 0.4], [R + side, 0.4]];
    let pos = null;
    for (const [x, fy] of spots) {
      const y = clamp(fy * h, top + R, bottom - R - R * 0.5);
      if (others.every((o) => Math.hypot(o.x - x, o.y - y) > o.r + R + gap)) { pos = { x, y }; break; }
    }
    if (!pos) { F.cur = null; return []; }
    const dir = (() => { const p = mapPt(face.core.x, face.core.y); return p && p.x < 0.5 ? -1 : 1; })();
    F.cur = { face, x: pos.x, y: pos.y, r: R, dir, a };
    F.item = { id: 'fort', kind: 'fort', pic: '3d', a, x: pos.x, y: pos.y, r: R, cx: face.core.x, cy: face.core.y - 260, zoom: FC().ZOOM || 0.3, label: 'GATE ' + (face.i + 1) };
    F.stats.shown = 1; F.stats.face = face.i;
    return [F.item];
  };

  // ---- the rim and the plate, over the picture portholes.js has drawn (after it) ----
  F.draw = (live, cssW, cssH, f) => {
    const c = F.cur;
    if (!c || !live || !live.has('fort')) return;
    const t0 = performance.now();
    const secs = Math.max(0, Math.ceil(c.face.open - 1e-6));
    paintPlate('GATE ' + (c.face.i + 1) + ' - CORE OPEN ' + secs + 's', secs <= 2);
    oc.right = cssW; oc.top = cssH; oc.updateProjectionMatrix();
    const x = c.x * f, y = cssH - c.y * f, r = c.r * f;
    rim.position.set(x, y, 0); rim.scale.set(r, r, 1);
    notch.position.set(x, y, 0); notch.scale.set(r * c.dir, r, 1);
    const pw = r * 2.5;
    plate.scale.set(pw, pw, 1); plate.position.set(clamp(x, pw / 2 + 4, cssW - pw / 2 - 4), y - r * 1.06 - (pw * 96) / 512 / 2, 0); // (the plate hangs under the window, kept inside the picture)
    rimMat.opacity = Math.round(c.a * 4) / 4; plateMat.opacity = rimMat.opacity;
    const ac = renderer.autoClear, sc = renderer.getScissorTest();
    try {
      renderer.autoClear = false; renderer.setScissorTest(false); renderer.setViewport(0, 0, cssW, cssH); renderer.setRenderTarget(null);
      renderer.render(os, oc);
    } finally { renderer.autoClear = ac; renderer.setScissorTest(sc); }
    F.stats.ms = performance.now() - t0;
  };
  F.dispose = () => { rimGeo.dispose(); notchGeo.dispose(); rimMat.dispose(); plateMat.dispose(); plate.geometry.dispose(); tex.dispose(); };
  return F;
}
