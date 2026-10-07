// Character test sheet: every crew animal and raider type in every pose, drawn with the real crewArt code.
import { config } from '../../config.js';
import { createCrewArt } from './crewArt.js';
import { loadTextures } from './textureArt.js';

const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
const art = createCrewArt({ ctx });
loadTextures(ctx);
const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#b565d9', '#ff8c42', '#2ec4b6', '#ff6fa5'];
const poses = [
  ['idle', {}], ['walk', { moving: 1 }], ['sword', { carry: 'sword' }], ['ammo', { carry: 'ammo' }], ['swing', { swing: 1, carry: 'sword' }],
  ['station', { lock: 'g' }], ['climb', { climb: 1 }], ['air', { air: 1 }], ['tumble', { fly: 1, tumble: 1, rot: 1.2 }], ['KO', { ko: 5 }], ['squash', { squash: 0.8 }], ['left', { moving: 1, face: -1 }],
];
const raiders = ['grunt', 'sapper', 'brute', 'cutter'];
const q = new URLSearchParams(location.search);
const Z = Number(q.get('zoom')) || 1; // ?zoom=3&cols=4&from=0&to=2 to look closer
const cw = 130;
const rh = 135;
const allRows = [...config.CREW_SPECIES.map((s, i) => ({ species: s, color: colors[i] })), ...raiders.map((t) => ({ type: t, species: config.RAIDERS[t].species, scale: config.RAIDERS[t].scale, color: config.RAIDERS[t].color }))];
const rows = allRows.slice(Number(q.get('from')) || 0, Number(q.get('to')) || allRows.length);
const nCols = Number(q.get('cols')) || poses.length;
const drawCarry = (item, face) => {
  ctx.save();
  ctx.translate(face * 16, -24);
  ctx.fillStyle = item === 'sword' ? '#cfd0c6' : '#b5833f';
  ctx.strokeStyle = config.INK;
  ctx.lineWidth = 2.5;
  if (item === 'sword') {
    ctx.fillRect(face * 2 - 2, -40, 4, 44);
    ctx.strokeRect(face * 2 - 2, -40, 4, 44);
  } else {
    ctx.fillRect(-8, -8, 22, 16);
    ctx.strokeRect(-8, -8, 22, 16);
  }
  ctx.restore();
};
const frame = (ms) => {
  const dpr = Math.min(2, devicePixelRatio || 1) * Z;
  cv.width = nCols * cw * dpr;
  cv.height = (rows.length * rh + 30) * dpr;
  cv.style.height = (cv.clientWidth / cv.width) * cv.height + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#cfe3ea';
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = '#6b4a32';
  ctx.font = '700 14px Georgia';
  ctx.textAlign = 'center';
  poses.slice(0, nCols).forEach(([n], c) => ctx.fillText(n, c * cw + cw / 2, 18));
  rows.forEach((r, ri) => {
    const y = 30 + ri * rh + 120;
    ctx.fillStyle = 'rgba(107,74,50,.35)';
    ctx.fillRect(0, y, nCols * cw, 3);
    poses.slice(0, nCols).forEach(([n, po], c) => {
      const p = { id: 'x', name: r.type || r.species, x: c * cw + cw / 2, y, face: 1, jz: 0, ...r, ...po };
      if (po.swing) p.swingT = performance.now() - 60;
      const t = ms / 1000;
      const bob = p.moving ? Math.sin(t * 16) * 3 : 0;
      art.draw(p, t, bob, 0, drawCarry);
    });
  });
  requestAnimationFrame(frame);
};
requestAnimationFrame(frame);
