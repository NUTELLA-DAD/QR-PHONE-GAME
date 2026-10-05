import { config } from '../../config.js';
import { SHIP_LAYOUT } from '../../shipLayout.js';
import { createShipArt } from './shipArt.js';

export function createRenderer({ ctx, state, canvas }) {
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

  const drawShip = createShipArt({ ctx, state, ink, rrect });

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
      ctx.save();
      ctx.translate(gun.bx, gun.by);
      ctx.rotate(gun.aim);
      ink();
      ctx.fillStyle = '#4a4a4a';
      ctx.fillRect(0, -9, 62, 18);
      ctx.strokeRect(0, -9, 62, 18);
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(56, -12, 10, 24);
      ctx.restore();
      ctx.fillStyle = state.GUNS[name] ? '#e63946' : '#f1e2b8';
      ctx.beginPath();
      ctx.arc(gun.bx, gun.by, 16, 0, 7);
      ctx.fill();
      ink();
      ctx.stroke();
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
    if (state.enemy.dead > 0) return;
    ctx.save();
    ctx.translate(state.enemy.x, state.enemy.y);
    ctx.rotate(Math.atan2(state.enemy.vy, state.enemy.vx || 1));
    if (state.enemy.vx < 0) ctx.scale(1, -1);
    ink();
    ctx.lineWidth = 4;
    ctx.fillStyle = '#8c2f2f';
    ctx.beginPath();
    ctx.moveTo(-40, 0);
    ctx.lineTo(-56, -24);
    ctx.lineTo(-30, -5);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 0, 46, 16, 0, 0, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#6e2323';
    ctx.beginPath();
    ctx.ellipse(-4, 8, 30, 8, 0, 0, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f4c430';
    ctx.beginPath();
    ctx.moveTo(40, -13);
    ctx.lineTo(60, 0);
    ctx.lineTo(40, 13);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(22 + i * 8, 6);
      ctx.lineTo(26 + i * 8, 14);
      ctx.lineTo(30 + i * 8, 6);
      ctx.fill();
    }
    ctx.fillStyle = '#f4c430';
    ctx.beginPath();
    ctx.moveTo(-26, -3);
    ctx.lineTo(-18, 6);
    ctx.lineTo(-34, 6);
    ctx.fill();
    ctx.fillStyle = '#d9572b';
    ctx.beginPath();
    ctx.arc(4, -15, 11, 0, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#7ad0e0';
    ctx.beginPath();
    ctx.arc(8, -16, 5, 0, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#2b1d14';
    ctx.fillRect(62, -18 * Math.abs(Math.sin(time * 30)) - 4, 4, 36 * Math.abs(Math.sin(time * 30)) + 8);
    ctx.restore();
  };

  const drawEffects = (time) => {
    for (const puffItem of state.puffs) {
      ctx.globalAlpha = Math.max(0, puffItem.life / puffItem.max);
      ctx.fillStyle = puffItem.c;
      ctx.beginPath();
      ctx.arc(puffItem.x, puffItem.y, 10 * puffItem.life / puffItem.max + 4, 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    drawEnemy(time);
    ink();
    for (const shell of state.shells) {
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.arc(shell.x, shell.y, 7, 0, 7);
      ctx.fill();
      ctx.stroke();
    }
    for (const bullet of state.bullets) {
      ctx.fillStyle = '#e63946';
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, 8, 0, 7);
      ctx.fill();
      ctx.stroke();
    }
  };

  // Screen overlay (hull/steam panel, warnings). Drawn on a fixed 1600x900 stage, not zoomed by the camera.
  const drawHud = () => {
    ctx.fillStyle = '#f1e2b8';
    ink();
    rrect(30, 28, 440, 100, 14);
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
    ctx.fillStyle = '#3b2a1d';
    ctx.fillRect(46, 104, 408, 14);
    ctx.fillStyle = state.ship.press >= 40 && state.ship.press <= 80 ? '#e8eef2' : '#e8913a';
    ctx.fillRect(46, 104, 408 * state.ship.press / 100, 14);
    ctx.strokeStyle = '#4caf50';
    ctx.lineWidth = 3;
    ctx.strokeRect(46 + 408 * 0.4, 104, 408 * 0.4, 14);
    ink();
    ctx.strokeRect(46, 104, 408, 14);
    ctx.fillStyle = config.INK;
    ctx.font = '700 16px Georgia';
    ctx.textAlign = 'left';
    ctx.fillText('Steam', 46, 100);

    if (state.ev.warn > 0) {
      ctx.font = '900 44px Georgia';
      ctx.textAlign = 'center';
      ctx.lineWidth = 8;
      ctx.strokeStyle = '#fff';
      ctx.strokeText('BOARDERS ON THE CATWALK!', 800, 170);
      ctx.fillStyle = '#e63946';
      ctx.fillText('BOARDERS ON THE CATWALK!', 800, 170);
      ink();
    }
    if (state.ship.down > 0) {
      ctx.fillStyle = 'rgba(27,20,16,.55)';
      ctx.fillRect(-config.W, -config.H, config.W * 3, config.H * 3); // cover letterbox edges too
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.font = '900 64px Georgia';
      ctx.fillText('Hull breached! Patching up...', 800, 450);
    }
  };

  // The item a player is holding. swingAge = ms since their last attack (for the swing pose).
  const drawCarry = (item, face, swingAge) => {
    ctx.save();
    ctx.translate(face * 16, -24);
    ctx.scale(face, 1);
    ink();
    ctx.lineWidth = 3;
    if (item === 'ammo') {
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

  const drawPlayer = (player, time) => {
    const species = config.SPECIES[player.species] || config.SPECIES.bulldog;
    const bob = player.moving ? Math.sin(time * 16) * 3 : player.climb ? Math.sin(time * 10) * 3 : 0;
    const face = player.face || 1;
    const actionAge = performance.now() - (player.actT || -1e9);
    const hop = actionAge < 400 ? Math.sin(actionAge / 400 * Math.PI) * 40 : 0;
    ctx.save();
    ctx.translate(player.x, player.y - bob - hop);
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
      if (species.ear === 'point') {
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

    ctx.font = '700 18px Georgia';
    ctx.textAlign = 'center';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#fff';
    ctx.strokeText(player.name, player.x, player.y - 96);
    ctx.fillStyle = player.connected === false ? '#888' : config.INK;
    ctx.fillText(player.name, player.x, player.y - 96);
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
  const drawRidge = (width, height, view, f, baseY, amp, freq, color) => {
    const s = height / config.H;
    const shift = (view.scroll + view.cx) * f;
    const y0 = height * baseY + (config.H / 2 - view.cy) * view.zoom * f * 0.6;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, height);
    for (let sx = 0; sx <= width + 24; sx += 24) {
      const u = sx / s + shift;
      const h = Math.sin(u * freq) * 0.45 + Math.sin(u * freq * 2.3 + 1) * 0.35 + Math.sin(u * freq * 5.7 + 2) * 0.2;
      ctx.lineTo(sx, y0 - (h + 1) * amp * s);
    }
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();
  };

  // Background drawn in screen space, back to front, each layer scrolling at its own speed.
  const drawBackground = (width, height, view) => {
    const s = height / config.H;
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#5aa6c8');
    gradient.addColorStop(0.75, '#f2d9a0');
    gradient.addColorStop(1, '#e8c48a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    drawRidge(width, height, view, 0.04, 0.9, 120, 0.004, '#a9bccb');
    // High thin clouds.
    ctx.fillStyle = 'rgba(255,255,255,.45)';
    const span = width / s + 500;
    [[100, 140], [600, 90], [1100, 200], [1500, 60], [1900, 160], [2400, 110]].forEach(([x, y]) => {
      const cx = wrap(x - (view.scroll + view.cx) * 0.15, span) - 250;
      cloud(cx * s, (y + (config.H / 2 - view.cy) * view.zoom * 0.1) * s, 0.55 * s);
    });
    drawRidge(width, height, view, 0.1, 0.97, 90, 0.007, '#7f9a8c');
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

  const renderFrame = (time, view) => {
    const width = canvas.width;
    const height = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawBackground(width, height, view);

    // World layer, positioned by the camera.
    ctx.setTransform(view.zoom, 0, 0, view.zoom, width / 2 - view.cx * view.zoom, height / 2 - view.cy * view.zoom);
    drawNearClouds(width, height, view);

    ctx.save();
    ctx.translate(state.ship.shake > 0 ? (Math.random() - 0.5) * 16 : 0, -state.ship.alt + Math.sin(time / 1000) * 3);
    drawShip(time / 1000);
    drawGuns();
    drawHazards(time / 1000);
    [...Object.values(state.players), ...state.boarders].sort((a, b) => a.y - b.y).forEach((player) => drawPlayer(player, time / 1000));
    ctx.restore();
    drawEffects(time / 1000);

    // Screen overlay on a fixed 1600x900 stage.
    const scale = Math.min(width / config.W, height / config.H);
    ctx.setTransform(scale, 0, 0, scale, (width - config.W * scale) / 2, (height - config.H * scale) / 2);
    drawHud();
  };

  return { renderFrame, ink, drawBar };
}
