// The lighting rig, one per environment (3D.md section 1): a warm KEY directional light from the top left (the Ember Forge is lit from below; Fungal and Storm have no key at all, the
// lamps, searchlights and lightning do it), one HEMISPHERE fill with the world's sky / ground colours, and fog. Only the key casts shadows, and its shadow camera is fitted to the framed ships
// and snapped to 200 world units, so the shadows never swim. The day / dusk / night darkness (darkTarget, via world.setTod) still decides how bright it all is, so caves and dark skies go dark.
// The numbers live in config.LOOK3D (per environment) and config.ENVIRONMENTS (sun, fog, rock, cave colours).
import { THREE, look, fx } from './style.js';
import { config } from '../../config.js';

// day -> dusk -> night presets (bg = the clear colour, sky = what the painted sky picture is multiplied by, hemi = [sky, ground, strength], sun = [colour, strength, direction toward the sun]).
export const TOD = {
  day: { bg: '#cfe3ea', sky: '#ffffff', hemi: ['#eef5f7', '#b49a78', 1.4], sun: ['#fff3d6', 2.35, [-0.55, 0.85, 0.75]], night: 0, cave: 0.75 },
  dusk: { bg: '#c98f78', sky: '#f2b99a', hemi: ['#c4a6b8', '#6a525a', 1.0], sun: ['#ffc59a', 2.1, [-1.0, 0.32, 0.7]], night: 0.35, cave: 0.5 },
  night: { bg: '#0a0f1e', sky: '#2a3354', hemi: ['#3a4c86', '#1a1f34', 0.95], sun: ['#8fa2dc', 0.75, [-0.4, 0.9, 0.6]], night: 1, cave: 0.3 },
};

const SNAP = 200;
const snap = (v, q = SNAP) => Math.round(v / q) * q;
const snapUp = (v, q = SNAP) => Math.ceil(v / q) * q;
const rgbHex = (s, fallback) => { const p = String(s || '').split(',').map(Number); return p.length === 3 && p.every(Number.isFinite) ? '#' + new THREE.Color(p[0] / 255, p[1] / 255, p[2] / 255).getHexString() : fallback; };
const mixC = (out, a, b, k) => out.set(a).lerp(_c.set(b), Math.max(0, Math.min(1, k)));
const _c = new THREE.Color(), _v = new THREE.Vector3();

// The rig of an environment (config.LOOK3D.<env>), with the colours it does not name filled in from config.ENVIRONMENTS.<env>.
export function rigFor(envId) {
  const L3 = (config.LOOK3D && config.LOOK3D[envId]) || (config.LOOK3D && config.LOOK3D.skyisles) || {};
  const E = (config.ENVIRONMENTS && config.ENVIRONMENTS[envId]) || {};
  const key = L3.key || {};
  const strength = key.strength == null ? 1 : key.strength;
  return {
    id: envId,
    key: { on: strength > 0, strength, color: key.color || rgbHex(E.sun, '#fff3d6'), dir: key.dir || null, shadows: key.shadows !== false },
    hemi: { sky: (L3.hemi && L3.hemi.sky) || '#eef5f7', ground: (L3.hemi && L3.hemi.ground) || '#b49a78', strength: L3.hemi && L3.hemi.strength != null ? L3.hemi.strength : 1 },
    haze: L3.haze || rgbHex(E.fog, (config.PALETTE && config.PALETTE.haze) || '#e6ecea'),
    hazeAmt: L3.hazeAmt == null ? 0.05 : L3.hazeAmt,
    caveColor: (E.cave && E.cave[0]) || '#1c2230',
    exposure: L3.exposure == null ? 1 : L3.exposure,
    grade: { shadow: '#5a6c9c', shadowAmt: 0.1, high: '#ffe8c0', highAmt: 0.08, sat: 1, contrast: 0.08, lift: 0, ...(L3.grade || {}) },
    bloom: L3.bloom == null ? 0.55 : L3.bloom,
    vignette: L3.vignette == null ? 0.16 : L3.vignette,
    rim: { color: (L3.rim && L3.rim.color) || '#ffd9a8', amount: L3.rim && L3.rim.amount != null ? L3.rim.amount : 0.16 },
    // WP3 DARKNESS. floor = how much of the dark-blue sky colour the rock keeps even in the dark (0.12 default). cave = how dark a cave is in 3D (0..1; the 2D game's SEARCHLIGHT.DARK.CAVE is 0, the owner wants the 3D caves darker), hemi = the ambient strength at full gloom,
    // sky / ground = its dark-blue floor colours, key = the key light's share left at full gloom. from / to = the darkness (0..1) where the gloom starts and is complete.
    dark: { cave: 0.66, hemi: 0.34, sky: '#34447a', ground: '#141a2c', key: 0.1, from: 0.12, to: 0.72, ...(L3.dark || {}) },
    cap: { color: '#8fa65e', amount: 0.9, ...(L3.cap || {}) }, // (terrain.js: the moss / snow on top of the rock)
    clouds: { n: 14, front: 3, alpha: 0.95, tint: '#ffffff', ...(L3.clouds || {}) }, // (clouds.js)
    water: { deep: '#5b93a6', shallow: '#80bcc4', foam: '#f4fbfa', speed: 26, ...(L3.water || {}) }, // (water.js)
  };
}

export function createLights(scene) {
  const hemi = new THREE.HemisphereLight('#ffffff', '#888888', 1);
  const sun = new THREE.DirectionalLight('#ffffff', 2);
  sun.castShadow = true;
  sun.shadow.camera.left = -2150; sun.shadow.camera.right = 2150; sun.shadow.camera.top = 1500; sun.shadow.camera.bottom = -1500;
  sun.shadow.camera.near = 100; sun.shadow.camera.far = 9000;
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 14;
  sun.shadow.mapSize.set(4096, 4096); sun.shadow.radius = 2.5;
  sun.target = new THREE.Object3D();
  scene.add(hemi, sun, sun.target);
  const fog = new THREE.FogExp2('#e6ecea', 0.00002); // (always present, so toggling it never recompiles a material: the density goes to 0 instead)
  scene.fog = fog;

  const L = { hemi, sun, fog, sunDir: new THREE.Vector3(-0.5, 0.8, 0.7).normalize(), rig: rigFor('skyisles'), tier: null, haveKey: true, shadowsOn: true, exposure: 1, night: 0, gloom: 0, cave: false, hazeAmt: 0.05, half: { x: 2150, y: 1500 }, mid: { x: 0, y: 0 } };

  // Everything that depends on the environment, the darkness (tod = a world.js preset blend) and the cave flag.
  L.apply = (tod, envId, cave) => {
    if (!L.rig || L.rig.id !== envId) L.rig = rigFor(envId);
    const rig = L.rig, dk = rig.dark;
    // THE DARKNESS: how dark the sky is (the game's darkTarget, via tod.night), and a cave is never lighter than rig.dark.cave. The gloom (0..1) then drops the ambient to a dark-blue floor, so
    // what the lamps, the boiler and the beams do not touch reads as a near-black silhouette. ?look=nodark puts the old day-lit caves back.
    const n = look.dark ? Math.max(tod.night, cave ? dk.cave : 0) : tod.night, k = cave ? tod.cave : 1;
    let g = look.dark ? Math.max(0, Math.min(1, (n - dk.from) / Math.max(0.01, dk.to - dk.from))) : 0;
    if (g > 0 && (!look.lanterns || (L.tier && L.tier.lanterns === 0))) g *= 0.5; // (no real lamps on this tier: the lamps do not light the decks, so the dark must not be total)
    L.night = n; L.cave = !!cave; L.gloom = g;
    const w = 0.7 * (1 - 0.5 * n); // how much of the world's own colour replaces the day / night preset
    mixC(hemi.color, tod.hemi[0], rig.hemi.sky, w);
    mixC(hemi.groundColor, tod.hemi[1], rig.hemi.ground, w);
    hemi.intensity = tod.hemi[2] * rig.hemi.strength * (look.toon ? 1 : 1.1) * (cave ? Math.max(tod.cave, 0.35) + 0.2 * (1 - n) : 1);
    if (g > 0) { // the dark-blue floor
      hemi.color.lerp(_c.set(dk.sky), g);
      hemi.groundColor.lerp(_c.set(dk.ground), g);
      hemi.intensity += (dk.hemi - hemi.intensity) * g;
    }
    fx.uFloor.value.set(dk.sky).multiplyScalar(g * (dk.floor == null ? 0.12 : dk.floor));
    L.haveKey = rig.key.on;
    mixC(sun.color, tod.sun[0], rig.key.color, w);
    sun.intensity = rig.key.on ? tod.sun[1] * rig.key.strength * k * (1 - g * (1 - dk.key)) : 0;
    const d = rig.key.dir || tod.sun[2];
    L.sunDir.set(d[0], d[1], d[2]).normalize();
    sun.position.copy(L.sunDir).multiplyScalar(3800).add(sun.target.position);
    L.shadowsOn = look.shadows && !!(L.tier ? L.tier.shadows : true) && rig.key.on && rig.key.shadows && n < 0.8;
    sun.castShadow = L.shadowsOn;
    // the toon rim: warm, on the side the key comes from; weaker in the dark
    fx.uRimColor.value.set(rig.rim.color);
    fx.uRimAmt.value = look.rim ? rig.rim.amount * (1 - 0.5 * n) * (cave ? 0.7 : 1) * (1 - 0.8 * g) : 0; // (in the dark the thin rim fades too: a flat additive tone would out-shine the faint silhouettes)
    fx.uRimDir.value.copy(rig.key.on ? L.sunDir : _v.set(-0.4, 0.6, 0.6).normalize());
    // fog: the haze colour darkens with the night; a cave fades into its own dark rock colour
    const bright = 1 - 0.72 * n;
    fog.color.set(rig.haze);
    if (cave) fog.color.lerp(_c.set(rig.caveColor), 0.7);
    fog.color.multiplyScalar(bright * (cave ? 0.8 : 1));
    L.hazeAmt = rig.hazeAmt * (cave ? 1.4 : 1);
    L.exposure = rig.exposure;
    fx.uExposure.value = rig.exposure;
    L.hemiBase = hemi.intensity; hemi.intensity += L.flashAdd; // (WP10: a lightning flash adds ambient light on top of whatever the darkness left)
  };
  // WP10: the lightning flash (lightning.js sets it every frame, stepped): extra ambient light, 0 = none
  L.flashAdd = 0; L.hemiBase = 1;
  L.setFlash = (amt) => { if (amt === L.flashAdd) return; L.flashAdd = amt; hemi.intensity = L.hemiBase + amt; };

  // Fog strength: the same share of the picture at the ship plane at any zoom (D = camera distance), and more and more behind it.
  L.setFogDistance = (D) => {
    const amt = look.fog ? Math.min(0.6, Math.max(0, L.hazeAmt)) : 0;
    fog.density = amt > 0 ? Math.sqrt(-Math.log(1 - amt)) / Math.max(200, D) : 0;
  };

  L.setTier = (tier) => {
    L.tier = tier;
    if (sun.shadow.mapSize.x !== tier.shadowSize) { sun.shadow.mapSize.set(tier.shadowSize, tier.shadowSize); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  };

  // Fit the key's shadow camera to the framed ships and snap it: centre and size move in steps of 200 world units (400 for the size), so nothing swims as the ships fly.
  // pts = [{x, y}] 3D positions of the ships (their reference points); cam = the camera's look-at point. Called every frame.
  L.fit = (pts, cam) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue; x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    if (!(x1 >= x0)) { x0 = x1 = cam.x; y0 = y1 = cam.y; }
    const cx = snap((x0 + x1) / 2), cy = snap((y0 + y1) / 2);
    const hx = Math.min(5200, snapUp((x1 - x0) / 2 + 1700, 400)), hy = Math.min(3600, snapUp((y1 - y0) / 2 + 1500, 400));
    sun.target.position.set(cx, cy, 0);
    sun.position.copy(L.sunDir).multiplyScalar(3800).add(sun.target.position);
    const c = sun.shadow.camera;
    if (c.right !== hx || c.top !== hy) { c.left = -hx; c.right = hx; c.top = hy; c.bottom = -hy; c.updateProjectionMatrix(); }
    L.half.x = hx; L.half.y = hy; L.mid.x = cx; L.mid.y = cy;
  };
  return L;
}
