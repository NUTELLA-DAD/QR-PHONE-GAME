// WP10: FUNGAL DEPTHS. The deep caves have no key light, so what you see by is what glows: giant mushrooms on the rock's floors and hanging from its ceilings, glowing bulbs on the vines, drifting motes, and the
// spore clouds that roll through the ship. All of it is EMISSIVE (unlit colours brighter than 1, so the bloom pass makes them glow), static (a mushroom never moves or pulses on a sine) with, at most, a STEPPED two-key halo:
// half of the mushrooms are bright while the other half dim, and they swap every few seconds (config.LOOK3D.FUNGAL.STEP). The motes drift in straight lines.
//
// The mushrooms are placed per terrain chunk, from the same marching-squares edges the rock is built from (terrainWalls.js makeCell: a floor = a cut edge facing up, a ceiling = one facing down), by a stable
// integer hash of the square, so a chunk always grows the same mushrooms and the same ones come back when you fly back. The odds, sizes and cap colours follow the 2D art (config.ENVIRONMENTS.fungal.MUSHROOMS).
// Draw calls: 2 (ONE mesh of mushrooms, stem and cap together, and ONE additive soft-disc mesh for every halo, vine bulb, mote and spore puff), only in the Fungal Depths. `?look=nofungal` turns it all off.
// It reads the game's state only and never throws (the view calls it inside a try/catch).
import { THREE, look } from './style.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { config } from '../../config.js';
import { makeCell, CH } from './terrainWalls.js';
import { toWorldX, toWorldY } from '../host/pose.js';
import { mainShip } from '../host/ships.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fin = (n, d = 0) => (Number.isFinite(n) ? n : d);
// a stable integer hash -> 0..1
const H = (a, salt = 0) => { let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((salt | 0) + 0x7f4a7c15, 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15; return (h >>> 0) / 4294967296; };

function discTexture() {
  const N = 64, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d'), r = N / 2, grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.3, 'rgba(255,255,255,0.55)'); grad.addColorStop(0.65, 'rgba(255,255,255,0.14)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, N, N);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

export function createFungal({ parent, state, world, terrain }) {
  const FC = () => (config.LOOK3D && config.LOOK3D.FUNGAL) || {};
  const ME = () => (config.ENVIRONMENTS && config.ENVIRONMENTS.fungal && config.ENVIRONMENTS.fungal.MUSHROOMS) || { CHANCE: 0.34, GIANT: 0.14, GLOW: 0.2, CAPS: ['#8b5cf6', '#19c3b0', '#e657b6', '#52c8ff'] };
  const group = new THREE.Group();
  group.visible = false;
  parent.add(group);
  const MAX = 400, MAXG = 900;
  const unlit = (extra = {}) => new THREE.MeshBasicMaterial({ fog: false, toneMapped: false, ...extra });
  // one mushroom of size 1 (the instance scale is its size): a pale stem (aStem = 1) under a hemisphere cap tinted by the instance colour (aStem = 0). Same ratios as the 2D art: stem 38 tall, cap 34 wide and 27 high.
  const shroomGeo = (() => {
    const stem = new THREE.CylinderGeometry(5, 7, 38, 7, 1); stem.translate(0, 19, 0);
    const cap = new THREE.SphereGeometry(1, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2); cap.scale(34, 27.6, 30.6); cap.translate(0, 38, 0);
    for (const [g, v] of [[stem, 1], [cap, 0]]) g.setAttribute('aStem', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(v), 1));
    return mergeGeometries([stem, cap], false);
  })();
  const capMat = unlit({ color: 0xffffff, side: THREE.DoubleSide });
  capMat.onBeforeCompile = (sh) => {
    sh.uniforms.uStem = { value: new THREE.Color('#e8def7').multiplyScalar(1.1) };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aStem; varying float vStem;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvStem = aStem;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vStem; uniform vec3 uStem;').replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix( diffuseColor.rgb, uStem, vStem );');
  };
  capMat.customProgramCacheKey = () => 'fungal-shroom';
  const glowMat = unlit({ color: 0xffffff, map: discTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const mkInst = (geo, mat, max, order = 0) => { const m = new THREE.InstancedMesh(geo, mat, max); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.count = 0; m.renderOrder = order; group.add(m); return m; };
  const caps = mkInst(shroomGeo, capMat, MAX);
  const glow = mkInst(new THREE.PlaneGeometry(1, 1), glowMat, MAXG, 3);
  for (const m of [caps, glow]) m.setColorAt(0, new THREE.Color()); // (allocates the colour buffers)
  const chunks = new Map(); // chunk key -> { shrooms: [...], bulbs: [...] }
  let dirty = true, lastKey = -1, active = false;
  const S = { shrooms: 0, bulbs: 0, glows: 0, active: false };

  // ---- placement: the same odds as the 2D art, per chunk ---------------------------------------------------------------------------------------------------------------------------------------
  const grow = (map, ci, cj) => {
    const M = ME(), caps_ = M.CAPS || ['#8b5cf6'], out = { shrooms: [], bulbs: [] };
    for (let j = cj * CH; j < Math.min(map.H, (cj + 1) * CH); j++) {
      for (let i = ci * CH; i < Math.min(map.W, (ci + 1) * CH); i++) {
        for (const sg of makeCell(map, i, j).segs) {
          const floor = sg.ny < -0.55, ceil = sg.ny > 0.55;
          if (!floor && !ceil) continue;
          const lerpAt = (t) => [sg.ax + (sg.bx - sg.ax) * t, sg.ay + (sg.by - sg.ay) * t];
          if (floor) {
            if (H(i * 31 + j, 300) > M.CHANCE) continue;
            const cnt = 1 + Math.floor(H(i + j, 301) * 2.6);
            for (let n = 0; n < cnt; n++) {
              const t = H(i * 7 + j + n * 13, 302 + n), giant = H(i * 5 + j * 3 + n, 305) < M.GIANT;
              const s = giant ? 2.2 + H(i + n, 306) * 1.4 : 0.6 + H(j + n, 307) * 0.9, p = lerpAt(t);
              out.shrooms.push({ x: p[0], y: -p[1], z: -280 + H(i * 3 + j + n, 311) * 400, s, dir: 1, cap: Math.floor(H(i * 3 + j + n, 308) * caps_.length) % caps_.length, ph: H(i + j * 5 + n, 312) < 0.5 ? 0 : 1 });
            }
          } else {
            const h = H(i * 17 + j, 55), p = lerpAt(0.5);
            if (h >= 0.18 && h < 0.28) out.bulbs.push({ x: p[0] - 6, y: -(p[1] + 60 + H(j, 57) * 140), z: -200 + H(i + j, 313) * 300 });
            else if (h >= 0.28 && h < 0.4) out.shrooms.push({ x: p[0], y: -(p[1] - 4), z: -280 + H(i * 3 + j, 311) * 400, s: 0.55 + H(i, 309) * 0.5, dir: -1, cap: Math.floor(H(j, 310) * caps_.length) % caps_.length, ph: H(i + j, 314) < 0.5 ? 0 : 1 });
          }
        }
      }
    }
    return out;
  };
  const onChunk = (op, key, map, ci, cj) => {
    try {
      if (op === 'remove') { if (chunks.delete(key)) dirty = true; return; }
      if (world.envId !== 'fungal' || !map) return;
      chunks.set(key, grow(map, ci, cj));
      dirty = true;
    } catch (e) { console.warn('fungal chunk', e); }
  };
  // chain with whoever listens already (destruction.js): the rock calls one function
  const prev = terrain.onChunk;
  terrain.onChunk = (...a) => { if (prev) prev(...a); onChunk(...a); };
  for (const c of terrain.chunkList()) onChunk('add', c.key, c.map, c.ci, c.cj);

  // ---- every frame ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const _M = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _qf = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
  const capColors = [];
  // c = { t, camTarget (3D look-at), vis: { w, h } }
  const update = (c) => {
    const on = look.fungal && world.envId === 'fungal';
    group.visible = on; S.active = on;
    if (!on) { if (chunks.size && world.envId !== 'fungal') { chunks.clear(); dirty = true; } return; }
    const F = FC(), M = ME(), hdr = fin(F.HDR, 1.9), step = Math.max(0.4, fin(F.STEP, 1.6));
    const key = Math.floor(c.t / step) % 2; // the two-key halo: one half bright while the other dims, swapping every STEP seconds
    if (!capColors.length) for (const hex of M.CAPS || ['#8b5cf6']) capColors.push(new THREE.Color(hex));
    // ---- mushrooms, bulbs and their halos (rebuilt when the chunks change or the key flips)
    if (dirty || key !== lastKey) {
      let ns = 0, nb = 0, ng = 0;
      const halo = fin(F.HALO, 0.26), bulbCol = new THREE.Color(F.BULB || '#7dffd8');
      for (const ch of chunks.values()) {
        for (const m of ch.shrooms) {
          if (ns >= MAX) break;
          const stemH = 38 * m.s, capW = 34 * m.s, capH = 24 * m.s, d = m.dir;
          _q.identity(); if (d < 0) _q.copy(_qf);
          _p.set(m.x, m.y, m.z); _s.set(m.s, m.s, m.s);
          caps.setMatrixAt(ns, _M.compose(_p, _q, _s));
          caps.setColorAt(ns, _c.copy(capColors[m.cap]).multiplyScalar(hdr));
          ns++;
          if (ng < MAXG - 160) { // the halo: bright on its own key, dim on the other (a stepped two-key pulse, no sine)
            const k = m.ph === key ? 1 : 0.6;
            _p.set(m.x, m.y + d * (stemH + capH * 0.2), m.z - 10); _s.set(capW * 3.4, capW * 3.4, 1);
            glow.setMatrixAt(ng, _M.compose(_p, _q.identity(), _s));
            glow.setColorAt(ng, _c.copy(capColors[m.cap]).multiplyScalar(halo * 3 * k * (M.GLOW ? M.GLOW / 0.2 : 1)));
            ng++;
          }
        }
        for (const b of ch.bulbs) { // a vine's bulb: a bright small disc with a wider halo (both in the glow mesh)
          if (nb >= MAX || ng >= MAXG - 200) break;
          _p.set(b.x, b.y, b.z); _s.set(30, 30, 1); glow.setMatrixAt(ng, _M.compose(_p, _q.identity(), _s)); glow.setColorAt(ng, _c.copy(bulbCol).multiplyScalar(hdr * 1.4)); ng++;
          _p.set(b.x, b.y, b.z - 10); _s.set(84, 84, 1); glow.setMatrixAt(ng, _M.compose(_p, _q.identity(), _s)); glow.setColorAt(ng, _c.copy(bulbCol).multiplyScalar(halo * 3)); ng++;
          nb++;
        }
      }
      caps.count = ns; S.shrooms = ns; S.bulbs = nb;
      caps.instanceMatrix.needsUpdate = true; if (caps.instanceColor) caps.instanceColor.needsUpdate = true;
      S.staticGlows = ng; glow.userData.nStatic = ng;
      dirty = false; lastKey = key;
    }
    // ---- motes (straight lines, wrapped round the camera) and spore puffs: the dynamic tail of the glow mesh
    let ng = glow.userData.nStatic || 0;
    const cx = c.camTarget.x, cy = c.camTarget.y, W = Math.max(2000, c.vis.w * 1.2), Hh = Math.max(1400, c.vis.h * 1.2);
    const n = Math.min(Math.round(fin(F.MOTES, 70)), 140), speed = fin(F.MOTE_SPEED, 14), cols = (F.MOTE_COLORS || ['#96ffdc', '#be96ff']).map((h) => new THREE.Color(h));
    const wrap = (v, span) => ((v % span) + span) % span;
    for (let i = 0; i < n && ng < MAXG - 40; i++) {
      const u = H(i, 1) * W, v = H(i, 2) * Hh, hz = H(i, 3), hx = H(i, 4);
      const x = cx - W / 2 + wrap(u + 10 * c.t * hx - (cx - W / 2), W); // (fixed to the world: a tile of motes that repeats, drifting slowly sideways and rising in straight lines)
      const y = cy - Hh / 2 + wrap(v + speed * (0.5 + hz) * c.t - (cy - Hh / 2), Hh);
      const sz = 5 + 7 * H(i, 5);
      _p.set(x, y, -150 + H(i, 7) * 450); _s.set(sz * 2.6, sz * 2.6, 1);
      glow.setMatrixAt(ng, _M.compose(_p, _q.identity(), _s));
      glow.setColorAt(ng, _c.copy(cols[H(i, 6) < 0.6 ? 0 : 1]).multiplyScalar(1.5));
      ng++;
    }
    const sp = state.spores || [];
    if (sp.length) {
      const ship = mainShip(state), sc = new THREE.Color(F.SPORE || '#b0f06e'), al = fin(F.SPORE_ALPHA, 0.2);
      for (const cl of sp) {
        for (let k = 0; k < 11 && ng < MAXG; k++) {
          const a = H(cl.seed * 13 + k, 500) * 6.283, r = Math.sqrt(H(cl.seed * 17 + k, 501));
          const px = toWorldX(ship, cl.x + Math.cos(a) * r * cl.rx * 0.62), py = toWorldY(ship, cl.y + Math.sin(a) * r * cl.ry * 0.62);
          const pr = Math.min(cl.rx, cl.ry * 1.4) * (0.42 + H(cl.seed * 19 + k, 502) * 0.3);
          _p.set(px, -py, 70); _s.set(pr * 2.6, pr * 2.6, 1);
          glow.setMatrixAt(ng, _M.compose(_p, _q.identity(), _s));
          glow.setColorAt(ng, _c.copy(sc).multiplyScalar(al));
          ng++;
        }
      }
    }
    glow.count = ng; S.glows = ng;
    glow.instanceMatrix.needsUpdate = true; if (glow.instanceColor) glow.instanceColor.needsUpdate = true;
  };
  const dispose = () => { terrain.onChunk = prev; for (const m of [caps, glow]) { m.geometry.dispose(); m.material.dispose(); } parent.remove(group); };
  return { update, stats: S, group, dispose };
}
