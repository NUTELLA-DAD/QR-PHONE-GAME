import { config } from '../../config.js';
import { SHIP_LAYOUT } from '../../shipLayout.js';
import { createShipArt } from './shipArt.js';
import { createThreatArt } from './threatArt.js';
import { installLineBoil, setBoilTime, createFilmLook } from './style.js';
import { createSprites } from './sprites.js';
import { createCharacterArt } from './characterArt.js';
import { createCourseArt } from './courseArt.js';
import { UPGRADES } from './upgrades.js';

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
    ctx.rotate(Math.atan2(state.enemy.vy, state.enemy.vx || 1));
    if (state.enemy.vx < 0) ctx.scale(1, -1);
    if (sprites.plane(ctx, 'fighter', time)) {
      ctx.restore();
      return;
    }
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

  const drawEffects = (time, view) => {
    threatArt.drawWrecks();
    threatArt.drawMines(time);
    threatArt.drawCargo(time);
    threatArt.drawBoss(time);
    threatArt.drawBombers(time);
    threatArt.drawBats(time);
    threatArt.drawStrafers(time);
    threatArt.drawRockets();
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
    // Speed streaks behind shells and bullets.
    ctx.lineCap = 'round';
    for (const [list, color] of [[state.shells, 'rgba(255,240,190,.7)'], [state.bullets, 'rgba(255,170,160,.6)']]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 6;
      for (const p of list) {
        ctx.beginPath();
        ctx.moveTo(p.x - p.vx * 0.07, p.y - p.vy * 0.07);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
    }
    ink();
    for (const shell of state.shells) {
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.arc(shell.x, shell.y, 7 + 3 * ((state.upgrades || {})['big-shells'] || 0), 0, 7);
      ctx.fill();
      ctx.stroke();
    }
    for (const bullet of state.bullets) {
      ctx.fillStyle = bullet.flak ? '#3b3b3b' : '#e63946'; // flak from ground turrets is dark
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, bullet.flak ? 10 : 8, 0, 7);
      ctx.fill();
      ctx.stroke();
    }
  };

  // Lap progress: home mast, checkpoints, the beacon halfway, and the ship.
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
    // Steam pressure: red zone at the top means vent!
    const warnAt = config.BOILER.WARN_AT / 100;
    ctx.fillStyle = '#3b2a1d';
    ctx.fillRect(46, 104, 408, 14);
    ctx.fillStyle = 'rgba(230,57,70,.45)';
    ctx.fillRect(46 + 408 * warnAt, 104, 408 * (1 - warnAt), 14);
    ctx.fillStyle = state.ship.press >= config.BOILER.WARN_AT ? '#e63946' : state.ship.press < 30 ? '#e8913a' : '#e8eef2';
    ctx.fillRect(46, 104, 408 * state.ship.press / 100, 14);
    ink();
    ctx.lineWidth = 3;
    ctx.strokeRect(46, 104, 408, 14);
    // Gas in the envelope.
    ctx.fillStyle = '#3b2a1d';
    ctx.fillRect(46, 154, 408, 14);
    ctx.fillStyle = state.ship.gas < config.GAS.SINK_BELOW ? '#e63946' : '#a8d8a0';
    ctx.fillRect(46, 154, 408 * state.ship.gas / 100, 14);
    ctx.strokeRect(46, 154, 408, 14);
    ctx.fillStyle = config.INK;
    ctx.font = '700 16px Georgia';
    ctx.textAlign = 'left';
    ctx.fillText('Steam', 46, 100);
    ctx.fillText(`Gas${state.gasHoles.length ? ' - ' + state.gasHoles.length + ' leak' + (state.gasHoles.length > 1 ? 's' : '') : ''}${state.sinking ? ' - SINKING!' : ''}`, 46, 150);
    ctx.textAlign = 'right';
    ctx.fillText('Coal ' + Math.round(state.ship.fuel) + '%', 454, 100);
    if (state.autopilot) {
      ctx.fillStyle = '#3a5a8c';
      ctx.textAlign = 'center';
      ctx.fillText('AUTOPILOT', 250, 100);
      ctx.fillStyle = config.INK;
    }
    if (state.course && config.COURSE.ENABLED) {
      ctx.fillText('Lap ' + state.course.lap + (state.course.leg === 'home' ? ' - heading home' : ' - outbound'), 454, 150);
      drawRouteBar();
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
    if (state.ship.down > 0) {
      ctx.fillStyle = 'rgba(27,20,16,.55)';
      ctx.fillRect(-config.W, -config.H, config.W * 3, config.H * 3); // cover letterbox edges too
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.font = '900 64px Georgia';
      ctx.fillText('Hull breached! Patching up...', 800, 450);
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
    ctx.font = '700 26px Georgia';
    lines.forEach((t, i) => {
      ctx.lineWidth = 7;
      ctx.strokeStyle = '#fff';
      ctx.strokeText(t, 720, 760 + i * 40);
      ctx.fillStyle = i === 2 ? '#2e7d32' : config.INK;
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
    ctx.fillText('THE DREAD ZEPPELIN', 800, 847);
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
    courseArt.drawMarkers(time / 1000);
    courseArt.drawTurrets(time / 1000);

    ctx.save();
    ctx.translate(state.ship.shake > 0 ? (Math.random() - 0.5) * 16 : 0, -state.ship.alt + Math.sin(time / 1000) * 3);
    drawShip(time / 1000);
    drawGuns();
    drawHazards(time / 1000);
    threatArt.drawBombs(time / 1000);
    drawHighlights(time / 1000);
    [...Object.values(state.players), ...state.boarders].sort((a, b) => a.y - b.y).forEach((player) => drawPlayer(player, time / 1000));
    ctx.restore();
    drawEffects(time / 1000, view);
    drawStorm(width, height, view, time / 1000);

    // Screen overlay on a fixed 1600x900 stage.
    const scale = Math.min(width / config.W, height / config.H);
    ctx.setTransform(scale, 0, 0, scale, (width - config.W * scale) / 2, (height - config.H * scale) / 2);
    drawHud();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    threatArt.drawLookoutArrows(width, height, view);
    filmLook(time, width, height);
  };

  return { renderFrame, ink, drawBar };
}
