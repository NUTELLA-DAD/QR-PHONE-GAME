// THE OUTPOSTS' TREASURE IN 3D (CASTLE.md package A2 drew it as flat shapes on the HUD; this is its real look; config.TREASURE3D, 3D.md section 34). It reads state.away.tre (host/treasure.js: vaults, chests) and
// state.chestHold (the chests stowed in the ship's hold), nothing else, and draws:
//   THE VAULT     a stone strongroom with a pitched slab roof and an iron door that swings open in 7 held steps on the sim's own clock (`tre.clock - vault.openAt`), with a puff of dust, sparks and a gold flash when
//                 it opens, gold bars in the doorway while chests are left in it. One Batch (one call, with its ink), rebuilt only when a door step or the loot changes.
//   THE CHESTS    every chest lying on the ground, hauled on the hookshot's line, carried by a PAIR (between the two men) and stacked in the ship's hold behind the bin: one instanced mesh (the picture and its ink in one
//                 call); a sack of gold is another (1 call). A chest lifts a little as its bar fills, and glints (a lighter tint) on the 8 fps key. A chest in ONE man's arms is the crew layer's own item (crewParts.js
//                 `chest`, `goldsack`), a pair's is `chestpair` (arms up, nothing in them: the chest here hangs between them): `rec(p)` maps a carrier's record.
// Open-sky maps only (the sim makes no vaults anywhere else). The words VAULT x3, CHEST, the grab bar and TWO CARRY stay on the HUD (treasureArt.js, `live` tells it to leave the shapes out). 3 calls at most (vault,
// chests, sacks); the particles are the vfx's own. Everything stands in the flat map frame (x = the game's x, y up = -y, z toward the viewer). Nothing is a sine of time: steps are keys. Drawing code never throws:
// update() is wrapped by the caller, and a failed build leaves the HUD shapes in place.
import { THREE, Batch, toonVCInkS, plainVCInk, depthVCInk, look } from './style.js';
import { config } from '../../config.js';
import { buildChestGeo, buildSackGeo, vault as vaultModel, COLS } from './treasureKit.js';
import { holdSpot } from '../host/scrap.js';

const fin = Number.isFinite;
const SLOTS = [[1, 0], [-1, 0], [1, 1], [-1, 1], [0, 1], [0, 2]]; // where the n-th chest of the hold lies: [column beside the bin (0 = on top of it), layer]: a pile on each side of the bin first, so the bin and its bundles stay in view
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function createTreasure3d({ parent, state, models, P }) {
  const K = () => config.TREASURE3D || {};
  const getP = () => { try { return typeof P === 'function' ? P() : P; } catch { return null; } };
  const root = new THREE.Group();
  root.name = 'treasure3d';
  root.visible = false;
  parent.add(root);
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V3 = new THREE.Vector3(), S3 = new THREE.Vector3(), CO = new THREE.Color(), WHITE = new THREE.Color('#ffffff'), GLINT = new THREE.Color(1.16, 1.12, 1.0);
  const stats = { chests: 0, sacks: 0, vaults: 0, hold: 0, rebuilds: 0, ms: 0 };
  let broken = false, live = false, wasOn = false, sig = '', lastT = null;
  let chests = null, sacks = null, vaultGroup = null;
  const opened = new Set(); // vaults whose opening burst has been played (per tre record)

  function mk(geo, cap, name) {
    const m = new THREE.InstancedMesh(geo, toonVCInkS, cap);
    m.userData.toon = toonVCInkS; m.userData.plain = plainVCInk;
    m.customDepthMaterial = depthVCInk;
    if (!look.toon) m.material = plainVCInk;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.setColorAt(0, WHITE); m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; m.count = 0; m.visible = false; m.name = name;
    root.add(m);
    return m;
  }
  function build() {
    const cap = K().CAP || {};
    chests = mk(buildChestGeo(COLS()), cap.CHESTS || 24, 'treasureChests');
    sacks = mk(buildSackGeo(COLS()), cap.SACKS || 12, 'treasureSacks');
  }
  function dropVault() {
    if (vaultGroup) { vaultGroup.removeFromParent(); vaultGroup.traverse((o) => o.geometry && o.geometry.dispose()); vaultGroup = null; }
  }
  function hide() {
    root.visible = false; live = false;
    for (const m of [chests, sacks]) if (m) { m.count = 0; m.visible = false; }
    dropVault(); sig = '';
  }

  // A chest's record for the crew layer: a sack of gold in his arms is `goldsack`, one half of a pair carrying is `chestpair` (the chest itself is drawn between them), anything else `chest` (crew.js knows it).
  function rec(p) {
    if (!p || p.carry !== 'chest') return p;
    const T = state.away && state.away.tre;
    const c = T && T.chests ? T.chests.find((q) => q.by && q.by.includes(p.id) && (q.state === 'carried' || q.state === 'aboard')) : null;
    if (!c) return p;
    const carry = c.kind === 'gold' ? 'goldsack' : c.by.length > 1 && c.state === 'carried' ? 'chestpair' : 'chest';
    return carry === 'chest' ? p : { ...p, carry };
  }

  function update({ t = 0, dt = 0.016, night = 0, tier = null }) {
    const t0 = performance.now();
    const S = state.away, T = S && S.tre, A = K();
    if (broken || A.ENABLED === false || !S || !S.on || !T || !T.on) { if (wasOn) { wasOn = false; hide(); } live = false; return; }
    if (!chests) { try { build(); } catch (e) { console.warn('view3d treasure build failed', e); broken = true; hide(); return; } }
    if (T !== lastT) { lastT = T; opened.clear(); sig = ''; }
    wasOn = true; root.visible = true; live = true;
    const Z = A.Z || {}, k8 = Math.floor(t * 8), CC = A.COL || {};
    const Pt = getP(), vfx = look.vfx !== false && !!Pt;
    const rx = S.rope && fin(S.rope.x) ? S.rope.x : 0, SHOW = (config.AWAY.TREASURE && config.AWAY.TREASURE.SHOW) || 3600;
    const left = (v) => T.chests.filter((c) => c.vault === v.k && (c.state === 'ground' || c.state === 'carried' || c.state === 'hauled')).length;

    // -- the vaults: a batch rebuilt only when a door step or the loot changes
    const parts = [], list = [];
    const DOOR = A.DOOR || [0, 1];
    for (const v of T.vaults) {
      if (v.state !== 'open' || !fin(v.x) || !fin(v.y) || Math.abs(v.x - rx) > SHOW) continue;
      const step = clamp(Math.floor(Math.max(0, T.clock - (v.openAt || 0)) * 8), 0, DOOR.length - 1), loot = left(v) > 0;
      parts.push(v.k + ':' + step + ':' + (loot ? 1 : 0) + ':' + Math.round(v.x) + ':' + Math.round(v.y));
      list.push({ v, step, loot });
      if (vfx && !opened.has(v.k) && T.clock - (v.openAt || 0) < 2.5 && step >= 2) { // the door is flung open: dust, a gold flash and sparks (once)
        opened.add(v.k);
        const x = v.x - 40, y = -v.y + 70, z = (Z.VAULT == null ? -36 : Z.VAULT) + 70;
        Pt.burst('smoke', x, y - 10, z, 6, { size: [50, 90], size1: 2.2, life: [0.8, 1.4], color: '#cfc4b0', alpha: 0.7, speed: [10, 60], up: [20, 70], area: 60 });
        Pt.spawn('flash', v.x, y, z + 4, { size: 260, life: 0.13, size1: 1, color: CC.GOLD || '#ffd23f', hdr: 1.2, alpha: 0.7 });
        Pt.burst('spark', v.x, y - 20, z + 6, 12, { speed: [60, 260], life: [0.4, 0.9], size: [4, 8], color: '#ffd23f', up: [40, 160] });
      }
    }
    const newSig = parts.join('|');
    if (newSig !== sig) {
      sig = newSig;
      dropVault();
      try {
        const B = new Batch(), z = Z.VAULT == null ? -36 : Z.VAULT;
        for (const it of list) vaultModel(B, CC, it.v.x, -it.v.y, z, DOOR[it.step], it.loot);
        if (!B.empty) {
          vaultGroup = B.build({ cast: false, receive: false, one: true, small: false });
          vaultGroup.name = 'treasureVault';
          vaultGroup.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
          root.add(vaultGroup);
        }
        stats.rebuilds++;
      } catch (e) { console.warn('view3d treasure vault failed', e); dropVault(); broken = true; hide(); return; }
    }
    stats.vaults = list.length;

    // -- the chests and sacks
    let nc = 0, ns = 0;
    const capC = (A.CAP && A.CAP.CHESTS) || 24, capS = (A.CAP && A.CAP.SACKS) || 12;
    const put = (gold, x, y, z, s, col) => { // a thing standing at (x, y up, z) facing the viewer
      const m = gold ? sacks : chests, i = gold ? ns : nc;
      if (i >= (gold ? capS : capC)) return;
      M4.compose(V3.set(x, y, z), Q.identity(), S3.set(s, s, s));
      m.setMatrixAt(i, M4); m.setColorAt(i, col);
      if (gold) ns++; else nc++;
    };
    const SZ = A.SIZE || 1, SK = A.SACK || 1, glint = (k8 & 4) !== 0;
    for (const c of T.chests) {
      if (!fin(c.x) || !fin(c.y)) continue;
      const gold = c.kind === 'gold', s = (gold ? SK : SZ);
      if (c.state === 'ground') {
        const lift = Math.floor(clamp(c.prog || 0, 0, 1) * 8) / 8 * (A.LIFT == null ? 14 : A.LIFT); // (the bar fills: it comes up off the ground in steps)
        put(gold, c.x, -c.y + lift, Z.CHEST == null ? 40 : Z.CHEST, s, glint ? GLINT : WHITE);
      } else if (c.state === 'hauled') { // on the hookshot's line: it hangs a little below the hook, glinting
        put(gold, c.x, -(c.y + 26), Z.CHEST == null ? 40 : Z.CHEST, s * 0.8, GLINT);
      } else if (c.state === 'carried' && !gold && c.by && c.by.length > 1) { // two men carry it between them (each has his arms up: rec() above)
        put(false, c.x, -c.y + 52, Z.PAIR == null ? 96 : Z.PAIR, SZ * 0.8, WHITE);
      }
    }
    // the chests stowed in the hold: stacked behind the hold bin on the ship's own deck, turned and tilted with her
    const sh = state.ships && state.ships[0], hold = state.chestHold, e = sh && models && models.get(sh.id);
    stats.hold = 0;
    if (e && hold && hold.list && hold.list.length && sh.layout) {
      const sp = holdSpot(sh.layout), pl = sp && sh.layout.platforms[sp.d], H = A.HOLD || {};
      if (pl && e.model && e.model.content) {
        const side = (e.model.viewSide || 1) >= 0 ? 1 : -1, hs = H.SIZE || 0.78, gap = H.GAP || 76, row = H.ROW || 41, behind = H.BEHIND == null ? 80 : H.BEHIND, rim = H.RIM == null ? 40 : H.RIM;
        const X = e.model.X || ((x) => x), Y = e.model.Y || ((y) => -y), MW = e.model.content.matrixWorld;
        hold.list.slice(0, 6).forEach((c, i) => {
          const gold = c && c.kind === 'gold', m = gold ? sacks : chests, n = gold ? ns : nc;
          if (n >= (gold ? capS : capC)) return;
          const [col, lay] = SLOTS[i]; // (beside the bin, then on top of it: the bin's own crate and bundles are scrap3d.js)
          M4.compose(V3.set(X(sp.x) + col * gap, Y(pl.y) + (col ? lay * row : rim + (lay - 1) * row), side * behind), Q.identity(), S3.set(hs * (gold ? SK : 1), hs * (gold ? SK : 1), hs * (gold ? SK : 1)));
          M4.premultiply(MW);
          m.setMatrixAt(n, M4); m.setColorAt(n, WHITE);
          if (gold) ns++; else nc++;
          stats.hold++;
        });
      }
    }
    for (const [m, n] of [[chests, nc], [sacks, ns]]) { m.count = n; m.visible = n > 0; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    stats.chests = nc; stats.sacks = ns;
    root.updateMatrixWorld(true);
    stats.ms = performance.now() - t0;
    void dt; void night; void tier;
  }

  return {
    update, rec, stats, root,
    get live() { return live; },
    dispose() { dropVault(); for (const m of [chests, sacks]) if (m) { m.removeFromParent(); m.geometry.dispose(); } },
  };
}
