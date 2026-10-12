// INSTANCED COPIES OF POSED MODELS (the 3D perf pass). A plane is a Batch group (a picture, its ink shell, a propeller, a blur disc: 5 draw calls with its shadow) that flyers.js poses as an ordinary
// Group; six planes cost 30 calls. This takes the groups that are posed and visible this frame and draws them as ONE instanced mesh per mesh of the model: every plane of one kind (same `userData.sig`)
// shares its 5 calls whatever their number. The groups stay exactly as they were (flyers.js still places, scales, flips and steps them); only the drawing moves: after the poses are set, each posed group is
// read (its meshes' matrices relative to the parent), written into the instanced meshes and hidden. Rigid, no sine of the time.
//   const sets = createModelSets(parent)
//   sets.begin(); sets.add(group) (true = taken over, the group is hidden); sets.end()          once a frame, after the poses are set
//   A group is taken over only if it (or the model its `userData.mesh` names) has `userData.sig` (a string naming the model: same name = same meshes, in the same order) and `userData.noInst` is not true
//   (noInst = 'ghost' makes it a set of its own: flyers.js ghostify gives those groups faded materials).
import { THREE, outlineMat, look, inkDouble, toonVCInk, toonVCInkS, plainVCInk, depthVCInk } from './style.js';

const _m = new THREE.Matrix4(), _r = new THREE.Matrix4();

export function createModelSets(parent, max = 40) {
  let failed = false;
  const sets = new Map(); // sig -> { meshes: [{ src, mesh, shell? }], n }
  const meshesOf = (root) => { const list = []; root.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && !o.userData.isOutline) list.push(o); }); return list; };
  const shellOf = (m) => { const p = m.parent; if (!p) return null; for (const c of p.children) if (c !== m && c.userData && c.userData.isOutline && c.geometry === m.geometry) return c; return null; };
  const make = (root, ghost) => {
    const list = meshesOf(root).map((src) => {
      const sh = shellOf(src);
      let mesh;
      if (sh && !ghost) { // (a picture with its ink shell: ONE instanced mesh with the ink inside, style.js inkDouble: half the draw calls)
        const small = !!sh.userData.small;
        mesh = new THREE.InstancedMesh(inkDouble(src.geometry), small ? toonVCInkS : toonVCInk, max);
        mesh.userData.toon = small ? toonVCInkS : toonVCInk; mesh.userData.plain = plainVCInk;
        mesh.customDepthMaterial = depthVCInk;
        if (!look.toon) mesh.material = plainVCInk;
      } else {
        mesh = new THREE.InstancedMesh(src.geometry, src.material, max);
        mesh.userData.toon = src.userData.toon; mesh.userData.plain = src.userData.plain;
      }
      let shell = null;
      if (sh && ghost) { // (a see-through ghost keeps the pair: its materials are faded copies)
        shell = new THREE.InstancedMesh(src.geometry, sh.material || outlineMat, max);
        shell.userData.isOutline = true; shell.userData.small = !!sh.userData.small;
        shell.visible = look.toon && look.outlines && !(look.low && shell.userData.small);
      }
      mesh.userData.shadowCaster = !!src.userData.shadowCaster; mesh.userData.shadowReceiver = !!src.userData.shadowReceiver;
      mesh.castShadow = src.castShadow; mesh.receiveShadow = src.receiveShadow; mesh.renderOrder = src.renderOrder;
      for (const o of shell ? [mesh, shell] : [mesh]) { o.instanceMatrix.setUsage(THREE.DynamicDrawUsage); o.frustumCulled = false; o.count = 0; o.name = 'planeset'; parent.add(o); }
      return { src, mesh, shell };
    });
    return { meshes: list, n: 0, count: list.length };
  };
  // the matrix of `obj` relative to `parent` (the groups' own local matrices up to, not including, the parent: parent may be moved or bent by the host, the instanced meshes are its children too)
  const rel = (obj, out) => { out.identity(); for (let o = obj; o && o !== parent; o = o.parent) { o.updateMatrix(); out.premultiply(o.matrix); } return out; };
  return {
    begin() { for (const s of sets.values()) s.n = 0; },
    add(g) {
      try { return addOne(g); } catch (e) { if (!failed) { failed = true; console.warn('view3d modelSets', e); } return false; } // (drawing code never throws: a group that cannot be taken over draws itself)
    },
    end() {
      try { finish(); } catch (e) { if (!failed) { failed = true; console.warn('view3d modelSets', e); } }
    },
    dispose() { for (const s of sets.values()) for (const e of s.meshes) { e.mesh.removeFromParent(); if (e.shell) e.shell.removeFromParent(); } sets.clear(); },
  };
  function addOne(g) {
    const m = g.userData && (g.userData.sig ? g : g.userData.mesh), sig = m && m.userData && m.userData.sig; // (the model is the group itself, or the one a plane's shell holds)
    if (!sig || g.userData.noInst === true || !g.visible) return false;
    const key = sig + (g.userData.noInst === 'ghost' ? '|ghost' : ''); // (a ghost, a plane still being built, is see-through: its own set, with the faded materials its first group carries)
    let s = sets.get(key);
    if (!s) { s = make(m, g.userData.noInst === 'ghost'); sets.set(key, s); }
    const mine = meshesOf(m);
    if (mine.length !== s.count) return false; // (not the same model after all: leave it to draw itself)
    if (s.n >= max) return false;
    for (let j = 0; j < mine.length; j++) {
      rel(mine[j], _r);
      const e = s.meshes[j];
      e.mesh.setMatrixAt(s.n, _r);
      if (e.shell) e.shell.setMatrixAt(s.n, _r);
    }
    s.n++;
    g.visible = false;
    return true;
  }
  function finish() {
    for (const s of sets.values()) {
      for (const e of s.meshes) {
        e.mesh.count = s.n; e.mesh.instanceMatrix.needsUpdate = true; e.mesh.visible = s.n > 0;
        if (e.shell) { e.shell.count = s.n; e.shell.instanceMatrix.needsUpdate = true; }
      }
    }
    void _m;
  }
}
