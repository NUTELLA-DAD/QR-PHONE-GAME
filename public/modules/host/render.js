import { config } from '../../config.js';
import { SHIP_LAYOUT } from '../../shipLayout.js';
import { createShipArt } from './shipArt.js';
import { createThreatArt } from './threatArt.js';
import { installLineBoil, setBoilTime, createFilmLook } from './style.js';
import { createSprites } from './sprites.js';
import { createCharacterArt } from './characterArt.js';
import { createCourseArt } from './courseArt.js';
import { UPGRADES } from './upgrades.js';
import { targets } from './aim.js';
import { createSpecialsArt } from './specialsArt.js';

export function createRenderer({ ctx, state, canvas }) {
  // Real art from art/sprites/ where it exists; placeholder drawings everywhere else.
  const sprites = createSprites();
  sprites.load();
  // Placeholder tool in a sprite character's hand (drawCarry draws relative to the body).
  const drawItemAt = (item, x, y, swingAge) => {
    ctx.save();
    ctx.translate(x - 16, y + 24);
    drawCarry(item, 1, swingAge);
    ctx.restore();
  };
  const characterArt = createCharacterArt({ ctx, sprites, drawItem: (...a) => drawItemAt(...a) });
  const ink = () => {
    ctx.strokeStyle = config.INK;
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
  };

  const rrect = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  };

  const drawShip = createShipArt({ ctx, state, ink, rrect, sprites });
  const threatArt = createThreatArt({ ctx, state, ink, sprites });
  const courseArt = createCourseArt({ ctx, state, ink, sprites });
  const drawSpecials = createSpecialsArt({ ctx, state, ink });
  installLineBoil(ctx);
  const filmLook = createFilmLook(ctx);

  const drawGuns = () => {
    for (const [name, gun] of Object.entries(state.GUNS)) {
      // While someone is on the gun, show the arc it can turn through.
      if (Object.values(state.players).some((p) => p.lock === name)) {
        ctx.fillStyle = 'rgba(255,240,180,.18)';
        ctx.beginPath();
        ctx.moveTo(gun.bx, gun.by);
        ctx.arc(gun.bx, gun.by, 260, gun.home - gun.arc, gun.home + gun.arc);
        ctx.closePath();
        ctx.fill();
      }
      if (!sprites.pivot(ctx, 'ship/gun-barrel', gun.bx, gun.by, 0.12, 0.5, gun.aim)) {
        // Upgrades show: Twin Barrels adds barrels, Big Shells makes them fatter.
        const up = state.upgrades || {};
        const barrels = 1 + Math.min(2, up['twin-barrels'] || 0);
        const fat = 9 + 3 * (up['big-shells'] || 0);
        ctx.save();
        ctx.translate(gun.bx, gun.by);
        ctx.rotate(gun.aim);
        ink();
        for (let b = 0; b < barrels; b++) {
          const off = (b - (barrels - 1) / 2) * (fat * 1.7);
          ctx.fillStyle = '#4a4a4a';
          ctx.fillRect(0, off - fat, 62, fat * 2);
          ctx.strokeRect(0, off - fat, 62, fat * 2);
          ctx.fillStyle = '#2a2a2a';
          ctx.fillRect(56, off - fat - 3, 10, fat * 2 + 6);
        }
        ctx.restore();
      }
      if (!sprites.box(ctx, 'ship/gun-mount', gun.bx - 16, gun.by - 16, 32, 32)) {
        ctx.fillStyle = '#e63946';
        ctx.beginPath();
        ctx.arc(gun.bx, gun.by, 16, 0, 7);
        ctx.fill();
        ink();
        ctx.stroke();
      }
      if ((state.upgrades || {})['auto-loader']) {
        // Auto-Loader: a little spinning gear on the mount.
        ctx.save();
        ctx.translate(gun.bx - 18, gun.by + 18);
        ctx.rotate(performance.now() / 300);
        ctx.fillStyle = '#c9a54a';
        ink();
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let k = 0; k < 16; k++) {
          const r = k % 2 ? 7 : 10;
          const a = (k * Math.PI) / 8;
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      for (let i = 0; i < gun.max; i++) {
        ctx.fillStyle = i < gun.ammo ? '#ffd23f' : 'rgba(27,20,16,.3)';
        ctx.beginPath();
        ctx.arc(gun.bx - 31 + i * 9, gun.by + 30, 3.6, 0, 7);
        ctx.fill();
      }
      if (gun.empty > 0) {
        ctx.font = '900 24px Georgia';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#e63946';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 5;
        ctx.strokeText(gun.emptyText || 'EMPTY!', gun.bx, gun.by - 32);
        ctx.fillText(gun.emptyText || 'EMPTY!', gun.bx, gun.by - 32);
        ink();
      }
    }
  };

  const drawHazards = (time) => {
    ink();
    for (const breach of state.breaches) {
      const y = SHIP_LAYOUT.platforms[breach.d].y - 58;
      if (sprites.box(ctx, 'fx/hole', breach.x - 25, y - 30, 50, 60)) {
        drawBar(breach.x, y - 48, breach.prog);
        continue;
      }
      ctx.fillStyle = config.INK;
      ctx.beginPath();
      ctx.ellipse(breach.x, y, 24, 30, 0.2, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#8ec5de';
      ctx.beginPath();
      ctx.ellipse(breach.x, y, 15, 21, 0.2, 0, 7);
      ctx.fill();
      ctx.strokeStyle = '#d9c18f';
      ctx.lineWidth = 3;
      for (let i = 0; i < 6; i++) {
        const a = i * 1.05;
        ctx.beginPath();
        ctx.moveTo(breach.x + Math.cos(a) * 22, y + Math.sin(a) * 28);
        ctx.lineTo(breach.x + Math.cos(a) * 34, y + Math.sin(a) * 40);
        ctx.stroke();
      }
      drawBar(breach.x, y - 48, breach.prog);
    }
    ink();
    for (const fire of state.fires) {
      const y = SHIP_LAYOUT.platforms[fire.d].y;
      const frame = 1 + (Math.floor(time * 8 + fire.x) % 4);
      if (sprites.box(ctx, `fx/fire-${frame}`, fire.x - 30, y - 70, 60, 70) || sprites.box(ctx, 'fx/fire-1', fire.x - 30, y - 70, 60, 70)) {
        drawBar(fire.x, y - 70, fire.prog);
        continue;
      }
      for (let i = -1; i <= 1; i++) {
        const height = 46 + Math.sin(time * 12 + i * 2) * 10 - (i ? 10 : 0);
        const x = fire.x + i * 18;
        ctx.fillStyle = i ? '#ff7b00' : '#ffcf40';
        ctx.beginPath();
        ctx.moveTo(x - 14, y);
        ctx.quadraticCurveTo(x - 14, y - height * 0.6, x, y - height);
        ctx.quadraticCurveTo(x + 14, y - height * 0.6, x + 14, y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      drawBar(fire.x, y - 70, fire.prog);
    }
    for (const player of Object.values(state.players)) {
      if (player.ko > 0) {
        ctx.font = '900 22px Georgia';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#e63946';
        ctx.fillText('KO!', player.x, player.y - 80);
        drawBar(player.x, player.y - 70, player.prog);
      }
    }
  };

  const drawEnemy = (time) => {
    if (state.enemy.dead > 0 || state.phase === 'lobby') return;
    ctx.save();
    ctx.translate(state.enemy.x, state.enemy.y);
    const heading = state.enemy.heading ?? Math.atan2(state.enemy.vy, state.enemy.vx || 1);
    ctx.rotate(heading);
    if (Math.cos(heading) < 0) ctx.scale(1, -1);
    if (sprites.plane(ctx, 'fighter', time)) {
      ctx.restore();
      return;
    }
    // Devil's twin-boom fighter (after the reference sheet): grey boom with a twin tail and a
    // lightning bolt, engine with a red spinner, and a shark-mouthed pod with a devil in the cockpit.
    ink();
    ctx.lineWidth = 4;
    const grey = '#6b6a5e';
    // Tail fin with lightning bolt.
    ctx.fillStyle = grey;
    ctx.beginPath();
    ctx.moveTo(-70, 2);
    ctx.quadraticCurveTo(-82, -30, -66, -34);
    ctx.lineTo(-54, -4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#d9572b';
    ctx.beginPath();
    ctx.moveTo(-66, -26);
    ctx.lineTo(-72, -14);
    ctx.lineTo(-66, -15);
    ctx.lineTo(-70, -4);
    ctx.lineTo(-61, -18);
    ctx.lineTo(-66, -17);
    ctx.closePath();
    ctx.fill();
    // Boom and engine.
    ctx.fillStyle = grey;
    ctx.beginPath();
    ctx.ellipse(-8, 8, 64, 9, 0, 0, 7);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(40, 8, 20, 13, 0, 0, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.moveTo(58, 0);
    ctx.lineTo(74, 8);
    ctx.lineTo(58, 16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Wing (seen edge-on).
    ctx.fillStyle = '#56554b';
    ctx.beginPath();
    ctx.roundRect(-10, 2, 56, 8, 4);
    ctx.fill();
    ctx.stroke();
    // Central pod with shark mouth and canopy.
    ctx.fillStyle = grey;
    ctx.beginPath();
    ctx.ellipse(18, -12, 40, 14, 0, 0, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.arc(56, -12, 7, 0, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#7a1e1e';
    ctx.beginPath();
    ctx.moveTo(30, -8);
    ctx.quadraticCurveTo(42, 0, 54, -8);
    ctx.lineTo(30, -8);
    ctx.fill();
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(32 + i * 5.5, -8);
      ctx.lineTo(34.5 + i * 5.5, -3);
      ctx.lineTo(37 + i * 5.5, -8);
      ctx.fill();
    }
    ctx.fillStyle = '#1b1410';
    ctx.beginPath();
    ctx.arc(44, -17, 2.5, 0, 7);
    ctx.fill();
    // The devil pilot under a glass canopy.
    ctx.fillStyle = '#c8372d';
    ctx.beginPath();
    ctx.arc(10, -26, 8, 0, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f1e2b8';
    for (const hx of [5, 15]) {
      ctx.beginPath();
      ctx.moveTo(hx - 3, -32);
      ctx.lineTo(hx, -42);
      ctx.lineTo(hx + 3, -32);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(122,208,224,.55)';
    ctx.beginPath();
    ctx.ellipse(10, -24, 15, 11, 0, Math.PI, 0);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.stroke();
    // Spinning propeller in front of the spinner.
    ctx.fillStyle = '#2b1d14';
    ctx.fillRect(74, 8 - 18 * Math.abs(Math.sin(time * 30)) - 4, 4, 36 * Math.abs(Math.sin(time * 30)) + 8);
    ctx.restore();
  };

  // Readability: a soft pulsing red glow behind everything dangerous / shootable, so threats pop
  // out of the scenery at TV distance.
  const drawThreatGlows = (time) => {
    for (const t of targets(state)) {
      const p = t.at(0);
      if (!p || !Number.isFinite(p.x)) continue;
      const r = t.r * (2.4 + 0.3 * Math.sin(time * 6 + p.x * 0.01));
      const g = ctx.createRadialGradient(p.x, p.y, t.r * 0.3, p.x, p.y, r);
      g.addColorStop(0, 'rgba(255,60,80,.5)');
      g.addColorStop(1, 'rgba(255,60,80,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, 7);
      ctx.fill();
    }
  };

  // The fighter's line of fire while it's on a strafing run.
  const drawFighterAim = (time) => {
    const e = state.enemy;
    if (e.dead > 0 || e.mode !== 'run' || !(e.shots > 0) || e.heading == null || state.phase === 'lobby') return;
    const d = Math.hypot(e.x - SHIP_LAYOUT.aimPoint.x, e.y - (SHIP_LAYOUT.aimPoint.y - state.ship.alt));
    if (d > config.ENEMY.FIRE_RANGE + 500) return;
    ctx.strokeStyle = `rgba(255,50,70,${0.45 + 0.3 * Math.sin(time * 14)})`;
    ctx.lineWidth = 7;
    ctx.setLineDash([30, 24]);
    ctx.beginPath();
    ctx.moveTo(e.x + Math.cos(e.heading) * 60, e.y + Math.sin(e.heading) * 60);
    ctx.lineTo(e.x + Math.cos(e.heading) * 900, e.y + Math.sin(e.heading) * 900);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  // Deflector shield: a glowing band on an oval around the ship, flashing when it blocks.
  const drawShield = (time) => {
    const S = state.shield;
    if (!S || !S.on) return;
    const L = SHIP_LAYOUT.shield;
    const span = config.SHIELD.SPAN;
    const arc = () => {
      ctx.beginPath();
      for (let k = 0; k <= 24; k++) {
        const a = S.ang - span + (2 * span * k) / 24;
        const x = L.cx + L.rx * Math.cos(a);
        const y = L.cy - state.ship.alt + L.ry * Math.sin(a);
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    };
    ctx.lineCap = 'round';
    const f = S.flash;
    for (const [w, c] of [[120, `rgba(120,220,255,${0.15 + f * 0.25})`], [48, `rgba(120,220,255,${0.55 + f * 0.35})`], [14, `rgba(255,255,255,${0.75 + 0.2 * Math.sin(time * 10)})`]]) {
      ctx.strokeStyle = c;
      ctx.lineWidth = w;
      arc();
      ctx.stroke();
    }
  };

  // Lightning Coil on top of the crow's nest: copper coil and a glowing ball that brightens as it
  // charges, an aiming line while charging, and the bolt itself.
  const drawCoil = (time) => {
    const C = state.coil;
    if (!C) return;
    const M = SHIP_LAYOUT.coil;
    const x = M.x;
    const y = M.y - state.ship.alt;
    ink();
    ctx.lineWidth = 5;
    ctx.fillStyle = '#5a3b26';
    ctx.fillRect(x - 26, y + 20, 52, 26);
    ctx.strokeRect(x - 26, y + 20, 52, 26);
    ctx.strokeStyle = '#c87533';
    ctx.lineWidth = 8;
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.ellipse(x, y + 12 - k * 16, 22 - k * 3, 7, 0, 0, 7);
      ctx.stroke();
    }
    const c = C.charge;
    const glow = 0.25 + c * 0.75;
    ctx.fillStyle = `rgba(160,235,255,${0.25 * glow})`;
    ctx.beginPath();
    ctx.arc(x, y - 60, 30 + c * 50 + Math.sin(time * 30) * 4 * c, 0, 7);
    ctx.fill();
    ink();
    ctx.lineWidth = 4;
    ctx.fillStyle = `rgb(${Math.round(120 + 135 * c)},${Math.round(200 + 55 * c)},255)`;
    ctx.beginPath();
    ctx.arc(x, y - 60, 18, 0, 7);
    ctx.fill();
    ctx.stroke();
    if (C.charging) {
      ctx.strokeStyle = `rgba(160,235,255,${0.3 + 0.5 * c})`;
      ctx.lineWidth = 4 + 10 * c;
      ctx.setLineDash([26, 20]);
      ctx.beginPath();
      ctx.moveTo(x, y - 60);
      ctx.lineTo(x + Math.cos(C.aim) * 2400, y - 60 + Math.sin(C.aim) * 2400);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (C.bolt) {
      const k = C.bolt.t / 0.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const [w, col] of [[90 * C.bolt.power * k + 10, `rgba(120,220,255,${0.3 * k})`], [30 * k + 6, `rgba(190,240,255,${0.8 * k})`], [10, `rgba(255,255,255,${k})`]]) {
        ctx.strokeStyle = col;
        ctx.lineWidth = w;
        ctx.beginPath();
        C.bolt.pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
        ctx.stroke();
      }
    }
  };

  const drawEffects = (time, view) => {
    drawCoil(time);
    drawShield(time);
    drawThreatGlows(time);
    drawFighterAim(time);
    threatArt.drawWrecks();
    threatArt.drawMines(time);
    threatArt.drawCargo(time);
    threatArt.drawBoss(time);
    threatArt.drawBombers(time);
    threatArt.drawBats(time);
    threatArt.drawStrafers(time);
    threatArt.drawRockets();
    drawSpecials(time);
    drawPopups(view.zoom);
    drawEnemy(time);
    // Cartoon puffs: swell up, then shrink and fade, with an ink outline and a highlight.
    for (const puffItem of state.puffs) {
      const t = 1 - puffItem.life / puffItem.max;
      const r = 5 + 13 * Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5 + 0.15) * (1 - t * 0.45);
      ctx.globalAlpha = Math.max(0, 1 - t * t);
      ctx.fillStyle = puffItem.c;
      ctx.beginPath();
      ctx.arc(puffItem.x, puffItem.y, r, 0, 7);
      ctx.fill();
      ctx.strokeStyle = config.INK;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.beginPath();
      ctx.arc(puffItem.x - r * 0.3, puffItem.y - r * 0.3, r * 0.35, 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Shots: bright glowing orbs with trails. Crew shells glow in the shooter's own colour (so you
    // can follow your fire); enemy bullets are hot red, flak orange.
    const glowShot = (p, color, r, trail) => {
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = r * 1.6;
      ctx.beginPath();
      ctx.moveTo(p.x - p.vx * trail, p.y - p.vy * trail);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 2.3, 0, 7);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 0.45, 0, 7);
      ctx.fill();
    };
    ctx.lineCap = 'round';
    const big = (state.upgrades || {})['big-shells'] || 0;
    for (const shell of state.shells) glowShot(shell, (state.players[shell.owner] || {}).color || '#ffd23f', 9 + 3 * big, 0.06);
    for (const bullet of state.bullets) glowShot(bullet, bullet.flak ? '#ff8c1a' : '#ff2e55', bullet.flak ? 13 : 12, 0.09);
  };

  // Lap progress: home mast, checkpoints, the beacon halfway, and the ship.
  // Minimap of the mission map: caves, the ship (red) and the beacon (yellow star).
  let miniFor = null;
  let miniCanvas = null;
  const drawMinimap = () => {
    const c = state.course;
    const map = c.map;
    if (miniFor !== map) {
      miniFor = map;
      miniCanvas = document.createElement('canvas');
      miniCanvas.width = map.W;
      miniCanvas.height = map.H;
      const g = miniCanvas.getContext('2d');
      const img = g.createImageData(map.W, map.H);
      for (let k = 0; k < map.W * map.H; k++) {
        const rock = map.solid[k];
        img.data[k * 4] = rock ? 70 : 214;
        img.data[k * 4 + 1] = rock ? 54 : 200;
        img.data[k * 4 + 2] = rock ? 44 : 170;
        img.data[k * 4 + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    }
    const w = 420;
    const h = Math.min(170, (w * map.H) / map.W);
    const x0 = 800 - w / 2;
    const y0 = 14;
    ctx.fillStyle = 'rgba(241,226,184,.92)';
    ink();
    ctx.lineWidth = 4;
    rrect(x0 - 8, y0 - 8, w + 16, h + 16, 10);
    ctx.fill();
    ctx.stroke();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(miniCanvas, x0, y0, w, h);
    ctx.imageSmoothingEnabled = true;
    const px = (mx) => x0 + (mx / (map.W * map.CELL)) * w;
    const py = (my) => y0 + (my / (map.H * map.CELL)) * h;
    // Outposts (open sky): red while standing, grey once destroyed.
    for (const o of map.outposts || []) {
      ctx.fillStyle = o.done ? '#888' : '#e63946';
      ctx.beginPath();
      ctx.arc(px(o.x), py(o.y), o.done ? 5 : 8, 0, 7);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // Beacon (cave missions).
    const gx = px(map.goal.x);
    const gy = py(map.goal.y);
    ctx.fillStyle = map.open ? 'rgba(0,0,0,0)' : '#ffd23f';
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
      const r = k % 2 ? 4 : 10;
      ctx.lineTo(gx + Math.cos(a) * r, gy + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.stroke();
    // Ship.
    ctx.fillStyle = '#e63946';
    ctx.beginPath();
    ctx.arc(px(c.dist + 800), py(500 - state.ship.alt), 6, 0, 7);
    ctx.fill();
    ctx.stroke();
  };

  const drawRouteBar = () => {
    const c = state.course;
    const x0 = 560;
    const w = 480;
    const y = 52;
    ctx.fillStyle = 'rgba(241,226,184,.92)';
    ink();
    ctx.lineWidth = 4;
    rrect(x0 - 26, y - 22, w + 52, 44, 12);
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + w, y);
    ctx.stroke();
    const n = config.COURSE.SECTIONS;
    for (let k = 0; k <= n; k++) {
      const x = x0 + (w * k) / n;
      const home = k === 0 || k === n;
      const beacon = k === n / 2;
      ctx.fillStyle = home ? '#3a86ff' : beacon ? '#ffd23f' : '#e63946';
      ctx.beginPath();
      ctx.arc(x, y, home || beacon ? 10 : 6, 0, 7);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    const px = x0 + w * (c.progress || 0);
    ctx.fillStyle = '#d9c18f';
    ctx.beginPath();
    ctx.ellipse(px, y - 2, 16, 8, 0, 0, 7);
    ctx.fill();
    ctx.stroke();
  };

  // Screen overlay (hull/steam panel, warnings). Drawn on a fixed 1600x900 stage, not zoomed by the camera.
  const drawHud = () => {
    ctx.fillStyle = '#f1e2b8';
    ink();
    rrect(30, 28, 440, 156, 14);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#3b2a1d';
    ctx.fillRect(46, 58, 408, 22);
    ctx.fillStyle = state.ship.hull > 35 ? '#4caf50' : '#e63946';
    ctx.fillRect(46, 58, 408 * state.ship.hull / 100, 22);
    ctx.strokeRect(46, 58, 408, 22);
    ctx.fillStyle = config.INK;
    ctx.font = '700 20px Georgia';
    ctx.textAlign = 'left';
    ctx.fillText('Hull', 46, 50);
    ctx.textAlign = 'right';
    ctx.fillText('Raiders downed: ' + state.kills, 454, 50);
    // A gauge with coloured bands and a needle under the current value.
    const gauge = (y, value, bands, fill) => {
      ctx.fillStyle = '#3b2a1d';
      ctx.fillRect(46, y, 408, 14);
      for (const [a, b, c] of bands) {
        ctx.fillStyle = c;
        ctx.fillRect(46 + 408 * a, y, 408 * (b - a), 14);
      }
      ctx.fillStyle = fill;
      ctx.fillRect(46, y + 3, (408 * value) / 100, 8);
      ink();
      ctx.lineWidth = 3;
      ctx.strokeRect(46, y, 408, 14);
      ctx.fillStyle = config.INK;
      ctx.beginPath();
      ctx.moveTo(46 + (408 * value) / 100, y + 16);
      ctx.lineTo(40 + (408 * value) / 100, y + 24);
      ctx.lineTo(52 + (408 * value) / 100, y + 24);
      ctx.fill();
    };
    // Steam pressure in the line: red zone at the top means open a vent!
    const warnAt = config.BOILER.WARN_AT / 100;
    const p = state.ship.press;
    gauge(104, p, [[warnAt, 1, 'rgba(230,57,70,.55)']], p >= config.BOILER.WARN_AT ? '#e63946' : '#e8eef2');
    // Gas in the envelope: below the neutral mark she drops (blue), above it she rises (yellow).
    const GS = config.GAS;
    const gas = state.ship.gas;
    const n = GS.NEUTRAL / 100;
    gauge(
      154,
      gas,
      [
        [0, n - 0.05, 'rgba(90,150,230,.5)'],
        [n - 0.05, n + 0.05, 'rgba(120,200,110,.6)'],
        [n + 0.05, 1, 'rgba(240,200,60,.5)'],
      ],
      gas > GS.NEUTRAL + 5 ? '#f2c53d' : gas < GS.NEUTRAL - 5 ? '#5a96e6' : '#a8d8a0',
    );
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(46 + 408 * n - 2, 150, 4, 22);
    ctx.fillStyle = config.INK;
    ctx.font = '700 16px Georgia';
    ctx.textAlign = 'left';
    const vents = (state.ventOpen || []).filter(Boolean).length;
    ctx.fillText('Steam' + (vents ? ` - ${vents} vent${vents > 1 ? 's' : ''} open` : ''), 46, 100);
    const valve = state.gasValve || {};
    ctx.fillText(`Gas${valve.input > 0.1 ? ' - PUMPING' : valve.input < -0.1 ? ' - VENTING' : ''}${state.buoyancy > 0 ? ' - RISING' : state.buoyancy < 0 ? ' - FALLING' : ''}${state.gasHoles.length ? ' - ' + state.gasHoles.length + ' leak' + (state.gasHoles.length > 1 ? 's' : '') : ''}`, 46, 150);
    ctx.textAlign = 'right';
    ctx.fillText('Coal ' + Math.round(state.ship.fuel) + '%', 454, 100);
    if (state.autopilot) {
      ctx.fillStyle = '#3a5a8c';
      ctx.textAlign = 'center';
      ctx.fillText('AUTOPILOT', 170, 50);
      ctx.fillStyle = config.INK;
    }
    if (state.course && config.COURSE.ENABLED) {
      if (state.course.map) {
        ctx.fillText('Mission ' + state.course.lap, 454, 150);
        drawMinimap();
      } else {
        ctx.fillText('Lap ' + state.course.lap + (state.course.leg === 'home' ? ' - heading home' : ' - outbound'), 454, 150);
        drawRouteBar();
      }
    }

    if (state.ev.warn > 0) {
      ctx.font = '900 44px Georgia';
      ctx.textAlign = 'center';
      ctx.lineWidth = 8;
      ctx.strokeStyle = '#fff';
      const text = state.ev.warnText || 'BOARDERS ON THE CATWALK!';
      ctx.strokeText(text, 800, 170);
      ctx.fillStyle = '#e63946';
      ctx.fillText(text, 800, 170);
      ink();
    }
    drawUpgradeIcons();
    if (state.phase === 'lobby') drawLobby();
    drawBossBar();
    if (state.scorecard) drawScorecard();
    if (state.vote) drawVote();
  };

  // Comic-book words: pop in big, settle, then float up and fade.
  const drawPopups = (zoom) => {
    const screen = Math.max(1, 0.45 / zoom); // keep them readable when zoomed out
    for (const p of state.popups || []) {
      const grow = p.t < 0.12 ? 0.4 + (p.t / 0.12) * 0.8 : 1.2 - Math.min(0.2, (p.t - 0.12) * 0.6);
      const alpha = p.t > 0.75 ? Math.max(0, 1 - (p.t - 0.75) / 0.35) : 1;
      ctx.save();
      ctx.translate(p.x, p.y - p.t * 40);
      ctx.rotate(p.tilt);
      ctx.scale(grow * p.size * screen, grow * p.size * screen);
      ctx.globalAlpha = alpha;
      ctx.font = '900 46px Georgia';
      ctx.textAlign = 'center';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 12;
      ctx.strokeStyle = config.INK;
      ctx.strokeText(p.text, 0, 0);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  };

  // Before the flight: title up top, how-to-start low over the ground (clear of the ship and QR panel).
  const drawLobby = () => {
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.font = '900 76px Georgia';
    ctx.lineWidth = 12;
    ctx.strokeStyle = config.INK;
    ctx.strokeText('AIRSHIP CREW', 790, 175);
    ctx.fillStyle = '#ffd23f';
    ctx.fillText('AIRSHIP CREW', 790, 175);
    const crew = Object.keys(state.players).length;
    const lines = [
      'Scan the code with your phone to climb aboard (hold it sideways).',
      'Practise with tools and stations while moored.',
      crew ? `${crew} aboard - press CAST OFF (or Space) when ready!` : 'Waiting for crew...',
    ];
    const rec = state.record || { laps: 0 };
    if (rec.laps > 0) lines.push(`Record on this TV: ${rec.laps} mission${rec.laps > 1 ? 's' : ''}, ${rec.kills} shot down`);
    ctx.font = '700 26px Georgia';
    lines.forEach((t, i) => {
      ctx.lineWidth = 7;
      ctx.strokeStyle = '#fff';
      ctx.strokeText(t, 720, 760 + i * 40);
      ctx.fillStyle = i === 2 ? '#2e7d32' : i === 3 ? '#8c2f2f' : config.INK;
      ctx.fillText(t, 720, 760 + i * 40);
    });
  };

  // Lap scorecard: who did the most of each job.
  const drawScorecard = () => {
    const sc = state.scorecard;
    ctx.fillStyle = 'rgba(27,20,16,.7)';
    ctx.fillRect(-config.W, -config.H, config.W * 3, config.H * 3);
    ctx.fillStyle = '#f1e2b8';
    ink();
    rrect(200, 110, 1200, 700, 26);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = config.INK;
    ctx.font = '900 54px Georgia';
    ctx.fillText(`Lap ${sc.lap} complete!`, 800, 185);
    ctx.font = '700 26px Georgia';
    ctx.fillText(sc.rows.length ? 'Crew awards' : 'Nobody did much this lap... next time!', 800, 228);
    if (state.newRecord) {
      ctx.fillStyle = '#c0392b';
      ctx.font = '900 30px Georgia';
      ctx.fillText('NEW RECORD FOR THIS CREW!', 800, 775);
      ctx.fillStyle = config.INK;
    }
    sc.rows.forEach((r, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 260 + col * 560;
      const y = 300 + row * 92;
      ctx.textAlign = 'left';
      ctx.font = '44px "Segoe UI Emoji", sans-serif';
      ctx.fillText(r.icon, x, y + 14);
      ctx.font = '900 28px Georgia';
      ctx.fillStyle = config.INK;
      ctx.fillText(r.title, x + 70, y);
      ctx.fillStyle = r.color;
      ctx.strokeStyle = config.INK;
      ctx.lineWidth = 4;
      ctx.font = '900 26px Georgia';
      ctx.strokeText(r.name, x + 70, y + 34);
      ctx.fillText(r.name, x + 70, y + 34);
      ctx.fillStyle = '#5a4a3a';
      ctx.font = '400 22px Georgia';
      ctx.fillText(`${r.value} ${r.unit}`, x + 80 + ctx.measureText(r.name).width + 40, y + 34);
      ctx.fillStyle = config.INK;
    });
  };

  // Boss health bar across the top of the screen.
  const drawBossBar = () => {
    const z = state.boss;
    if (!z) return;
    ctx.fillStyle = 'rgba(27,20,16,.8)';
    rrect(450, 830, 700, 46, 12);
    ctx.fill();
    ctx.fillStyle = '#3b2a1d';
    ctx.fillRect(470, 852, 660, 14);
    ctx.fillStyle = '#e63946';
    ctx.fillRect(470, 852, (660 * Math.max(0, z.hp)) / z.maxHp, 14);
    ctx.fillStyle = '#f1e2b8';
    ctx.font = '900 18px Georgia';
    ctx.textAlign = 'center';
    ctx.fillText(z.name || 'THE DREAD ZEPPELIN', 800, 847);
  };

  // Upgrades the ship has, as a row of icons under the status panel.
  const drawUpgradeIcons = () => {
    const owned = Object.entries(state.upgrades || {});
    if (!owned.length) return;
    ctx.font = '26px "Segoe UI Emoji", sans-serif';
    ctx.textAlign = 'left';
    let x = 34;
    for (const [id, n] of owned) {
      const u = UPGRADES.find((q) => q.id === id);
      if (!u) continue;
      ctx.fillStyle = config.INK;
      ctx.fillText(u.icon, x, 214);
      if (n > 1) {
        ctx.font = '700 15px Georgia';
        ctx.fillText('x' + n, x + 30, 214);
        ctx.font = '26px "Segoe UI Emoji", sans-serif';
      }
      x += n > 1 ? 58 : 38;
    }
  };

  // Upgrade vote: three cards, each player's vote shown as a dot in their colour.
  const drawVote = () => {
    const v = state.vote;
    ctx.fillStyle = 'rgba(27,20,16,.6)';
    ctx.fillRect(-config.W, -config.H, config.W * 3, config.H * 3);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = '900 52px Georgia';
    ctx.fillText(v.title, 800, 170);
    ctx.font = '700 26px Georgia';
    ctx.fillText(`Vote on your phone - ${Math.max(0, Math.ceil(v.t))}s`, 800, 215);
    const voters = Object.values(state.players);
    v.options.forEach((id, i) => {
      const u = UPGRADES.find((q) => q.id === id);
      const x = 160 + i * 440;
      const y = 260;
      ctx.fillStyle = '#f1e2b8';
      ink();
      rrect(x, y, 400, 420, 22);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = config.INK;
      ctx.font = '90px "Segoe UI Emoji", sans-serif';
      ctx.fillText(u.icon, x + 200, y + 130);
      ctx.font = '900 36px Georgia';
      ctx.fillText(u.name, x + 200, y + 200);
      // Description, wrapped.
      ctx.font = '400 24px Georgia';
      const words = u.desc.split(' ');
      let line = '';
      let ly = y + 250;
      for (const word of words) {
        if (ctx.measureText(line + word).width > 340) {
          ctx.fillText(line.trim(), x + 200, ly);
          line = '';
          ly += 32;
        }
        line += word + ' ';
      }
      ctx.fillText(line.trim(), x + 200, ly);
      const level = (state.upgrades[id] || 0) + 1;
      if (u.max > 1 && u.max < 99) {
        ctx.font = '700 20px Georgia';
        ctx.fillText(`Level ${level} of ${u.max}`, x + 200, y + 360);
      }
      // Vote dots.
      const mine = voters.filter((p) => p.vote === i);
      mine.forEach((p, k) => {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(x + 200 - (mine.length - 1) * 16 + k * 32, y + 395, 12, 0, 7);
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.stroke();
      });
    });
  };

  // The item a player is holding. swingAge = ms since their last attack (for the swing pose).
  const drawCarry = (item, face, swingAge) => {
    ctx.save();
    ctx.translate(face * 16, -24);
    ctx.scale(face, 1);
    if (sprites.pivot(ctx, 'items/' + item, 0, 0, 0.5, item === 'coal' || item === 'ammo' ? 0.5 : 0.85, swingAge < 250 ? -0.9 + (swingAge / 250) * 1.6 : 0)) {
      ctx.restore();
      return;
    }
    ink();
    ctx.lineWidth = 3;
    if (item === 'coal') {
      ctx.fillStyle = '#2b2b2b';
      ctx.beginPath();
      ctx.moveTo(-8, 6);
      ctx.lineTo(-4, -8);
      ctx.lineTo(10, -10);
      ctx.lineTo(16, 4);
      ctx.lineTo(6, 10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (item === 'ammo') {
      ctx.fillStyle = '#b5833f';
      ctx.fillRect(-8, -8, 22, 16);
      ctx.strokeRect(-8, -8, 22, 16);
    } else if (item === 'extinguisher') {
      ctx.fillStyle = '#d62828';
      rrect(-4, -16, 14, 30, 6);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(3, -16);
      ctx.lineTo(14, -24);
      ctx.stroke();
    } else {
      // Sword or hammer, raised and swung down when attacking.
      const swing = swingAge < 250 ? Math.sin((swingAge / 250) * Math.PI) * 1.6 : 0;
      ctx.rotate(-0.9 + swing);
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -44);
      ctx.strokeStyle = item === 'sword' ? '#d8dde0' : '#7a4a24';
      ctx.stroke();
      ink();
      if (item === 'sword') {
        ctx.beginPath();
        ctx.moveTo(-8, -8);
        ctx.lineTo(8, -8);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#4a4a4a';
        ctx.fillRect(-11, -50, 22, 14);
        ctx.strokeRect(-11, -50, 22, 14);
      }
    }
    ctx.restore();
  };

  // Where a player's Action would land (ship coordinates), for the highlight ring.
  const actionSpot = (act) => {
    const P = SHIP_LAYOUT.platforms;
    const o = act.obj;
    switch (act.type) {
      case 'revive':
        return { x: o.x, y: o.y - 30, r: 55 };
      case 'defuse':
        return { x: o.x, y: P[o.d].y - 22, r: 40 };
      case 'fire':
        return { x: o.x, y: P[o.d].y - 30, r: 50 };
      case 'hole':
        return { x: o.x, y: P[o.d].y - 58, r: 42 };
      case 'gas':
        return { x: o.x, y: o.y, r: 40 };
      case 'vent':
        return { x: o.x, y: P[o.d].y - 100, r: 42 };
      case 'coal':
      case 'stoke':
        return { x: act.station.x, y: P[act.station.d].y - 50, r: 52 };
      case 'repair':
      case 'valve':
        return { x: o.pos.x, y: o.pos.y, r: 40 };
      case 'rack':
        return { x: o.x, y: P[o.d].y - (o.kind === 'extinguisher' ? 58 : 80), r: 46 };
      case 'load':
      case 'ammo':
      case 'station':
        return { x: act.station.x, y: P[act.station.d].y - 60, r: 52 };
      default:
        return null;
    }
  };

  // A pulsing ring in each (human) player's colour around what their Action button will use.
  const drawHighlights = (time) => {
    for (const p of Object.values(state.players)) {
      if (p.bot || !p.act || p.ko > 0) continue;
      const spot = actionSpot(p.act);
      if (!spot) continue;
      const pulse = 1 + Math.sin(time * 6) * 0.08;
      ctx.lineWidth = 6;
      ctx.strokeStyle = config.INK;
      ctx.beginPath();
      ctx.arc(spot.x, spot.y, spot.r * pulse + 3, 0, 7);
      ctx.stroke();
      ctx.lineWidth = 4;
      ctx.strokeStyle = p.color;
      ctx.beginPath();
      ctx.arc(spot.x, spot.y, spot.r * pulse, 0, 7);
      ctx.stroke();
    }
  };

  const drawPlayer = (player, time) => {
    const species = config.SPECIES[player.species] || config.SPECIES.bulldog;
    const bob = player.moving ? Math.sin(time * 16) * 3 : player.climb ? Math.sin(time * 10) * 3 : 0;
    const face = player.face || 1;
    const actionAge = performance.now() - (player.actT || -1e9);
    const hop = actionAge < 400 ? Math.sin(actionAge / 400 * Math.PI) * 40 : 0;
    const art = characterArt.draw(player, time, bob + hop);
    if (!art) {
      ctx.save();
      ctx.translate(player.x, player.y - bob - hop);
      const size = player.scale || 1;
      if (size !== 1) ctx.scale(size, size);
      if (player.ko > 0) {
        ctx.rotate(-1.4 * face);
        ctx.translate(0, 10);
      }
      ink();
      ctx.lineWidth = 4;
      if (player.fall) {
        ctx.fillStyle = player.color;
        ctx.beginPath();
        ctx.arc(0, -120, 50, Math.PI, 0);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-50, -120);
        ctx.lineTo(-12, -50);
        ctx.moveTo(50, -120);
        ctx.lineTo(12, -50);
        ctx.stroke();
      }
      ctx.fillStyle = '#4f5d3a';
      rrect(-15, -34, 30, 34, 10);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#2b1d14';
      ctx.fillRect(-14, -6, 11, 8);
      ctx.fillRect(3, -6, 11, 8);
      if (player.carry) drawCarry(player.carry, face, performance.now() - (player.swingT || -1e9));
      const swingAge = performance.now() - (player.swingT || -1e9);
      if (swingAge < 200) {
        // White swoosh in front of the attacker.
        ctx.strokeStyle = 'rgba(255,255,255,.9)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        const mid = face > 0 ? 0 : Math.PI;
        ctx.arc(face * 10, -40, player.carry === 'sword' ? 70 : 45, mid - 0.9, mid + 0.9);
        ctx.stroke();
        ink();
        ctx.lineWidth = 4;
      }
      ctx.fillStyle = species.fur;
      const ear = (side) => {
        ctx.beginPath();
        if (species.ear === 'none') return;
      if (species.ear === 'long') {
        ctx.ellipse(side * 9, -84, 6, 20, side * 0.15, 0, 7);
      } else if (species.ear === 'bat') {
        ctx.moveTo(side * 6, -62);
        ctx.lineTo(side * 26, -92);
        ctx.lineTo(side * 22, -60);
      } else if (species.ear === 'point') {
          ctx.moveTo(side * 6, -62);
          ctx.lineTo(side * 18, -84);
          ctx.lineTo(side * 20, -58);
        } else if (species.ear === 'round') {
          ctx.arc(side * 16, -66, 8, 0, 7);
        } else {
          ctx.ellipse(side * 20, -52, 7, 14, side * 0.3, 0, 7);
        }
        ctx.fill();
        ctx.stroke();
      };
      ear(-1);
      ear(1);
      if (species.horns) {
        ctx.fillStyle = '#f1e2b8';
        [-1, 1].forEach((side) => {
          ctx.beginPath();
          ctx.moveTo(side * 8, -70);
          ctx.lineTo(side * 12, -90);
          ctx.lineTo(side * 16, -68);
          ctx.fill();
          ctx.stroke();
        });
      }
      ctx.fillStyle = species.fur;
      ctx.beginPath();
      ctx.arc(0, -50, 22, 0, 7);
      ctx.fill();
      ctx.stroke();
      if (species.stripes) {
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-12, -68);
        ctx.lineTo(-6, -62);
        ctx.moveTo(12, -68);
        ctx.lineTo(6, -62);
        ctx.stroke();
        ctx.lineWidth = 4;
      }
      ctx.fillStyle = '#f1e2b8';
      ctx.beginPath();
      ctx.ellipse(face * 10, -44, 11, 8, 0, 0, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = config.INK;
      ctx.beginPath();
      ctx.arc(face * 20, -46, 3.5, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#fff';
      [-4, 10].forEach((x) => {
        ctx.beginPath();
        ctx.arc(x * face + face * 2, -56, 6, 0, 7);
        ctx.fill();
        ctx.stroke();
      });
      ctx.fillStyle = config.INK;
      [-4, 10].forEach((x) => {
        ctx.beginPath();
        ctx.arc(x * face + face * 4, -56, 2.5, 0, 7);
        ctx.fill();
      });
      ctx.fillStyle = '#6a4a2c';
      ctx.beginPath();
      ctx.arc(0, -62, 20, Math.PI, 0);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = player.color;
      rrect(-17, -32, 34, 9, 4);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-face * 14, -28);
      ctx.lineTo(-face * (32 + (player.moving ? 8 : 0)), -20 + Math.sin(time * 9) * 4);
      ctx.lineTo(-face * 14, -22);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    ctx.font = '700 18px Georgia';
    ctx.textAlign = 'center';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#fff';
    const nameY = art ? player.y - bob - hop + art.top - 10 : player.y - 96 * (player.scale || 1);
    ctx.strokeText(player.name, player.x, nameY);
    ctx.fillStyle = player.connected === false ? '#888' : config.INK;
    ctx.fillText(player.name, player.x, nameY);
    if (player.windup > 0) {
      // Raider winding up to strike: big pulsing "!".
      const pulse = 1 + Math.sin(time * 30) * 0.15;
      ctx.font = `900 ${Math.round(44 * pulse)}px Georgia`;
      ctx.lineWidth = 7;
      ctx.strokeStyle = '#fff';
      ctx.strokeText('!', player.x, nameY - 22);
      ctx.fillStyle = '#e63946';
      ctx.fillText('!', player.x, nameY - 22);
    }
    if (actionAge < 900) {
      ctx.font = '900 26px Georgia';
      ctx.lineWidth = 6;
      ctx.strokeStyle = config.INK;
      ctx.fillStyle = '#fff';
      ctx.strokeText('Hey!', player.x, player.y - 126 - hop);
      ctx.fillText('Hey!', player.x, player.y - 126 - hop);
    }
  };

  const drawBar = (x, y, value) => {
    if (!value) return;
    ctx.fillStyle = '#3b2a1d';
    ctx.fillRect(x - 24, y, 48, 8);
    ctx.fillStyle = '#8fe388';
    ctx.fillRect(x - 24, y, 48 * value, 8);
    ctx.lineWidth = 3;
    ctx.strokeStyle = config.INK;
    ctx.strokeRect(x - 24, y, 48, 8);
  };

  const wrap = (v, span) => ((v % span) + span) % span;

  const cloud = (x, y, size) => {
    ctx.beginPath();
    [[0, 0, 1], [0.9, -0.3, 1.15], [1.8, 0, 0.95], [0.9, 0.25, 1.1]].forEach(([dx, dy, r]) => {
      ctx.ellipse(x + dx * 50 * size, y + dy * 50 * size, 50 * r * size, 32 * r * size, 0, 0, 7);
    });
    ctx.fill();
  };

  // A far-away mountain range. f = how strongly it follows the camera (0 = fixed, 1 = moves with the ship).
  // Samples sit on a grid fixed to the landscape (not the screen) so the outline doesn't shimmer.
  const drawRidge = (width, height, view, f, baseY, amp, freq, color, extra = {}) => {
    const s = height / config.H;
    const shift = (view.scroll + view.cx) * f;
    const y0 = height * baseY + (config.H / 2 - view.cy) * view.zoom * f * 0.6;
    const du = 16;
    const ridge = (u) => Math.sin(u * freq) * 0.45 + Math.sin(u * freq * 2.3 + 1) * 0.35 + Math.sin(u * freq * 5.7 + 2) * 0.2;
    const pts = [];
    for (let u = Math.floor(shift / du) * du; (u - shift) * s <= width + du * s; u += du) {
      const h = ridge(u);
      pts.push([(u - shift) * s, y0 - (h + 1) * amp * s, h, u]);
    }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], height);
    pts.forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.lineTo(pts[pts.length - 1][0], height);
    ctx.closePath();
    ctx.fill();
    if (extra.snow) {
      // White caps on the tallest peaks.
      ctx.fillStyle = extra.snow;
      for (let i = 0; i < pts.length; i++) {
        if (pts[i][2] < 0.55) continue;
        let j = i;
        while (j + 1 < pts.length && pts[j + 1][2] >= 0.55) j++;
        ctx.beginPath();
        for (let k = i; k <= j; k++) ctx.lineTo(pts[k][0], pts[k][1]);
        for (let k = j; k >= i; k--) ctx.lineTo(pts[k][0], pts[k][1] + (pts[k][2] - 0.55) * amp * s * (k % 2 ? 0.9 : 0.5));
        ctx.closePath();
        ctx.fill();
        i = j;
      }
    }
    if (extra.trees) {
      // A row of pine silhouettes along the ridge line.
      ctx.fillStyle = extra.trees;
      ctx.beginPath();
      pts.forEach(([x, y, , u]) => {
        const k = Math.round(u / du);
        const r = Math.sin(k * 91.7) * 43758.5;
        if (r - Math.floor(r) > 0.6) return;
        const t = (14 + (r - Math.floor(r)) * 30) * s;
        ctx.moveTo(x - t * 0.35, y + 4 * s);
        ctx.lineTo(x, y - t);
        ctx.lineTo(x + t * 0.35, y + 4 * s);
      });
      ctx.fill();
    }
  };

  // Falling bombs and the bombardier's aiming ring on the ground.
  const drawBombs = (time) => {
    const bay = state.bombBay;
    if (bay && bay.aim) {
      const { x, y } = bay.aim;
      const pulse = 1 + Math.sin(time * 8) * 0.08;
      // Dotted drop line from the bay doors.
      ctx.strokeStyle = 'rgba(230,57,70,.6)';
      ctx.lineWidth = 6;
      ctx.setLineDash([18, 22]);
      ctx.beginPath();
      ctx.moveTo(bay.from.x, bay.from.y);
      ctx.quadraticCurveTo(bay.from.x, (bay.from.y + y) / 2, x, y - 40);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = '#e63946';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.ellipse(x, y, 170 * pulse, 55 * pulse, 0, 0, 7);
      ctx.moveTo(x - 220, y);
      ctx.lineTo(x + 220, y);
      ctx.moveTo(x, y - 110);
      ctx.lineTo(x, y + 70);
      ctx.stroke();
    }
    for (const b of state.shipBombs || []) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(Math.atan2(b.vy, b.vx) - Math.PI / 2);
      ink();
      ctx.lineWidth = 4;
      ctx.fillStyle = '#3a3a3a';
      ctx.beginPath();
      ctx.ellipse(0, 0, 14, 26, 0, 0, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#c0392b';
      ctx.beginPath();
      ctx.moveTo(-14, -20);
      ctx.lineTo(14, -20);
      ctx.lineTo(10, -40);
      ctx.lineTo(-10, -40);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  };

  // Background drawn in screen space, back to front, each layer scrolling at its own speed.
  const drawBackground = (width, height, view) => {
    const s = height / config.H;
    // Day sky, blending to sunset on the return leg of the course.
    const dusk = (state.course && state.course.dusk) || 0;
    // ...and to dark grey in a storm.
    const storm = (state.weather && state.weather.storm) || 0;
    const mix = (a, b, c) => {
      const rgb = (hex) => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
      const pa = rgb(a);
      const pb = rgb(b);
      const pc = rgb(c);
      return 'rgb(' + pa.map((v, i) => Math.round((v + (pb[i] - v) * dusk) * (1 - storm * 0.8) + pc[i] * storm * 0.8)).join(',') + ')';
    };
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, mix('5aa6c8', '6a5a9c', '3a4048'));
    gradient.addColorStop(0.75, mix('f2d9a0', 'f4a46a', '6a6e72'));
    gradient.addColorStop(1, mix('e8c48a', 'e8865a', '585c60'));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    drawRidge(width, height, view, 0.02, 0.86, 170, 0.003, '#b9c8d6', { snow: '#eef3f8' });
    drawRidge(width, height, view, 0.04, 0.9, 120, 0.004, '#a9bccb');
    // High thin clouds.
    ctx.fillStyle = 'rgba(255,255,255,.45)';
    const span = width / s + 500;
    [[100, 140], [600, 90], [1100, 200], [1500, 60], [1900, 160], [2400, 110]].forEach(([x, y]) => {
      const cx = wrap(x - (view.scroll + view.cx) * 0.15, span) - 250;
      cloud(cx * s, (y + (config.H / 2 - view.cy) * view.zoom * 0.1) * s, 0.55 * s);
    });
    drawRidge(width, height, view, 0.1, 0.97, 90, 0.007, '#7f9a8c', { trees: '#6d8a7b' });
  };

  // Big clouds in the world, drifting past at full ship speed (behind the ship).
  const drawNearClouds = (width, height, view) => {
    const left = view.cx - width / 2 / view.zoom - 300;
    const top = view.cy - height / 2 / view.zoom;
    const viewW = width / view.zoom + 600;
    const viewH = height / view.zoom;
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    [[0, 0.1], [700, 0.75], [1300, 0.3], [1900, 0.9], [2600, 0.55], [3200, 0.2], [3900, 0.8]].forEach(([x, y], i) => {
      cloud(left + wrap(x - view.scroll, Math.max(viewW, 4200)), top + y * viewH, 1 + (i % 3) * 0.3);
    });
  };

  // Storm: rain streaks, lightning bolts and the flash (drawn in world space, flash over everything).
  const drawStorm = (width, height, view, time) => {
    const w = state.weather;
    if (!w || w.storm < 0.05) return;
    const left = view.cx - width / 2 / view.zoom;
    const top = view.cy - height / 2 / view.zoom;
    const vw = width / view.zoom;
    const vh = height / view.zoom;
    ctx.strokeStyle = `rgba(200,215,230,${0.45 * w.storm})`;
    ctx.lineWidth = 3 / view.zoom * 0.6;
    ctx.beginPath();
    const n = Math.round(160 * w.storm);
    for (let i = 0; i < n; i++) {
      const x = left + ((i * 937.13 + time * 900) % (vw + 400)) - 200;
      const y = top + ((i * 613.7 + time * 2600 + i * 31) % (vh + 200)) - 100;
      ctx.moveTo(x, y);
      ctx.lineTo(x - 30, y + 90);
    }
    ctx.stroke();
    if (w.bolt) {
      const bx = w.bolt.x;
      const by = w.bolt.y ?? top + vh * 0.85;
      ctx.strokeStyle = '#fff7a8';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(bx + 120, top);
      const steps = 7;
      for (let k = 1; k <= steps; k++) ctx.lineTo(bx + 120 * (1 - k / steps) + (k % 2 ? 40 : -40), top + ((by - top) * k) / steps);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    if (w.flash > 0) {
      ctx.fillStyle = `rgba(255,255,240,${w.flash * 0.45})`;
      ctx.fillRect(left - 100, top - 100, vw + 200, vh + 200);
    }
  };

  const renderFrame = (time, view) => {
    const width = canvas.width;
    const height = canvas.height;
    setBoilTime(time);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawBackground(width, height, view);

    // World layer, positioned by the camera.
    ctx.setTransform(view.zoom, 0, 0, view.zoom, width / 2 - view.cx * view.zoom, height / 2 - view.cy * view.zoom);
    drawNearClouds(width, height, view);
    courseArt.drawTerrain(view, width, height);
    courseArt.drawBuildings(view, width, time / 1000);
    courseArt.drawMarkers(time / 1000);
    courseArt.drawTurrets(time / 1000);
    drawBombs(time / 1000);

    ctx.save();
    // A smooth, capped shake (no random jitter), a slow two-speed bob and a slight sway: she's a
    // big thing hanging in the air. (Visual only - collisions use the steady ship.)
    const ts = time / 1000;
    const amp = Math.min(config.CAMERA.SHAKE_MAX, state.ship.shake * config.CAMERA.SHAKE_SCALE);
    const bob = Math.sin(ts * 1.1) * 5 + Math.sin(ts * 0.37 + 1) * 3;
    ctx.translate(amp ? Math.sin(ts * 61) * amp : 0, -state.ship.alt + bob + (amp ? Math.cos(ts * 47) * amp * 0.6 : 0));
    {
      const sway = Math.sin(ts * 0.8) * 0.005 + Math.sin(ts * 0.31) * 0.004;
      const [px, py] = config.SHIP.TILT_PIVOT;
      ctx.translate(px, py);
      ctx.rotate((state.ship.pitch || 0) + sway);
      ctx.translate(-px, -py);
    }
    const drawShipAndCrew = () => {
      drawShip(time / 1000);
      // Close-call warnings: red chevrons on the hull pointing at nearby rock.
      for (const n of (state.course && state.course.near) || []) {
        const a = n.close * (0.55 + 0.45 * Math.sin(time / 90));
        ctx.save();
        ctx.translate(n.x + n.dx * 24, n.y + n.dy * 24);
        ctx.rotate(Math.atan2(n.dy, n.dx));
        ctx.strokeStyle = `rgba(255,40,60,${a})`;
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-14, -22);
        ctx.lineTo(10, 0);
        ctx.lineTo(-14, 22);
        ctx.stroke();
        ctx.restore();
      }
      drawGuns();
      drawHazards(time / 1000);
      threatArt.drawBombs(time / 1000);
      drawHighlights(time / 1000);
      [...Object.values(state.players), ...state.boarders].sort((a, b) => a.y - b.y).forEach((player) => drawPlayer(player, time / 1000));
      // Each crew member's colour marker above their head, easy to spot from the sofa.
      for (const p of Object.values(state.players)) {
        if (!p.color || p.connected === false) continue;
        const y = p.y - (p.ko > 0 ? 90 : 165) + Math.sin(time / 300 + p.x) * 4;
        ink();
        ctx.lineWidth = 4;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(p.x - 16, y - 20);
        ctx.lineTo(p.x + 16, y - 20);
        ctx.lineTo(p.x, y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    };
    if (state.wreck) {
      // Breaking apart: the gasbag and the two halves of the gondola tumble away separately.
      const t = state.wreck.t;
      [
        { clip: [-500, -300, 2600, 730], c: [800, 245], dx: -15 * t, dy: 40 * t * t, rot: -0.05 * t },
        { clip: [-500, 430, 1300, 900], c: [450, 700], dx: -60 * t, dy: 120 * t * t, rot: -0.12 * t * t },
        { clip: [800, 430, 1300, 900], c: [1150, 700], dx: 70 * t, dy: 140 * t * t, rot: 0.15 * t * t },
      ].forEach((piece) => {
        ctx.save();
        ctx.translate(piece.c[0] + piece.dx, piece.c[1] + piece.dy);
        ctx.rotate(piece.rot);
        ctx.translate(-piece.c[0], -piece.c[1]);
        ctx.beginPath();
        ctx.rect(...piece.clip);
        ctx.clip();
        drawShipAndCrew();
        ctx.restore();
      });
    } else drawShipAndCrew();
    ctx.restore();
    drawEffects(time / 1000, view);
    drawStorm(width, height, view, time / 1000);

    // Screen overlay on a fixed 1600x900 stage.
    const scale = Math.min(width / config.W, height / config.H);
    ctx.setTransform(scale, 0, 0, scale, (width - config.W * scale) / 2, (height - config.H * scale) / 2);
    drawHud();
    if (state.wreck && state.wreck.t > 1.2) {
      // "Ship lost" card, then the restart.
      const w = state.wreck;
      ctx.globalAlpha = Math.min(1, (w.t - 1.2) * 2);
      ctx.fillStyle = 'rgba(30,20,14,.82)';
      ctx.fillRect(400, 300, 800, 260);
      ink();
      ctx.strokeRect(400, 300, 800, 260);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd23f';
      ctx.font = '700 64px Georgia';
      ctx.fillText('SHIP LOST!', 800, 385);
      ctx.fillStyle = '#f3ead6';
      ctx.font = '700 28px Georgia';
      ctx.fillText(`Missions done: ${w.lap - 1}   -   Raiders downed: ${w.kills}`, 800, 440);
      ctx.font = '700 22px Georgia';
      ctx.fillText(`A new ship waits at the mast in ${Math.max(1, Math.ceil(state.ship.down))}...`, 800, 500);
      ctx.globalAlpha = 1;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    threatArt.drawLookoutArrows(width, height, view);
    filmLook(time, width, height);
  };

  return { renderFrame, ink, drawBar };
}
