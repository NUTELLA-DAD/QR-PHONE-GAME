// THE SCRAP ECONOMY IN 3D (LOOP.md G1 / G2; config.SCRAP3D; 3D.md section 34). Two jobs, both reading the game's state and nothing else:
//   THE RIVET PLATES of the scrap patch: every segment of the frame that a crewman riveted a plate on (state.frames[i].plates, 1 to 3: host/structure.js patchWork) carries that many big steel plates bolted over the
//     edge of its deck, in front of the slab where they can be seen from the sofa (the 2D ones were small and pale: drawRivetPlate in scrapArt.js, which shipArt.js draws only in the 2D view). One Batch with its one-call
//     ink on the ship's own `content` group, so the plates ride her bob, pitch and yaw; ONE draw call for every plate of the ship, rebuilt only when the plates change.
//   THE BUNDLES: every bundle of scrap in the sky (a flotsam bundle on its chute, a hooked one), lying on a deck, and on a gunship's hulk is one instance of ONE lit mesh (three iron plates, a gold strap, with its ink
//     in the same call), each in a gold ring (ONE instanced mesh for all the rings: it was a mesh and a draw call for each). The HOLD BIN is an open slatted crate on the ship's own deck with the stowed bundles piled
//     in it, two layers of four rising over its rim (a Batch on her `content`, rebuilt only when the count changes). flyers.js keeps the chutes and the hulk and steps back from the rest while this is live.
// The picture never depends on time: nothing here moves but the mirror (the plates and the bin stand on the camera's side of the ship: the group is mirrored with the model's own `viewSide`) and a bundle's landing
// bounce, which is the sim's own `ld.t`. 3 draw calls at most (bundles, rings, bin) plus one for the plates. Drawing code never throws: update() is wrapped by the caller.
import { THREE, Batch, applyLook, toonVCInkS, plainVCInk, depthVCInk, look } from './style.js';
import { config } from '../../config.js';
import { scrapOn, holdSpot, holdCount } from '../host/scrap.js';
import { plate, buildBundleGeo, binBatch, ringGeo } from './scrapKit.js';

const fin = Number.isFinite;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function createScrap3d({ parent, state, models }) {
  const K = () => config.SCRAP3D || {};
  const stats = { plates: 0, segments: 0, bundles: 0, rings: 0, bins: 0, rebuilds: 0, ms: 0 };
  let broken = false, live = false;
  const mine = new Map(); // ship id -> { model, sig, group (the plates), binSig, bin (the bin's group) }
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V3 = new THREE.Vector3(), S3 = new THREE.Vector3(), WHITE = new THREE.Color('#ffffff');
  const root = new THREE.Group();
  root.name = 'scrap3d';
  parent.add(root);
  let bundles = null, rings = null;

  function build() {
    const cap = K().CAP || {};
    bundles = new THREE.InstancedMesh(buildBundleGeo(), toonVCInkS, cap.BUNDLES || 64);
    bundles.userData.toon = toonVCInkS; bundles.userData.plain = plainVCInk;
    bundles.customDepthMaterial = depthVCInk;
    if (!look.toon) bundles.material = plainVCInk;
    bundles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    bundles.setColorAt(0, WHITE); bundles.instanceColor.setUsage(THREE.DynamicDrawUsage);
    bundles.frustumCulled = false; bundles.castShadow = false; bundles.receiveShadow = false; bundles.count = 0; bundles.visible = false; bundles.name = 'scrapBundles';
    root.add(bundles);
    const mat = new THREE.MeshBasicMaterial({ color: (K().RING && K().RING.COLOR) || '#ffd23f', transparent: true, opacity: 0.9, depthWrite: false, forceSinglePass: true, side: THREE.DoubleSide, fog: false });
    rings = new THREE.InstancedMesh(ringGeo(), mat, cap.RINGS || 64);
    rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    rings.frustumCulled = false; rings.count = 0; rings.visible = false; rings.renderOrder = 9; rings.name = 'scrapRings';
    root.add(rings);
  }
  const dropGroup = (g) => { if (g) { g.removeFromParent(); g.traverse((o) => o.geometry && o.geometry.dispose()); } };
  function drop(rec) { dropGroup(rec.group); rec.group = null; dropGroup(rec.bin); rec.bin = null; rec.sig = rec.binSig = ''; }
  function hide() {
    live = false;
    if (bundles) { bundles.count = 0; bundles.visible = false; }
    if (rings) { rings.count = 0; rings.visible = false; }
    for (const r of mine.values()) drop(r);
    mine.clear();
    stats.plates = stats.segments = stats.bundles = stats.rings = stats.bins = 0;
  }

  function update({ t = 0 } = {}) {
    const t0 = performance.now();
    const A = K();
    if (broken || A.ENABLED === false) { hide(); return; }
    if (!bundles) { try { build(); } catch (e) { console.warn('view3d scrap build failed', e); broken = true; hide(); return; } }
    const k8 = Math.floor(t * 8);
    const seen = new Set();
    let np = 0, ns = 0, nb = 0, nr = 0, nbin = 0;
    const capB = (A.CAP && A.CAP.BUNDLES) || 64, capR = (A.CAP && A.CAP.RINGS) || 64, RS = A.RING || {};
    const bundle = (x, y, z, s, rot) => { // a bundle at a world place (y up)
      if (nb >= capB) return;
      Q.setFromAxisAngle(V3.set(0, 0, 1), rot); M4.compose(V3.set(x, y, z), Q, S3.set(s, s, s));
      bundles.setMatrixAt(nb, M4); bundles.setColorAt(nb, WHITE); nb++;
    };
    const ring = (x, y, z, r) => {
      if (nr >= capR) return;
      M4.compose(V3.set(x, y, z), Q.identity(), S3.set(r, r, 1));
      rings.setMatrixAt(nr, M4); nr++;
    };
    const ringR = (RS.R || 44) + (k8 & 1) * (RS.PULSE == null ? 3 : RS.PULSE); // (the flotsam's ring swells a few px on the 8 fps key)

    // -- bundles in the sky: on a chute, on a hookshot's line, tumbling
    for (const it of state.thrown || []) {
      if (!it || it.kind !== 'scrap' || !fin(it.x) || !fin(it.y)) continue;
      bundle(it.x, -it.y, 0, 1.2, -(fin(it.rot) ? it.rot : 0));
      if (!it.ghost) ring(it.x, -(it.y - 4), 40, ringR); // (a bundle shovelled off a deck falls away with no ring: nobody can catch it)
    }
    // -- bundles on a gunship's hulk
    for (const h of state.hulks || []) {
      if (!h || !fin(h.x) || !fin(h.y)) continue;
      for (let k = 0; k < (h.left | 0); k++) bundle(h.x - 70 + k * 44, -(h.y - 56 - (k % 2) * 14), 12, 1.35, -((k % 3) - 1) * 0.12);
    }

    // -- on the ships: the plates, bundles lying on the decks, the hold bin
    for (const sh of state.ships || []) {
      const e = sh && !sh.ai && !sh.piece && models && models.get(sh.id);
      if (!e || !e.model || !e.model.content || !sh.layout) continue;
      const model = e.model, X = model.X || ((x) => x), Y = model.Y || ((y) => -y), MW = model.content.matrixWorld, ctx = sh.ctx || {};
      const side = (model.viewSide || 1) >= 0 ? 1 : -1;
      seen.add(sh.id);
      let rec = mine.get(sh.id);
      if (!rec) mine.set(sh.id, (rec = { model: null, sig: '', group: null, binSig: '', bin: null }));
      if (rec.model !== model) { drop(rec); rec.model = model; }

      // the plates of the scrap patch (the co-op ship's frame, state.frames)
      const frames = sh === state.ships[0] ? (state.frames || []).filter((g) => g && g.plates > 0 && !g.nest && fin(g.x) && sh.layout.platforms[g.d]) : [];
      const sig = frames.map((g) => g.d + ':' + Math.round(g.x) + ':' + (g.plates | 0)).join('|');
      if (rec.sig !== sig) {
        dropGroup(rec.group); rec.group = null; rec.sig = sig;
        if (frames.length) {
          try {
            const B = new Batch(), PL = A.PLATE || {}, W = PL.W || [100, 86, 72], H = PL.H || 40, gap = PL.GAP || 7;
            for (const g of frames) {
              const q = sh.layout.platforms[g.d], n = Math.min(3, g.plates | 0), w = W[n - 1] || 74;
              const zh = model.ctx && model.ctx.zHalfAt ? model.ctx.zHalfAt(g.d, g.x) : 120; // (the deck's front edge: the camera side, mirrored below)
              const top = q.y + (PL.TOP == null ? -2 : PL.TOP), yc = Y(top + H / 2);
              for (let k = 0; k < n; k++) plate(B, A, X(g.x + (k - (n - 1) / 2) * (w + gap)), yc + ((k % 2) ? -1.5 : 1.5), zh + (PL.OUT == null ? 3 : PL.OUT), w, ((k % 3) - 1) * 0.018);
            }
            const group = B.build({ cast: false, receive: false, one: true, small: false });
            group.name = 'scrapPlates';
            group.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
            model.content.add(group);
            applyLook(group);
            rec.group = group;
            stats.rebuilds++;
          } catch (err) { console.warn('view3d scrap plates failed', err); dropGroup(rec.group); rec.group = null; broken = true; hide(); return; }
        }
      }
      if (rec.group) rec.group.scale.z = side; // (on the near side whichever way she faces)
      for (const g of frames) { np += Math.min(3, g.plates | 0); ns++; }

      if (!scrapOn()) { dropGroup(rec.bin); rec.bin = null; rec.binSig = ''; continue; }

      // bundles lying on a deck, piled where they landed (the 2D layout: shipArt.js liveLoads), each in its gold ring
      const stack = {};
      for (const ld of ctx.loads || []) {
        const pl = ld && ld.kind === 'scrap' && sh.layout.platforms[ld.d];
        if (!pl || !fin(ld.x)) continue;
        const key = ld.d + ':' + Math.round(ld.x / 30), n = (stack[key] = (stack[key] || 0) + 1) - 1;
        const drop_ = Math.max(0, 1 - (fin(ld.t) ? ld.t : 9) * 5) * 24; // (it lands with a bounce: the sim's own clock)
        const lx = X(ld.x + (n % 2) * 14 - 7), ly = Y(pl.y - n * 17 - 15 - drop_);
        M4.compose(V3.set(lx, ly, side * 84), Q.identity(), S3.set(1.15, 1.15, 1.15)).premultiply(MW);
        if (nb < capB) { bundles.setMatrixAt(nb, M4); bundles.setColorAt(nb, WHITE); nb++; }
        M4.compose(V3.set(lx, ly - 1, side * 118), Q.identity(), S3.set(30, 30, 1)).premultiply(MW);
        if (nr < capR) { rings.setMatrixAt(nr, M4); nr++; }
      }

      // the hold bin with what is stowed in it
      const sp = holdSpot(sh.layout), pl = sp && sh.layout.platforms[sp.d], count = holdCount(ctx);
      if (pl) {
        const binSig = String(count) + ':' + sp.d + ':' + Math.round(sp.x);
        if (rec.binSig !== binSig || !rec.bin) {
          dropGroup(rec.bin); rec.bin = null; rec.binSig = binSig;
          try {
            const B = new Batch();
            binBatch(B, count, config.SCRAP.HOLD_CAP || 8);
            const group = B.build({ cast: false, receive: false, one: true, small: false });
            group.name = 'scrapBin';
            group.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
            model.content.add(group);
            applyLook(group);
            rec.bin = group;
            stats.rebuilds++;
          } catch (err) { console.warn('view3d scrap bin failed', err); dropGroup(rec.bin); rec.bin = null; broken = true; hide(); return; }
        }
        if (rec.bin) { rec.bin.position.set(X(sp.x), Y(pl.y), side * 80); rec.bin.scale.z = side; nbin++; }
      }
    }
    for (const [id, r] of mine) if (!seen.has(id)) { drop(r); mine.delete(id); }
    bundles.count = nb; bundles.visible = nb > 0; bundles.instanceMatrix.needsUpdate = true; if (bundles.instanceColor) bundles.instanceColor.needsUpdate = true;
    rings.count = nr; rings.visible = nr > 0; rings.instanceMatrix.needsUpdate = true;
    live = true;
    stats.plates = np; stats.segments = ns; stats.bundles = nb; stats.rings = nr; stats.bins = nbin; stats.ms = performance.now() - t0;
    void clamp;
  }

  return {
    update, stats, root,
    get live() { return live; }, // (flyers.js leaves the sky's bundles, their rings and the deck bundles to this while it is true)
    dispose() { hide(); for (const m of [bundles, rings]) if (m) { m.removeFromParent(); m.geometry.dispose(); } root.removeFromParent(); },
  };
}
