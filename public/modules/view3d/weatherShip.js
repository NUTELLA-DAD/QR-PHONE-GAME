// WP12: WHAT THE WEATHER PUTS ON THE SHIP. Everything here reads the game's state and draws it; nothing is written back.
//   FROST: the sim's `state.ice` (how iced the gasbag, the outdoor decks and the guns are) and `state.icing` (the crusts: { area, x, d, gun, lvl }) -> (1) a per-part frost amount in the ship's weather texture
//   (kit.js uWx): the upward faces of an iced bag, deck or gun grow a white toon crust with static sparkles in the shader; (2) ONE small mesh of ice lumps and icicles on the outdoor decks and round the iced guns
//   (the volume the shader cannot give). Both are static: a crust grows when the sim says so, in steps.
//   STORM RODS: `state.stormJob.rods` -> a pole with a finial and a ball on the top deck; the ball is dull gold, pulses (stepped, 8 fps) while a bolt is charging, and goes cyan while someone holds the rod.
//   SEA: the bilge pump on the lower deck (a squat red pump, its lever moves in two stepped keys while somebody works it) and the flood water as a band on the far wall of the lower deck.
// All of it is ONE merged mesh on the main ship (toon, vertex colours, rebuilt only when its key changes), so it costs one draw call whatever is shown.
import { THREE, Batch, G, gradientMap, rimify } from './style.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { config } from '../../config.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fin = Number.isFinite;
const hashN = (n) => { let h = Math.imul((n | 0) ^ 0x9e3779b1, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const W3 = () => (config.LOOK3D && config.LOOK3D.WEATHER) || {};

// the ice, rods and pump share one material: toon, vertex colours, with a few static sparkles on the white
function makeMat() {
  const m = rimify(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap }));
  const rim = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    rim(sh, r);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWxP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWxP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWxP;\nfloat wxH( vec3 c ) { vec3 p3 = fract( c * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }')
      .replace('#include <opaque_fragment>', '#include <opaque_fragment>\n  { float wxW = dot( diffuseColor.rgb, vec3( 0.333 ) ); float wxS = step( 0.972, wxH( floor( vWxP / 6.0 ) ) ) * step( 0.78, wxW ); gl_FragColor.rgb += vec3( 1.2, 1.3, 1.5 ) * wxS; }');
  };
  m.customProgramCacheKey = () => 'toon-rim-wx';
  return m;
}

const hdr = (b, k) => { const g = b.parts[b.parts.length - 1], c = g.attributes.color; for (let i = 0; i < c.count; i++) c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k); };

export function createWeatherShip({ state, models, parent }) {
  const mat = makeMat();
  const S = { rods: 0, crusts: 0, pump: 0, flood: 0, rebuilds: 0, frostParts: 0, visible: false };
  let rec = null; // { model, mesh, key, side, cache: Map(partIdx -> frost), parts }
  const stormTip = { x: 0, y: 0, z: 0, ok: false };

  const bindParts = (model, sh) => {
    const L = model.layout, P = L.platforms, out = [], pIdx = (model.assembled && model.assembled.partIndex) || {};
    const outdoor = new Set(L.outdoorDecks().map((d) => P[d].id));
    for (const [key, meta] of model.parts) {
      const idx = pIdx[key];
      if (!idx) continue;
      if (meta.kind === 'deck' && outdoor.has(key.slice(5))) out.push({ idx, what: 'deck' });
      else if (meta.kind === 'gun') out.push({ idx, what: 'gun', gun: key.slice(4) });
    }
    // the gas envelope is a moving node with no part number of its own (WP6 gives it 0): it gets the last texel (511) so the shader can ice it
    let bagMeshes = 0;
    for (const bg of (model.dyn && model.dyn.bags) || []) bg.node.traverse((o) => { const a = o.isMesh && o.geometry && o.geometry.attributes.aPart; if (a) { a.array.fill(511); a.needsUpdate = true; bagMeshes++; } });
    if (bagMeshes) out.push({ idx: 511, what: 'bag' });
    return out;
  };

  const frostOf = (p, st) => {
    const ice = st.ice || {};
    if (p.what === 'bag') return fin(ice.gasbag) ? ice.gasbag : 0;
    if (p.what === 'deck') return fin(ice.topdeck) ? Math.min(1, ice.topdeck * 1.15) : 0;
    const c = (st.icing || []).find((q) => q.gun === p.gun);
    return c && fin(c.lvl) ? c.lvl : 0;
  };

  // ---- the geometry ---------------------------------------------------------------------------------------------------------------------------------------------------------
  function lump(b, color, x, y, z, rx, ry, rz) { b.sphere(color, x, y, z, rx, ry, rz, 0, true); }
  function crustGeo(b, model, st, C) {
    const L = model.layout, P = L.platforms, X = model.X, Y = model.Y;
    let n = 0;
    for (const c of st.icing || []) {
      const lvl = clamp(fin(c.lvl) ? c.lvl : 0.3, 0.1, 1), seed = Math.round((c.x || 0) / 10) + n * 31;
      n++;
      if (c.area === 'topdeck' && P[c.d]) {
        const y = P[c.d].y, w = 50 + lvl * 90, h = 14 + lvl * 30;
        for (let k = 0; k < 4; k++) { // a ridge of lumps along the deck
          const ox = (k - 1.5) * w * 0.55 + (hashN(seed + k) - 0.5) * 16, s = 0.6 + 0.5 * hashN(seed + 9 + k);
          lump(b, k % 2 ? C.ICE : C.SHADE, X(c.x + ox), Y(y) + h * 0.16 * s, (hashN(seed + 20 + k) - 0.5) * 40, w * 0.42 * s, h * 0.55 * s, 52 + 18 * hashN(seed + 5 + k));
          lump(b, C.SNOW, X(c.x + ox), Y(y) + h * 0.5 * s, (hashN(seed + 20 + k) - 0.5) * 40, w * 0.3 * s, h * 0.28 * s, 40);
        }
        for (let k = 0; k < 3; k++) { // a few icicles hanging from the front lip
          const ox = (k - 1) * w * 0.7 + (hashN(seed + 40 + k) - 0.5) * 20, len = (14 + 34 * lvl) * (0.6 + 0.8 * hashN(seed + 50 + k));
          b.cone(C.SNOW, X(c.x + ox), Y(y) - len * 0.5, 40, 6, len, 0, Math.PI, 0, 0);
        }
      } else if (c.area === 'gun') {
        const g = (st.GUNS || {})[c.gun];
        if (!g || !fin(g.bx) || !fin(g.by)) continue;
        const r = 22 + lvl * 28, jam = lvl >= (config.ENVIRONMENTS.frost.ICE.JAM_AT || 0.8);
        lump(b, C.ICE, X(g.bx), Y(g.by) - 4, 0, r * 1.05, r * (jam ? 0.8 : 0.55), r * 0.9);
        lump(b, C.SNOW, X(g.bx) - r * 0.25, Y(g.by) + r * 0.45, 8, r * 0.6, r * 0.32, r * 0.55);
        if (jam) lump(b, C.SHADE, X(g.bx) + r * 0.4, Y(g.by) - r * 0.2, 30, r * 0.5, r * 0.4, r * 0.4);
      }
    }
    return n;
  }
  function rodGeo(b, model, st, C, K8, sd) {
    const L = model.layout, P = L.platforms, X = model.X, Y = model.Y, J = st.stormJob;
    if (!J || !J.rods) return 0;
    let n = 0;
    for (const r of J.rods) {
      const q = P[r.d];
      if (!q) continue;
      n++;
      const y = q.y, x = r.x, z = sd * model.W * 0.5, held = r.held > 0, live = !!J.charge; // (on the camera side of the deck, in front of the gas envelope, which the rod would otherwise vanish into)
      b.box(C.BASE, X(x), Y(y) + 6, z, 34, 12, 30, 0);
      b.rod(C.POLE, V3(X(x), Y(y) + 8, z), V3(X(x), Y(y) + 140, z), 8, 0);
      b.cone(C.POLE, X(x), Y(y) + 196, z, 8, 44, 0); // the finial
      b.rod(C.POLE, V3(X(x) - 18, Y(y) + 120, z), V3(X(x) + 18, Y(y) + 120, z), 3, 0); // a short crossbar
      const col = held ? C.HELD : live ? (K8 & 1 ? C.LIVE : C.TIP) : C.TIP, k = held ? C.HDR : live ? (K8 & 1 ? C.HDR : 1.2) : 0.9;
      b.sphere(col, X(x), Y(y) + 152, z, held ? 28 : 23, held ? 28 : 23, held ? 28 : 23, 0, true);
      hdr(b, k);
    }
    return n;
  }
  function pumpGeo(b, model, st, K8, sd) {
    const L = model.layout, P = L.platforms, X = model.X, Y = model.Y, s = st.sea;
    if (!s) return 0;
    let n = 0;
    const lo = L.deckIndex('lower') >= 0 ? P[L.deckIndex('lower')] : null;
    if (s.pump && P[s.pump.d]) {
      const x = s.pump.x, y = P[s.pump.d].y, working = (s.pumped || 0) > 0, lev = working ? (K8 & 1 ? 0.55 : -0.45) : 0.2, z = -10;
      b.box('#b8402f', X(x), Y(y) + 23, z, 44, 46, 38, 0);
      b.box('#d9d2c0', X(x), Y(y) + 57, z, 16, 26, 16, 0);
      b.rod('#4a5260', V3(X(x), Y(y) + 64, z), V3(X(x) + Math.cos(-0.9 + lev) * 52, Y(y) + 64 - Math.sin(-0.9 + lev) * 52, z), 3, 0);
      b.sphere('#d9a441', X(x) + Math.cos(-0.9 + lev) * 52, Y(y) + 64 - Math.sin(-0.9 + lev) * 52, z, 7, 7, 7, 0, true);
      n++;
    }
    if (lo && (s.flood || 0) > 0.02) { // the flood: a blue band with a foam line on the far wall of the lower deck, in steps of 6%
      const fl = Math.round(clamp(s.flood, 0, 1) * 16) / 16, h = 14 + fl * 100, x0 = lo.x0 + 30, x1 = lo.x1 - 30, wz = -sd * (model.W * 0.97 - 22);
      b.box('#2c7da6', X((x0 + x1) / 2), Y(lo.y) + h / 2, wz, x1 - x0, h, 8, 0);
      b.box('#eaf7ff', X((x0 + x1) / 2), Y(lo.y) + h, wz + sd * 2, x1 - x0, 5, 9, 0);
      S.flood = fl;
    } else S.flood = 0;
    return n;
  }

  const keyOf = (model, st, K8, sd) => {
    const C = W3();
    let k = String(sd);
    if (st.icing && st.icing.length) k += 'I' + st.icing.map((c) => c.area[0] + Math.round(c.x || 0) + (c.gun || '') + Math.round((c.lvl || 0) * 10)).join(',');
    const J = st.stormJob;
    if (J && J.rods && J.rods.length) k += 'R' + J.rods.map((r) => r.d + ':' + r.x + (r.held > 0 ? 'h' : '')).join(',') + (J.charge ? 'c' + (K8 & 1) : '');
    const s = st.sea;
    if (s && (s.pump || s.flood > 0.02)) k += 'P' + (s.pump ? s.pump.x + ((s.pumped || 0) > 0 ? 'w' + (K8 & 1) : '') : '') + Math.round(clamp(s.flood || 0, 0, 1) * 16);
    return C ? k : '';
  };

  S.update = ({ t, env }) => {
    const sh = state.ships[0], e = sh && models.get(sh.id);
    if (!e || !e.model || !e.model.content) { if (rec && rec.mesh) rec.mesh.visible = false; return; }
    const model = e.model;
    if (!rec || rec.model !== model) {
      if (rec && rec.mesh) { rec.mesh.parent && rec.mesh.parent.remove(rec.mesh); rec.mesh.geometry.dispose(); }
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
      mesh.frustumCulled = false; mesh.name = 'wxShip'; mesh.visible = false; mesh.castShadow = false; mesh.receiveShadow = false;
      model.content.add(mesh);
      rec = { model, mesh, key: '', parts: bindParts(model, sh), cache: new Map() };
    }
    const st = state, K8 = Math.floor(t * 8), sd = (model.assembled && model.assembled.side) || 1;
    // ---- the frost texels (the shader's per-part crust)
    const mats = model.ctx && model.ctx.mats;
    if (mats && mats.wxData) {
      let wrote = false, parts = 0;
      for (const p of rec.parts) {
        const v = env === 'frost' ? Math.round(frostOf(p, st) * 20) / 20 : 0;
        if (v > 0) parts++;
        if (rec.cache.get(p.idx) !== v) { rec.cache.set(p.idx, v); mats.wxData[p.idx * 4] = v; wrote = true; }
      }
      if (wrote) mats.wxTex.needsUpdate = true;
      S.frostParts = parts;
    }
    // ---- the mesh
    const key = keyOf(model, st, K8, sd);
    if (key !== rec.key) {
      rec.key = key;
      S.rebuilds++;
      const C = W3(), b = new Batch();
      let crusts = 0, rods = 0, pump = 0;
      try {
        if (env === 'frost') crusts = crustGeo(b, model, st, C.CRUST || {});
        if (env === 'storm') rods = rodGeo(b, model, st, C.ROD || {}, K8, sd);
        if (env === 'sea') pump = pumpGeo(b, model, st, K8, sd);
      } catch (err) { console.warn('view3d weatherShip', err); }
      S.crusts = crusts; S.rods = rods; S.pump = pump;
      rec.mesh.geometry.dispose();
      if (b.parts.length) { rec.mesh.geometry = mergeGeometries(b.parts, false); for (const g of b.parts) g.dispose(); rec.mesh.geometry.computeBoundingSphere(); }
      else rec.mesh.geometry = new THREE.BufferGeometry();
    }
    rec.mesh.visible = (S.crusts + S.rods + S.pump > 0 || S.flood > 0) && rec.mesh.geometry.attributes.position != null;
    S.visible = rec.mesh.visible;
    // where a rod's tip is in the world (the strike's sparks): the first rod nearest a given x is found by the caller through tipOf
    stormTip.ok = false;
  };
  // the world position of a rod's tip (3D, y up), nearest to the world x given; null when there are no rods
  S.tipNear = (wx) => {
    if (!rec || !rec.model) return null;
    const model = rec.model, J = state.stormJob, P = model.layout.platforms;
    if (!J || !J.rods || !J.rods.length) return null;
    let best = null;
    for (const r of J.rods) {
      const q = P[r.d];
      if (!q) continue;
      const v = V3(model.X(r.x), model.Y(q.y) + 160, -22);
      model.content.localToWorld(v);
      if (!best || Math.abs(v.x - wx) < Math.abs(best.x - wx)) best = { x: v.x, y: v.y, z: v.z, held: r.held > 0 };
    }
    return best;
  };
  // a point of the main ship's layout in the world (3D, y up)
  S.shipPoint = (x, y, z = 0) => {
    if (!rec || !rec.model) return null;
    const v = V3(rec.model.X(x), rec.model.Y(y), z);
    rec.model.content.localToWorld(v);
    return v;
  };
  S.dispose = () => { if (rec && rec.mesh) { rec.mesh.parent && rec.mesh.parent.remove(rec.mesh); rec.mesh.geometry.dispose(); } mat.dispose(); };
  void G; void parent;
  return S;
}
