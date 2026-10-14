// THE ISLAND TITAN'S STONE (3D.md section 38): the paintings the colossus is wrapped in, made once with Canvas 2D (a seeded generator, so it is always the same Titan). No files, nothing from the internet.
//   paintTitanStone(P)  a TILING weathered-stone texture (soft grey with speckle, faint strata, dark cracks) in one 512 px tile: the model's rocks take it by box mapping (titanModel.js stoneUV), repeated. A small square
//                       in it (the swatch, where creatureKit.js SWATCH points) is the plain average grey: the flat-coloured pieces (crystal, grass, teeth) point there and are not speckled.
//   its GLOW twin       black but for a few thin cyan veins that run along some of the cracks (the toon material's emissive map: the view sets how brightly they glow).
// The stone is light and low in contrast on purpose: the colours come from the vertices, the texture only roughens them.
import { THREE } from './style.js';
import { rngOf } from './creatureKit.js';

const SIZE = 512, TILE_PX = 2600; // (one tile covers this many world px: the rocks are huge)
export { TILE_PX };
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const tex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true; t.needsUpdate = true; return t; };
const wrapped = (g, fn) => { for (const ox of [-SIZE, 0, SIZE]) for (const oy of [-SIZE, 0, SIZE]) { g.save(); g.translate(ox, oy); fn(); g.restore(); } };

// the crack lines (shared by the stone and its glow twin, so the veins lie in the cracks): [points] each
function crackSet(R) {
  const out = [];
  for (let i = 0; i < 9; i++) {
    let x = R() * SIZE, y = R() * SIZE, a = R() * Math.PI * 2;
    const pts = [[x, y]], n = 5 + Math.floor(R() * 5);
    for (let k = 0; k < n; k++) { a += (R() - 0.5) * 1.3; const l = 22 + R() * 38; x += Math.cos(a) * l; y += Math.sin(a) * l; pts.push([x, y]); }
    out.push({ pts, vein: i % 3 === 0 });
  }
  return out;
}

export function paintTitanStone(P, seed = 31) {
  const R = rngOf(seed), c = canvas(SIZE, SIZE), g = c.getContext('2d'), gc = canvas(SIZE, SIZE), gg = gc.getContext('2d');
  g.fillStyle = '#ece9e2'; g.fillRect(0, 0, SIZE, SIZE);
  gg.fillStyle = '#000000'; gg.fillRect(0, 0, SIZE, SIZE);
  // strata: a few long faint bands, slightly wavy, that wrap
  for (let i = 0; i < 7; i++) {
    const y = R() * SIZE, h = 6 + R() * 22, shade = R() < 0.5 ? 'rgba(120,112,98,0.16)' : 'rgba(255,255,250,0.2)';
    g.fillStyle = shade;
    wrapped(g, () => { g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= SIZE; x += 64) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 7); for (let x = SIZE; x >= 0; x -= 64) g.lineTo(x, y + h + Math.sin(x * 0.03 + i + 1) * 6); g.closePath(); g.fill(); });
  }
  // speckle: little dark and pale blots
  for (let i = 0; i < 520; i++) {
    const x = R() * SIZE, y = R() * SIZE, r = 1.5 + R() * R() * 9, dark = R() < 0.62;
    g.fillStyle = dark ? 'rgba(96,90,80,' + (0.1 + R() * 0.22) + ')' : 'rgba(255,255,250,' + (0.14 + R() * 0.25) + ')';
    wrapped(g, () => { g.beginPath(); g.ellipse(x, y, r, r * (0.6 + R() * 0.6), R() * 3, 0, Math.PI * 2); g.fill(); });
  }
  // cracks (dark) and the veins (cyan in the glow twin, with a soft halo)
  const cracks = crackSet(R);
  g.lineCap = 'round'; g.lineJoin = 'round'; gg.lineCap = 'round'; gg.lineJoin = 'round';
  for (const cr of cracks) {
    const path = (ctx) => { ctx.beginPath(); cr.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); };
    wrapped(g, () => { path(g); g.strokeStyle = 'rgba(70,64,56,0.55)'; g.lineWidth = 3.2; g.stroke(); });
    if (cr.vein) wrapped(gg, () => {
      path(gg); gg.strokeStyle = 'rgba(70,190,230,0.22)'; gg.lineWidth = 11; gg.stroke();
      path(gg); gg.strokeStyle = 'rgba(150,235,255,0.7)'; gg.lineWidth = 3.2; gg.stroke();
    });
  }
  // the swatch: a plain square at (0.75, 0.8125) of the tile (creatureKit.js SWATCH), the average colour of the rest
  g.fillStyle = '#ece9e2';
  g.fillRect(SIZE * 0.75 - 16, SIZE * 0.8125 - 16, 32, 32);
  gg.fillStyle = '#000000';
  gg.fillRect(SIZE * 0.75 - 16, SIZE * 0.8125 - 16, 32, 32);
  void P;
  return { map: tex(c), glow: tex(gc) };
}

// a 4 px stand-in for the tube skin the generic view makes (the Titan has no tubes)
export function paintBlank(color = '#ffffff') {
  const c = canvas(4, 4), g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, 4, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
