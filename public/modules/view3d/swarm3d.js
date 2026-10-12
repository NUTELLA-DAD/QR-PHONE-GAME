// INSTANCED COPIES OF A MODEL (WP9). A swarm of bats or imps, a field of mines: the same model many times. Drawn one by one (a Group of its own each) they would cost 4-8 draw calls apiece; as an
// InstancedMesh pair (the picture and its ink shell) they cost 2 calls for the whole crowd, whatever its size. A model that has several held poses (a bat's wing up, level, down) is one instanced pair
// per pose, and each frame every copy is put in the pair of the pose it is in: so a whole flock costs (poses x 2) calls. Rigid: a copy is only a matrix.
//   const sw = createInstanced(parent, template, max)   template = a Group from style.js Batch.build() (its mesh and ink shell share the geometry, which this reuses; do not dispose the template)
//   sw.begin(); sw.add(matrix); sw.end()                 once a frame
//   createLampInstances(parent, max, geometry)           little unlit spheres, one colour each (HDR allowed: they cross the bloom threshold): a mine's lamp
import { THREE, look, inkDouble, toonVCInkS, plainVCInk, depthVCInk } from './style.js';

export function createInstanced(parent, template, max = 64) {
  const base = template.userData.mesh ? template.userData.mesh.geometry : template.children[0].geometry;
  // the picture and its ink shell are ONE instanced mesh (style.js inkDouble: the geometry twice, the ink in the same draw): a flock costs (poses x 1) calls, not (poses x 2)
  const geo = base.attributes.aShell ? base : inkDouble(base);
  const mesh = new THREE.InstancedMesh(geo, look.toon ? toonVCInkS : plainVCInk, max);
  mesh.userData.toon = toonVCInkS; mesh.userData.plain = plainVCInk; mesh.userData.shadowCaster = true; mesh.userData.shadowReceiver = false;
  mesh.castShadow = look.shadows;
  mesh.customDepthMaterial = depthVCInk;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.count = 0; parent.add(mesh);
  mesh.name = 'swarm';
  let n = 0;
  return {
    mesh, shell: null, max,
    begin() { n = 0; },
    add(M) { if (n >= max) return false; mesh.setMatrixAt(n, M); n++; return true; },
    end() { mesh.count = n; mesh.instanceMatrix.needsUpdate = true; mesh.visible = n > 0; },
    get count() { return n; },
    dispose() { mesh.removeFromParent(); },
  };
}

export function createLampInstances(parent, max, geometry) {
  const mat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  mat.toneMapped = true;
  const mesh = new THREE.InstancedMesh(geometry, mat, max);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.setColorAt(0, new THREE.Color('#ffffff'));
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  parent.add(mesh);
  let n = 0;
  return {
    mesh,
    begin() { n = 0; },
    add(M, color) { if (n >= max) return false; mesh.setMatrixAt(n, M); mesh.setColorAt(n, color); n++; return true; },
    end() { mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; mesh.visible = n > 0; },
    dispose() { mesh.removeFromParent(); mat.dispose(); },
  };
}
