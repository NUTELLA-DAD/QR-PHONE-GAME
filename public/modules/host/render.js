import { config } from '../../config.js';
import { mainShip, eachShip } from './ships.js';
import { toWorldX, toWorldY, aimToWorld, pivotOf } from './pose.js';
import { installUprightText } from './uprightText.js';
import { createShipArt } from './shipArt.js';
import { createThreatArt } from './threatArt.js';
import { createHookArt } from './hookArt.js';
import { installLineBoil, setBoilTime, createFilmLook } from './style.js';
import { createSprites } from './sprites.js';
import { createCharacterArt } from './characterArt.js';
import { createCrewArt } from './crewArt.js';
import { createCourseArt } from './courseArt.js';
import { createSkyArt } from './skyArt.js';
import { createEnvArt } from './envArt.js';
import { UPGRADES } from './upgrades.js';
import { stopById, stopNo, stopTotal, modeInfo, dailyVoyage, dailyBest } from './voyage.js';
import { targets } from './aim.js';
import { createSpecialsArt } from './specialsArt.js';
import { createGunshipArt } from './gunshipArt.js';
import { distToGoal } from './maps.js';
import { createBackgroundArt } from './backgroundArt.js';
import { loadTextures } from './textureArt.js';
import { envIdOf } from './environments.js';
import { createSpotterArt } from './spotterArt.js';
import { perfLowFx } from './perf.js';
import { drawPuffs, drawRings, drawFlashes, drawFlame, drawFlakBurst } from './vfxArt.js'; // gouache explosions, smoke, ink ticks, flat flames
import { createLogbook } from './logbookArt.js'; // cream paper panels + red stamps (the captain's logbook HUD)
import { createLinkArt } from './linkArt.js'; // linked-station wires, gust warnings, surge rings
import { createSearchlightArt } from './searchlightArt.js'; // searchlight lamps, beams and the darkness overlay
import { crewHeads } from './crewscale.js';
import { bagNearX, bagEdgeY } from './shipBuild.js';
import { matesWanted } from './mates.js';
import { windSpeed } from './sails.js';
import { drawIceBlock, drawScreen as drawGoingDown, drawLimpCard, drawSpares } from './goingDownArt.js';

export function createRenderer({ ctx, state, canvas }) {
  const ship = mainShip(state); // (M.1: the world is drawn in map coordinates; this ship's art is drawn under her pose)
  const layout = ship.layout; // (this ship's own layout: the art reads it, a build applied at the dock updates it in place)
  // Real art from art/sprites/ where it exists; placeholder drawings everywhere else.
  const sprites = createSprites();
  sprites.load();
  const bgArt = createBackgroundArt({ ctx, state }); // optional painted backgrounds (art/backgrounds/)
  bgArt.load();
  loadTextures(ctx); // painted ship/gunship textures (art/textures/)
  // Placeholder tool in a sprite character's hand (drawCarry draws relative to the body).
  const drawItemAt = (item, x, y, swingAge, fired) => {
    ctx.save();
    ctx.translate(x - 16, y + 24);
    drawCarry(item, 1, swingAge, fired);
    ctx.restore();
  };
  const crewArt = createCrewArt({ ctx });
  const characterArt = createCharacterArt({ ctx, sprites, drawItem: (...a) => drawItemAt(...a) });
  const ink = () => {
    ctx.strokeStyle = config.INK;
    ctx.lineWidth = config.OUTLINE.MAIN;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
  };

  const rrect = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  };

  const book = createLogbook({ ctx }); // paper panels and red stamps for the HUD
  const LB = config.LOGBOOK;

  const drawShip = createShipArt({ ctx, state, ink, rrect, sprites, ship: mainShip(state) });
  const searchlightArt = createSearchlightArt({ ctx, state, ink });
  const threatArt = createThreatArt({ ctx, state, ink, sprites });
  const hookArt = createHookArt({ ctx, state, ink });
  const skyArt = createSkyArt({ ctx, state });
  const envArt = createEnvArt({ ctx, state, ink }); // Frost Peaks / Ember Forge look (sky, weather, lava, ice)
  const courseArt = createCourseArt({ ctx, state, ink, sprites, skyArt, envArt, bgArt });
  const drawSpecials = createSpecialsArt({ ctx, state, ink });
  const spotterArt = createSpotterArt({ ctx, state }); // spotted-target brackets, HELP! call-outs, primed-gun glow
  const linkArt = createLinkArt({ ctx, state });
  const drawGunship = createGunshipArt({ ctx, state, ink, sprites });
  installLineBoil(ctx);
  installUprightText(ctx); // (text drawn under a mirror - a ship that has come about - still reads the right way round)
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
        ctx.fillStyle = '#a8443f';
        ctx.beginPath();
        ctx.arc(gun.bx, gun.by, 16, 0, 7);
        ctx.fill();
        ink();
        ctx.stroke();
      }
      spotterArt.drawGunGlow(gun, performance.now() / 1000); // charging / primed shell
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
      const pip = Math.min(9, 72 / gun.max); // pip spacing: the row stays about 72 px wide however many shells a gun holds
      for (let i = 0; i < gun.max; i++) {
        ctx.fillStyle = i < gun.ammo ? '#f2d36b' : 'rgba(27,20,16,.3)';
        ctx.beginPath();
        ctx.arc(gun.bx - 31 + i * pip, gun.by + 30, Math.min(3.6, pip * 0.42), 0, 7);
        ctx.fill();
      }
      if (gun.empty > 0) {
        ctx.font = '22px ' + config.FONTS.DISPLAY;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#a8443f';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.strokeText(gun.emptyText || 'EMPTY!', gun.bx, gun.by - 32);
        ctx.fillText(gun.emptyText || 'EMPTY!', gun.bx, gun.by - 32);
        ink();
      }
    }
  };

  const drawHazards = (time) => {
    ink();
    for (const breach of state.breaches) {
      const y = layout.platforms[breach.d].y - 58;
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
      const y = layout.platforms[fire.d].y;
      const frame = 1 + (Math.floor(time * 8 + fire.x) % 4);
      const k = fire.big ? 1.7 : 1; // a fire in the coal (S.5f) is a big one: taller flames, and the black smoke is puffed by fire.js
      if (sprites.box(ctx, `fx/fire-${frame}`, fire.x - 30 * k, y - 70 * k, 60 * k, 70 * k) || sprites.box(ctx, 'fx/fire-1', fire.x - 30 * k, y - 70 * k, 60 * k, 70 * k)) {
        drawBar(fire.x, y - 70 * k, fire.prog);
        continue;
      }
      // Three flat flames, each stepping through 4 frames at 8 fps (no wobble).
      drawFlame(ctx, fire.x - 20 * k, y, 28 * k, 36 * k, time, 1 + fire.x * 0.013);
      drawFlame(ctx, fire.x + 20 * k, y, 28 * k, 36 * k, time, 2 + fire.x * 0.013);
      drawFlame(ctx, fire.x, y, 36 * k, 52 * k, time, fire.x * 0.013);
      drawBar(fire.x, y - 70 * k, fire.prog);
    }
    for (const player of Object.values(state.players)) {
      if (player.ko > 0) {
        ctx.font = '20px ' + config.FONTS.DISPLAY;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#a8443f';
        const gs = player.onGunship && state.gunship;
        ctx.fillText('KO!', player.x + (gs ? gs.dx : 0), player.y + (gs ? gs.dy : 0) - 80);
        drawBar(player.x + (gs ? gs.dx : 0), player.y + (gs ? gs.dy : 0) - 70, player.prog);
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
    ctx.scale(1, 1 - 0.45 * Math.min(1, Math.abs(state.enemy.bank) || 0)); // banking squashes her
    if (sprites.plane(ctx, 'fighter', time)) {
      ctx.restore();
      return;
    }
    // Devil's twin-boom fighter (after the reference sheet): grey boom with a twin tail and a
    // lightning bolt, engine with a red spinner, and a shark-mouthed pod with a devil in the cockpit.
    ink();
    ctx.lineWidth = 2.8;
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
    ctx.fillStyle = '#c9663a';
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
    ctx.fillStyle = '#a8443f';
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
    ctx.fillStyle = '#a8443f';
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
    ctx.fillStyle = '#2b2622';
    ctx.beginPath();
    ctx.arc(44, -17, 2.5, 0, 7);
    ctx.fill();
    // The devil pilot under a glass canopy.
    ctx.fillStyle = '#a8443f';
    ctx.beginPath();
    ctx.arc(10, -26, 8, 0, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ebdfc0';
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
      const r = t.r * (1.9 + 0.2 * Math.sin(time * 6 + p.x * 0.01));
      if (perfLowFx()) {
        ctx.fillStyle = 'rgba(255,60,80,.14)'; // (lowest detail: a flat glow, no gradient)
      } else {
        const g = ctx.createRadialGradient(p.x, p.y, t.r * 0.3, p.x, p.y, r);
        g.addColorStop(0, 'rgba(255,60,80,.3)');
        g.addColorStop(1, 'rgba(255,60,80,0)');
        ctx.fillStyle = g;
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, 7);
      ctx.fill();
    }
  };

  // The fighter's line of fire while it's on a strafing run.
  const drawFighterAim = (time) => {
    const e = state.enemy;
    if (e.dead > 0 || e.mode !== 'run' || !(e.shots > 0) || e.heading == null || state.phase === 'lobby') return;
    const d = Math.hypot(e.x - toWorldX(ship, layout.aimPoint.x), e.y - toWorldY(ship, layout.aimPoint.y));
    if (d > config.ENEMY.FIRE_RANGE + 500) return;
    ctx.strokeStyle = `rgba(255,50,70,${0.45 + 0.3 * Math.sin(time * 14)})`;
    ctx.lineWidth = 3.6;
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
    const L = layout.shield;
    const span = config.SHIELD.SPAN;
    const arc = () => {
      ctx.beginPath();
      for (let k = 0; k <= 24; k++) {
        const a = S.ang - span + (2 * span * k) / 24;
        const x = toWorldX(ship, L.cx + L.rx * Math.cos(a));
        const y = toWorldY(ship, L.cy + L.ry * Math.sin(a));
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
    const M = layout.coil;
    if (!M) return; // (a built ship may carry no Lightning Coil)
    const x = toWorldX(ship, M.x);
    const y = toWorldY(ship, M.y);
    ink();
    ctx.lineWidth = 3;
    ctx.fillStyle = '#5a3b26';
    ctx.fillRect(x - 26, y + 20, 52, 26);
    ctx.strokeRect(x - 26, y + 20, 52, 26);
    ctx.strokeStyle = '#c87533';
    ctx.lineWidth = 4.2;
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
    ctx.lineWidth = 2.8;
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
      const wa = aimToWorld(ship, C.aim); // (C.aim is in ship space, the line is drawn in the world)
      ctx.lineTo(x + Math.cos(wa) * 2400, y - 60 + Math.sin(wa) * 2400);
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

  // The supply balloon (a striped balloon with a crate) during a calm.
  const drawSupply = (time) => {
    const sp = state.supply;
    if (!sp || !state.course) return;
    const x = sp.mx;
    const y = sp.my + Math.sin((sp.bob || 0) * 1.3) * 30;
    const g = ctx.createRadialGradient(x, y, 40, x, y, 260);
    g.addColorStop(0, 'rgba(255,220,90,.45)');
    g.addColorStop(1, 'rgba(255,220,90,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, 260, 0, 7);
    ctx.fill();
    ink();
    ctx.lineWidth = 3;
    for (let k = 0; k < 6; k++) {
      ctx.fillStyle = k % 2 ? '#ffffff' : '#a8443f';
      ctx.beginPath();
      ctx.ellipse(x, y - 60, 90, 110, 0, -Math.PI / 2 + (k * Math.PI) / 3 - Math.PI / 2, -Math.PI / 2 + ((k + 1) * Math.PI) / 3 - Math.PI / 2);
      ctx.lineTo(x, y - 60);
      ctx.closePath();
      ctx.fill();
    }
    ctx.beginPath();
    ctx.ellipse(x, y - 60, 90, 110, 0, 0, 7);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 50, y + 30);
    ctx.lineTo(x - 30, y + 90);
    ctx.moveTo(x + 50, y + 30);
    ctx.lineTo(x + 30, y + 90);
    ctx.stroke();
    ctx.fillStyle = '#a0784a';
    ctx.fillRect(x - 40, y + 90, 80, 60);
    ctx.strokeRect(x - 40, y + 90, 80, 60);
    ctx.fillStyle = '#f2d36b';
    ctx.font = '27px ' + config.FONTS.DISPLAY;
    ctx.textAlign = 'center';
    ctx.fillText('+', x, y + 132);
  };

  // Muzzle flashes (flat stars at the barrel) and impact rings (a flat ring plus a few comic ink ticks); see vfxArt.js.
  const drawFlashesAndRings = () => {
    drawFlashes(ctx, state.flashes);
    drawRings(ctx, state.rings);
  };

  const drawEffects = (time, view) => {
    drawCoil(time);
    drawShield(time);
    drawThreatGlows(time);
    drawFighterAim(time);
    threatArt.drawWrecks();
    threatArt.drawMines(time);
    threatArt.drawBoss(time);
    threatArt.drawBombers(time);
    threatArt.drawBats(time);
    threatArt.drawStrafers(time);
    threatArt.drawRockets();
    drawSpecials(time);
    drawFlashesAndRings();
    drawSupply(time);
    drawPopups(view.zoom);
    drawEnemy(time);
    // Cartoon puffs: gouache explosions (rim, body, core), smoke inked on its outer edge only, plain white steam.
    drawPuffs(ctx, state.puffs);
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
    for (const shell of state.shells) {
      if (shell.primed) {
        glowShot(shell, '#ff9a2e', 17 + 3 * big, 0.09); // a primed shell: big, hot, orange-white
        ctx.strokeStyle = (ship.world.players[shell.owner] || {}).color || '#f2d36b';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(shell.x, shell.y, 25 + 3 * big, 0, 7);
        ctx.stroke();
      } else glowShot(shell, shell.frag ? '#ffd23f' : (ship.world.players[shell.owner] || {}).color || '#f2d36b', shell.frag ? 5 : 9 + 3 * big, 0.06);
    }
    for (const bullet of state.bullets) {
      if (bullet.flak) drawFlakBurst(ctx, bullet.x, bullet.y, 13); // (flak: a flat gouache burst)
      else glowShot(bullet, '#ff2e55', 12, 0.09);
    }
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
    // (Top-right corner, small: out of the way of the ship.)
    const w = 300;
    const h = Math.min(120, (w * map.H) / map.W);
    const x0 = 1600 - w - 22;
    const y0 = 16;
    book.paper(x0 - 12, y0 - 12, w + 24, h + 24, { r: 10 });
    ink();
    ctx.lineWidth = 2;
    ctx.strokeRect(x0 - 0.5, y0 - 0.5, w + 1, h + 1);
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
    ctx.arc(px(toWorldX(ship, layout.refPoint.x)), py(toWorldY(ship, layout.refPoint.y)), 6, 0, 7);
    ctx.fill();
    ctx.stroke();
    // The goal, small and always there: how far to the beacon, or how many outposts are left.
    const dCells = distToGoal(map, toWorldX(ship, layout.refPoint.x), toWorldY(ship, layout.refPoint.y));
    const km = Number.isFinite(dCells) ? (dCells * map.CELL) / config.MAPS.KM : null;
    let goalText;
    if (c.done) goalText = map.open ? 'ALL OUTPOSTS DOWN!' : 'BEACON REACHED!';
    else if (map.open) {
      const total = map.outposts.length;
      const left = map.outposts.filter((o) => !o.done).length;
      goalText = 'OUTPOSTS ' + (total - left) + '/' + total + (km === null ? '' : km < 0.5 ? ' - BOMBS AWAY!' : ' - next ' + km.toFixed(1) + ' km');
    } else goalText = 'BEACON ' + (km === null ? '?' : km.toFixed(1) + ' km');
    const gy0 = y0 + h + 24;
    book.paper(x0 - 12, gy0, w + 24, 36, { r: 8, pins: false });
    ctx.fillStyle = LB.INK;
    ctx.font = '700 15px ' + config.FONTS.TEXT;
    ctx.textAlign = 'center';
    ctx.fillText(goalText, x0 + w / 2, gy0 + 24, w);
    ctx.textAlign = 'left';
  };

  const drawRouteBar = () => {
    const c = state.course;
    const x0 = 560;
    const w = 480;
    const y = 52;
    book.paper(x0 - 30, y - 24, w + 60, 48, { r: 10, pins: false });
    ink();
    ctx.lineWidth = 3.2;
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

  // A ship with no boiler (S.5e) has no steam gauge: this line says what carries her instead (the wind), and what she lacks.
  const drawWindLine = () => {
    const r = state.rig || {};
    const sails = state.sails && state.sails.length ? ' - sails ' + state.sails.filter((s) => s.hoist > 0.95).length + '/' + state.sails.length + (state.sailWarn ? ' - GUST! REEF!' : '') : '';
    ctx.fillText(`Wind ${Math.round(windSpeed(state) * 100)}%${r.helm ? '' : ' - nobody steers'}${sails}`, 46, 100);
  };

  // Screen overlay (hull/steam panel, warnings). Drawn on a fixed 1600x900 stage, not zoomed by the camera.
  // The bow pennant (M.3): which way her bow points on the screen. While the helm holds COME ABOUT a bar fills under it, and during the turn it shows the progress; the
  // pennant squashes through zero and comes out the other way round with the ship. (Drawn on the HUD stage, between the Hull label and the raiders count.)
  const drawFacing = () => {
    const f = ship.pose.f;
    const g = state.turning || { hold: 0 };
    const T = config.SHIP.TURN;
    const turning = ship.pose.turn > 0;
    const cx = 222;
    const cy = 41;
    const squash = turning ? Math.abs(Math.cos(Math.PI * ship.pose.turn)) : 1;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = LB.INK;
    ctx.font = '700 11px ' + config.FONTS.TEXT;
    ctx.textAlign = 'center';
    ctx.fillText(turning ? 'COMING ABOUT' : 'AHEAD', 0, 4);
    // the pennant: a little pole and a flag that points the way the bow points (flipping with the ship)
    ctx.save();
    ctx.translate(f * 44, 0);
    ctx.scale(f * Math.max(0.02, squash), 1);
    ink();
    ctx.lineWidth = 2;
    ctx.fillStyle = LB.STAMP;
    ctx.beginPath();
    ctx.moveTo(-9, -8);
    ctx.lineTo(10, 0);
    ctx.lineTo(-9, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    if (turning || g.hold > 0) {
      const frac = turning ? ship.pose.turn : g.hold / T.HOLD;
      ctx.fillStyle = '#3b2a1d';
      ctx.fillRect(-40, 9, 80, 5);
      ctx.fillStyle = turning ? '#ffd23f' : '#ff8c1a';
      ctx.fillRect(-40, 9, 80 * Math.min(1, frac), 5);
    }
    ctx.restore();
  };

  const drawHud = () => {
    book.paper(30, 28, 440, 184, { r: 12 });
    ink();
    ctx.lineWidth = 2.5;
    ctx.fillStyle = '#3b2a1d';
    ctx.fillRect(46, 58, 408, 22);
    ctx.fillStyle = state.ship.hull > 35 ? '#4caf50' : '#e63946';
    ctx.fillRect(46, 58, 408 * state.ship.hull / 100, 22);
    ctx.strokeRect(46, 58, 408, 22);
    ctx.fillStyle = LB.INK;
    ctx.font = '18px ' + config.FONTS.DISPLAY;
    ctx.textAlign = 'left';
    ctx.fillText('Hull', 46, 51);
    ctx.font = '700 15px ' + config.FONTS.TEXT;
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
    // (A ship with no boiler (S.5e) has no steam to show: the steam gauge and the coal read-out give way to a wind line.)
    const steamed = !state.rig || state.rig.boiler;
    const warnAt = config.BOILER.WARN_AT / 100;
    const p = state.ship.press;
    const odAt = config.BOILER.OVERDRIVE_AT / 100;
    if (steamed) gauge(104, p, [[odAt, warnAt, 'rgba(255,190,60,.55)'], [warnAt, 1, 'rgba(230,57,70,.55)']], p >= config.BOILER.WARN_AT ? '#e63946' : p >= config.BOILER.OVERDRIVE_AT ? '#ffd23f' : '#e8eef2');
    // Overdrive zone label, and a thin stacked bar of where the steam goes.
    ctx.fillStyle = 'rgba(60,40,10,.8)';
    ctx.font = '700 10px ' + config.FONTS.TEXT;
    ctx.textAlign = 'center';
    if (steamed) ctx.fillText('OVERDRIVE', 46 + 408 * ((odAt + warnAt) / 2), 115);
    const sp = steamed ? state.steamParts : null;
    if (sp) {
      const segs = [['engines', '#5b8fd9', 'ENG'], ['pump', '#6cc070', 'PUMP'], ['shield', '#9b7be0', 'SHLD'], ['coil', '#7fd8ee', 'COIL'], ['leaks', '#e63946', 'LEAK'], ['vents', '#d6d6d6', 'VENT'], ['other', '#8a7560', '']];
      let sx = 46;
      ctx.fillStyle = '#3b2a1d';
      ctx.fillRect(46, 130, 408, 8);
      ctx.font = '700 8px ' + config.FONTS.TEXT;
      for (const [k, col, name] of segs) {
        const w = Math.min(408 - (sx - 46), (408 * (sp[k] || 0)) / config.BOILER.USE_GAUGE);
        if (w < 1) continue;
        ctx.fillStyle = col;
        ctx.fillRect(sx, 130, w, 8);
        if (name && w > 26) {
          ctx.fillStyle = '#1b1410';
          ctx.fillText(name, sx + w / 2, 137);
        }
        sx += w;
      }
    }
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
    // Trim (balance.js): a little seesaw under the gas bar. The needle is the ship's centre of mass against the middle of her lift: ahead of it she is
    // nose-heavy (needle right), behind it tail-heavy; it moves as the crew run about and the coal burns.
    const bal = state.balance;
    if (bal) {
      const B = config.BALANCE, bx = 164, bw = 100, by = 196, k = Math.max(-1, Math.min(1, bal.dx / B.FAIL_PX));
      const bad = Math.abs(bal.dx) > B.FAIL_PX ? '#c0392b' : Math.abs(bal.dx) > B.WARN_PX ? '#d89a1a' : '#5b9a4a';
      ctx.fillStyle = '#3b2a1d';
      ctx.fillRect(bx, by - 3, bw, 6);
      ctx.fillStyle = 'rgba(120,200,110,.7)';
      ctx.fillRect(bx + bw / 2 - (bw / 2) * (B.LEVEL_PX / B.FAIL_PX), by - 3, bw * (B.LEVEL_PX / B.FAIL_PX), 6);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(bx + bw / 2 - 1, by - 7, 2, 14);
      ctx.save();
      ctx.translate(bx + bw / 2 + (bw / 2) * k, by);
      ctx.rotate(-Math.PI / 2 + (bal.deg * Math.PI) / 180 * 3);
      ctx.fillStyle = bad;
      ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(7, -5); ctx.lineTo(7, 5); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.font = '700 11px ' + config.FONTS.TEXT;
      ctx.textAlign = 'left';
      ctx.fillStyle = LB.INK;
      ctx.fillText('TRIM', 124, by + 4);
      ctx.fillStyle = bad;
      ctx.fillText(Math.abs(bal.deg) < 0.05 ? 'level' : (bal.deg > 0 ? 'nose ' : 'tail ') + Math.abs(bal.deg).toFixed(1) + '\u00b0', bx + bw + 10, by + 4);
    }
    ctx.fillStyle = LB.INK;
    ctx.font = '700 14px ' + config.FONTS.TEXT;
    ctx.textAlign = 'left';
    const vents = (state.ventOpen || []).filter(Boolean).length;
    const leaking = state.steamParts && state.steamParts.leaks > 0.2;
    const sailTag = state.sails && state.sails.length ? ' - sails ' + state.sails.filter((s) => s.hoist > 0.95).length + '/' + state.sails.length + (state.sailWarn ? ' - GUST! REEF!' : '') : '';
    const steamText = 'Steam' + (vents ? ` - ${vents} vent${vents > 1 ? 's' : ''} open` : '') + (p >= config.BOILER.OVERDRIVE_AT && p < config.BOILER.WARN_AT ? ' - OVERDRIVE!' : '') + (state.rig && !state.rig.engine ? ' - no engines' : '') + sailTag;
    if (steamed) ctx.fillText(steamText, 46, 100);
    else drawWindLine();
    if (steamed && leaking) {
      const sw = ctx.measureText(steamText).width;
      ctx.fillStyle = LB.STAMP;
      ctx.fillText(' - LEAKING', 46 + sw, 100);
      ctx.fillStyle = LB.INK;
    }
    const valve = state.gasValve || {};
    ctx.fillText(`Gas${valve.input > 0.1 ? ' - PUMPING' : valve.input < -0.1 ? ' - VENTING' : ''}${state.buoyancy > 0 ? ' - RISING' : state.buoyancy < 0 ? ' - FALLING' : ''}${state.gasHoles.length ? ' - ' + state.gasHoles.length + ' leak' + (state.gasHoles.length > 1 ? 's' : '') : ''}`, 46, 150);
    if (state.bags && state.bags.length > 1) { // several gasbags: a pip for each, tail to nose (green = full, amber = low, red cross = flat)
      const bw = 16, gap = 4, x0 = 454 - state.bags.length * (bw + gap) + gap;
      state.bags.forEach((b, i) => {
        const x = x0 + i * (bw + gap), fill = Math.max(0, Math.min(1, b.gas / 100));
        ctx.fillStyle = '#3b2a1d';
        ctx.fillRect(x, 137, bw, 12);
        ctx.fillStyle = b.down ? '#a8443f' : fill < 0.3 ? '#e2a24a' : '#7fbf6f';
        ctx.fillRect(x + 1, 148 - 10 * fill, bw - 2, 10 * fill);
        ctx.strokeStyle = LB.INK;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, 137, bw, 12);
        if (b.down) { ctx.beginPath(); ctx.moveTo(x + 2, 139); ctx.lineTo(x + bw - 2, 147); ctx.moveTo(x + bw - 2, 139); ctx.lineTo(x + 2, 147); ctx.stroke(); }
        if (b.closed) { ctx.fillStyle = '#e2a24a'; ctx.fillRect(x - 1, 132, bw + 2, 4); } // (its gas valve is shut: cut off from the pump)
      });
    }
    ctx.textAlign = 'right';
    if (steamed) ctx.fillText('Coal ' + Math.round(state.ship.fuel) + '%', 454, 100);
    if (state.autopilot) {
      ctx.fillStyle = '#3a5a8c';
      ctx.textAlign = 'center';
      ctx.fillText('AUTOPILOT', 170, 50);
      ctx.fillStyle = config.INK;
      ctx.textAlign = 'right'; // (the labels below hang off the right edge: they were drifting out of the panel while the autopilot was on)
    }
    if (state.course && config.COURSE.ENABLED) {
      if (state.course.map) {
        const run = state.run;
        const stop = run && stopById(run.voyage, run.stopId);
        ctx.fillText(stop ? `Stop ${stopNo(run, stop)}/${stopTotal(run)}` : 'Mission ' + state.course.lap, 454, 150);
        if (run) {
          ctx.font = '700 13px ' + config.FONTS.TEXT;
          ctx.fillStyle = '#5a4a3a';
          ctx.fillText(modeLine(run), 454, 190, 200); // (below the gas bar and its needle, which reach down to y 178)
          ctx.font = '16px ' + config.FONTS.DISPLAY;
          ctx.fillStyle = '#8a5a00';
          ctx.fillText('Salvage ' + run.salvage, 454, 208);
          drawSpares(ctx, state, 470, 236, true, 0.8); // spare gasbags (lives)
          ctx.textAlign = 'left';
          ctx.fillStyle = state.salvagePop ? '#2e7d32' : '#5a4a3a';
          ctx.fillText(state.salvagePop ? `+${state.salvagePop.n} ${state.salvagePop.label}` : state.course.stop ? state.course.stop.name : '', 46, 204);
          ctx.textAlign = 'right';
          ctx.fillStyle = config.INK;
          ctx.font = '700 14px ' + config.FONTS.TEXT;
        }
        drawMinimap();
      } else {
        ctx.fillText('Lap ' + state.course.lap + (state.course.leg === 'home' ? ' - heading home' : ' - outbound'), 454, 150);
        drawRouteBar();
      }
    }

    if (state.ev.warn > 0) {
      // A compact message bar along the bottom (clear of the HUD and the ship), fading out.
      const text = state.ev.warnText || 'BOARDERS ON THE CATWALK!';
      ctx.globalAlpha = Math.min(1, state.ev.warn * 2);
      book.stamp(text, 800, state.boss ? 786 : 854, { size: 22, maxW: 1100 }); // red-ink stamp
      ctx.globalAlpha = 1;
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
    const screen = Math.max(1, 0.3 / zoom); // keep them readable when zoomed out (but small)
    for (const p of state.popups || []) {
      const grow = p.t < 0.12 ? 0.4 + (p.t / 0.12) * 0.8 : 1.2 - Math.min(0.2, (p.t - 0.12) * 0.6);
      const alpha = p.t > 0.75 ? Math.max(0, 1 - (p.t - 0.75) / 0.35) : 1;
      ctx.save();
      ctx.translate(p.x, p.y - p.t * 40);
      ctx.rotate(p.tilt);
      ctx.scale(grow * p.size * screen, grow * p.size * screen);
      ctx.globalAlpha = alpha;
      ctx.font = '29px ' + config.FONTS.DISPLAY;
      ctx.textAlign = 'center';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 5;
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
    book.paper(500, 96, 600, 116, { r: 14 });
    ctx.font = '62px ' + config.FONTS.DISPLAY;
    ctx.fillStyle = LB.INK;
    ctx.fillText('AIRSHIP CREW', 800, 170, 540);
    ctx.font = '700 14px ' + config.FONTS.TEXT;
    ctx.fillStyle = LB.INK_SOFT;
    ctx.fillText("THE CAPTAIN'S LOGBOOK", 800, 196);
    const crew = crewHeads(state);
    const mates = matesWanted(state, 0, true); // (ship's mates who will come aboard on CAST OFF)
    const lines = [
      'Scan the code with your phone to climb aboard (hold it sideways).',
      'Practise with tools and stations while moored.',
      crew ? `${crew} aboard${mates ? ` + ${mates} ship's mate${mates > 1 ? 's' : ''}` : ''} - press CAST OFF (or Space) when ready!` : 'Waiting for crew...',
    ];
    const rec = state.record || { laps: 0 };
    if (rec.laps > 0) lines.push(`Record on this TV: ${rec.laps} mission${rec.laps > 1 ? 's' : ''}, ${rec.kills} shot down`);
    const ly = 688;
    { // the chosen session mode, and the daily voyage with today's best
      const M = modeInfo(state.mode);
      let t = `${M.label}: ${M.blurb}, ${M.time}`;
      if (state.daily) {
        const d = dailyVoyage();
        const b = dailyBest(state.save, d.key, state.mode);
        t = `DAILY: ${d.name}  -  ${M.label}  -  today's best: ${b ? (b.victory ? 'VICTORY, ' : b.stops + ' stops, ') + b.salvage + ' salvage' : 'none yet'}`;
      }
      book.paper(300, ly - 52, 840, 40, { r: 12 });
      ctx.font = '700 18px ' + config.FONTS.TEXT;
      ctx.fillStyle = LB.INK;
      ctx.fillText(t, 720, ly - 26, 810);
    }
    book.paper(300, ly, 840, 28 + lines.length * 30, { r: 12 });
    ctx.font = '700 18px ' + config.FONTS.TEXT;
    lines.forEach((t, i) => {
      ctx.fillStyle = i === 2 ? '#2e7d32' : i === 3 ? LB.STAMP : LB.INK;
      ctx.fillText(t, 720, ly + 36 + i * 30, 800);
    });
  };

  // Lap scorecard: who did the most of each job.
  const drawScorecard = () => {
    const sc = state.scorecard;
    ctx.fillStyle = 'rgba(43,34,22,.7)';
    ctx.fillRect(-config.W, -config.H, config.W * 3, config.H * 3);
    book.paper(200, 110, 1200, 700, { r: 22 });
    ctx.textAlign = 'center';
    ctx.fillStyle = LB.INK;
    ctx.font = '49px ' + config.FONTS.DISPLAY;
    ctx.fillText(sc.flagship ? 'THE FLAGSHIP IS DOWN!' : `${sc.stopName} cleared!`, 800, 185);
    ctx.font = '700 26px ' + config.FONTS.TEXT;
    ctx.fillText(sc.rows.length ? 'Crew awards' : 'Nobody did much this mission... next time!', 800, 228);
    const G = sc.gain || {};
    const names = { kills: 'enemies', outposts: 'outposts', gunships: 'gunships', boss: 'boss', rescue: 'survivors', mission: 'mission bonus' };
    ctx.fillStyle = '#8a5a00';
    ctx.font = '23px ' + config.FONTS.DISPLAY;
    ctx.fillText(`Salvage +${sc.gained} (${Object.keys(G).map((k) => names[k] + ' ' + G[k]).join(', ')})   -   total ${sc.total}`, 800, 775 - (state.newRecord ? 45 : 0));
    ctx.fillStyle = config.INK;
    if (state.newRecord) {
      ctx.fillStyle = '#c0392b';
      ctx.font = '27px ' + config.FONTS.DISPLAY;
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
      ctx.font = '25px ' + config.FONTS.DISPLAY;
      ctx.fillStyle = config.INK;
      ctx.fillText(r.title, x + 70, y);
      ctx.fillStyle = r.color;
      ctx.strokeStyle = config.INK;
      ctx.lineWidth = 4;
      ctx.font = '23px ' + config.FONTS.DISPLAY;
      ctx.strokeText(r.name, x + 70, y + 34);
      ctx.fillText(r.name, x + 70, y + 34);
      ctx.fillStyle = '#5a4a3a';
      ctx.font = '400 22px ' + config.FONTS.TEXT;
      ctx.fillText(`${r.value} ${r.unit}`, x + 80 + ctx.measureText(r.name).width + 40, y + 34);
      ctx.fillStyle = config.INK;
    });
  };

  // Boss health bar across the top of the screen.
  const drawBossBar = () => {
    const z = state.boss;
    if (!z) return;
    book.paper(450, 826, 700, 54, { r: 10 });
    ctx.fillStyle = '#3b2a1d';
    ctx.fillRect(470, 856, 660, 14);
    ctx.fillStyle = '#c0453f';
    ctx.fillRect(470, 856, (660 * Math.max(0, z.hp)) / z.maxHp, 14);
    ink();
    ctx.lineWidth = 2.5;
    ctx.strokeRect(470, 856, 660, 14);
    ctx.fillStyle = LB.INK;
    ctx.font = '15px ' + config.FONTS.DISPLAY;
    ctx.textAlign = 'center';
    ctx.fillText(z.name || 'THE DREAD ZEPPELIN', 800, 849, 640);
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
      ctx.fillText(u.icon, x, 244);
      if (n > 1) {
        ctx.font = '700 15px ' + config.FONTS.TEXT;
        ctx.fillText('x' + n, x + 30, 244);
        ctx.font = '26px "Segoe UI Emoji", sans-serif';
      }
      x += n > 1 ? 58 : 38;
    }
  };

  // Wrap text into lines no wider than w (uses the current font).
  const wrapLines = (text, w) => {
    const lines = [];
    let line = '';
    for (const word of String(text).split(' ')) {
      if (line && ctx.measureText(line + word).width > w) {
        lines.push(line.trim());
        line = '';
      }
      line += word + ' ';
    }
    lines.push(line.trim());
    return lines;
  };
  const dots = (list, cx, y) => {
    list.forEach((p, k) => {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(cx - (list.length - 1) * 14 + k * 28, y, 11, 0, 7);
      ctx.fill();
      ink();
      ctx.lineWidth = 3;
      ctx.stroke();
    });
  };
  const skulls = (n) => '💀'.repeat(n);
  // "QUICK VOYAGE - voyage 2 of 2 - DAILY" (what this run is, for the HUD and the route map)
  const modeLine = (run) => modeInfo(run.mode).label + (run.voyages > 1 ? ` - voyage ${run.voyageNo} of ${run.voyages}` : '') + (run.daily ? ' - DAILY' : '');

  // Votes: the sky-dock shop and the route map. Each player's vote is a dot in their colour.
  const drawVote = () => {
    const v = state.vote;
    ctx.fillStyle = 'rgba(43,34,22,.72)';
    ctx.fillRect(-config.W, -config.H, config.W * 3, config.H * 3);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f3ead6';
    ctx.font = '40px ' + config.FONTS.DISPLAY;
    ctx.fillText(v.kind === 'dock' ? 'SKY-DOCK' : 'ROUTE MAP - WHERE TO NEXT?', 800, 82, 880);
    ctx.font = '700 20px ' + config.FONTS.TEXT;
    const run = state.run;
    ctx.fillStyle = '#ffd23f';
    if (v.kind === 'dock') ctx.fillText(`Salvage: ${run.salvage}   -   vote on your phone: buy something or CAST OFF   -   ${Math.max(0, Math.ceil(v.t))}s`, 800, 124, 1000);
    else ctx.fillText(`Vote on your phone - ${Math.max(0, Math.ceil(v.t))}s`, 800, 125);
    // Spare gasbags (lives) in the corner.
    ctx.fillStyle = '#f3ead6';
    ctx.font = '700 18px ' + config.FONTS.TEXT;
    ctx.textAlign = 'right';
    ctx.fillText('Spare gasbags', 1540, 48);
    drawSpares(ctx, state, 1540, 90, true, 1.15);
    ctx.textAlign = 'center';
    const voters = Object.values(state.players).filter((p) => !p.mate);
    if (v.kind === 'route') return drawRouteMap(v, voters);
    // The shop: up to 4 cards a row.
    const n = v.options.length;
    const perRow = n > 6 ? 4 : 3;
    const cw = perRow === 4 ? 360 : 470;
    const gap = 20;
    const ch = 330;
    v.options.forEach((o, i) => {
      const row = Math.floor(i / perRow);
      const inRow = Math.min(perRow, n - row * perRow);
      const col = i - row * perRow;
      const x = 800 - (inRow * cw + (inRow - 1) * gap) / 2 + col * (cw + gap);
      const y = 160 + row * (ch + 26);
      const off = o.kind !== 'cast' && (o.sold || o.cost > run.salvage);
      ctx.globalAlpha = off ? 0.5 : 1;
      book.paper(x, y, cw, ch, { r: 16, fill: o.kind === 'cast' ? '#d6e3bc' : o.kind === 'repair' ? '#ecdcae' : null });
      ctx.fillStyle = LB.INK;
      ctx.textAlign = 'center';
      ctx.font = '64px "Segoe UI Emoji", sans-serif';
      ctx.fillText(o.icon, x + cw / 2, y + 82);
      ctx.font = '27px ' + config.FONTS.DISPLAY;
      ctx.fillText(o.name, x + cw / 2, y + 128);
      ctx.font = '400 20px ' + config.FONTS.TEXT;
      wrapLines(o.desc, cw - 40).slice(0, 3).forEach((l, k) => ctx.fillText(l, x + cw / 2, y + 160 + k * 25));
      if (o.kind !== 'cast') {
        ctx.font = '25px ' + config.FONTS.DISPLAY;
        ctx.fillStyle = off && !o.sold ? '#b3261e' : config.INK;
        ctx.fillText(o.sold ? 'SOLD' : `Salvage ${o.cost}`, x + cw / 2, y + 282);
        if (o.max > 1 && !o.sold) {
          ctx.font = '700 16px ' + config.FONTS.TEXT;
          ctx.fillStyle = config.INK;
          ctx.fillText(`Level ${o.level} of ${o.max}`, x + cw / 2, y + 252);
        }
      }
      ctx.globalAlpha = 1;
      dots(voters.filter((p) => p.vote === i), x + cw / 2, y + ch - 14);
    });
  };

  // The route map: columns of stops joined by lines; the choices ahead are big, with their details.
  const drawRouteMap = (v, voters) => {
    const run = state.run;
    const cols = run.voyage.columns;
    const x0 = 150;
    const x1 = 1450;
    const px = (c) => x0 + ((x1 - x0) * c) / (cols.length - 1);
    const py = (s) => 330 + (cols[s.col].length === 1 ? 0 : (s.row - (cols[s.col].length - 1) / 2) * 150);
    const cur = stopById(run.voyage, run.stopId);
    // Paths.
    for (const col of cols) {
      for (const s of col) {
        for (const id of s.next) {
          const t = stopById(run.voyage, id);
          const walked = run.visited.includes(s.id) && run.visited.includes(id);
          const ahead = s.id === cur.id;
          ctx.strokeStyle = walked ? '#ffd23f' : ahead ? '#fff' : 'rgba(243,234,214,.35)';
          ctx.lineWidth = walked || ahead ? 6 : 3;
          ctx.setLineDash(walked ? [] : [10, 8]);
          ctx.beginPath();
          ctx.moveTo(px(s.col), py(s));
          ctx.lineTo(px(t.col), py(t));
          ctx.stroke();
        }
      }
    }
    ctx.setLineDash([]);
    // Stops.
    for (const col of cols) {
      for (const s of col) {
        const idx = v.options.findIndex((o) => o.id === s.id);
        const choice = idx >= 0;
        const visited = run.visited.includes(s.id);
        const r = choice ? 46 : 32;
        const env = config.VOYAGE.ENVIRONMENTS[s.env] || config.VOYAGE.ENVIRONMENTS.skyisles;
        ctx.globalAlpha = choice || visited ? 1 : 0.55;
        ctx.fillStyle = visited && !choice ? '#8a7a55' : env.color;
        ink();
        ctx.lineWidth = choice ? 6 : 4;
        ctx.beginPath();
        ctx.arc(px(s.col), py(s), r, 0, 7);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = config.INK;
        ctx.textAlign = 'center';
        ctx.font = (choice ? 44 : 30) + 'px "Segoe UI Emoji", sans-serif';
        ctx.fillText(s.flagship ? '🚩' : s.id === cur.id ? '🛩️' : env.icon, px(s.col), py(s) + (choice ? 15 : 10));
        ctx.globalAlpha = 1;
        if (s.id === cur.id) {
          ctx.fillStyle = '#ffd23f';
          ctx.font = '16px ' + config.FONTS.DISPLAY;
          ctx.fillText('YOU ARE HERE', px(s.col), py(s) - r - 12);
        }
        if (!choice && !visited) {
          ctx.fillStyle = 'rgba(243,234,214,.8)';
          ctx.font = '700 16px ' + config.FONTS.TEXT;
          ctx.fillText(skulls(s.danger), px(s.col), py(s) + r + 22);
        }
        if (choice) {
          ctx.fillStyle = '#fff';
          ctx.font = '20px ' + config.FONTS.DISPLAY;
          ctx.fillText(s.flagship ? 'THE FLAGSHIP' : env.name, px(s.col), py(s) + r + 28);
          dots(voters.filter((p) => p.vote === idx), px(s.col), py(s) - r - 24);
        }
      }
    }
    // Details of each choice, as a strip along the bottom.
    const n = v.options.length;
    const w = 440;
    v.options.forEach((o, i) => {
      const x = 800 - (n * w + (n - 1) * 20) / 2 + i * (w + 20);
      const y = 640;
      book.paper(x, y, w, 190, { r: 14 });
      ctx.fillStyle = LB.INK;
      ctx.textAlign = 'center';
      ctx.font = '25px ' + config.FONTS.DISPLAY;
      ctx.fillText(`${i + 1}. ${o.name}`, x + w / 2, y + 46, w - 50);
      ctx.font = '700 22px ' + config.FONTS.TEXT;
      ctx.fillText(o.kindName || '', x + w / 2, y + 82);
      ctx.font = '28px "Segoe UI Emoji", sans-serif';
      ctx.fillText(skulls(o.danger), x + w / 2, y + 122);
      ctx.font = '700 22px ' + config.FONTS.TEXT;
      ctx.fillText(`Reward: ${o.reward} salvage`, x + w / 2, y + 160);
    });
    book.paper(400, 842, 800, 44, { r: 12 });
    ctx.fillStyle = LB.INK;
    ctx.font = '700 20px ' + config.FONTS.TEXT;
    ctx.fillText(`${modeLine(run)}${run.daily ? ': ' + run.daily.name : ''}  -  stop ${stopNo(run, cur)} of ${stopTotal(run)} done  -  skulls = danger`, 800, 871, 770);
  };

  // End of the run: victory, or the summary after the ship is lost.
  const drawRunEnd = () => {
    const e = state.runEnd;
    ctx.fillStyle = 'rgba(43,34,22,.82)';
    ctx.fillRect(-config.W, -config.H, config.W * 3, config.H * 3);
    book.paper(250, 90, 1100, 720, { r: 22 });
    ctx.textAlign = 'center';
    book.stamp(e.victory ? 'VICTORY!' : 'SHIP LOST!', 800, 158, { size: 48, rot: -0.035, color: e.victory ? '#3f7a3c' : LB.STAMP });
    ctx.textAlign = 'center';
    ctx.fillStyle = LB.INK;
    ctx.font = '700 32px ' + config.FONTS.TEXT;
    ctx.fillText(e.victory ? 'The Flagship is down - the Broken Skies are yours!' : `You reached Stop ${e.reached} - ${e.stopName}`, 800, 240);
    ctx.font = '700 20px ' + config.FONTS.TEXT;
    ctx.fillStyle = LB.INK_SOFT;
    ctx.fillText(`${e.modeLabel}${e.voyages > 1 ? ' - voyage ' + e.voyageNo + ' of ' + e.voyages : ''}${e.daily ? ' - DAILY: ' + e.daily + (e.dailyBest ? ' (NEW BEST FOR TODAY!)' : '') : ''}`, 800, 205, 1000);
    ctx.fillStyle = LB.INK;
    ctx.font = '700 26px ' + config.FONTS.TEXT;
    ctx.fillText(`Stops finished: ${e.done} of ${e.total}   -   Salvage earned: ${e.salvage}`, 800, 295);
    ctx.fillText(`Enemies shot down: ${e.kills}   -   Gunships destroyed: ${e.gunships}`, 800, 335);
    ctx.font = '25px ' + config.FONTS.DISPLAY;
    ctx.fillText(e.rows.length ? 'Crew awards' : '', 800, 395);
    e.rows.forEach((r, i) => {
      const x = 330 + (i % 2) * 520;
      const y = 450 + Math.floor(i / 2) * 85;
      ctx.textAlign = 'left';
      ctx.fillStyle = config.INK;
      ctx.font = '40px "Segoe UI Emoji", sans-serif';
      ctx.fillText(r.icon, x, y + 12);
      ctx.font = '22px ' + config.FONTS.DISPLAY;
      ctx.fillText(r.title, x + 62, y - 4);
      ctx.fillStyle = r.color;
      ink();
      ctx.lineWidth = 4;
      ctx.font = '22px ' + config.FONTS.DISPLAY;
      ctx.strokeText(r.name, x + 62, y + 28);
      ctx.fillText(r.name, x + 62, y + 28);
      ctx.fillStyle = '#5a4a3a';
      ctx.font = '400 20px ' + config.FONTS.TEXT;
      ctx.fillText(`${r.value} ${r.unit}`, x + 76 + ctx.measureText(r.name).width + 20, y + 28);
    });
    ctx.textAlign = 'center';
    ctx.fillStyle = config.INK;
    ctx.font = '700 22px ' + config.FONTS.TEXT;
    const s = state.save;
    if (s) ctx.fillText(`Best run: ${s.bestStops} stops   -   Runs flown: ${s.totalRuns}   -   Victories: ${s.victories}`, 800, 745);
    ctx.font = '700 22px ' + config.FONTS.TEXT;
    const left = e.victory ? e.t : state.ship.down;
    ctx.fillText(`A new voyage starts at the mooring mast in ${Math.max(1, Math.ceil(left))}...`, 800, 785);
  };

  // The item a player is holding. swingAge = ms since their last attack (for the swing pose).
  // The player's harpoon-gun (hookshot), pointing forward (+x) from the hand at 0,0. When the
  // hook is out (fired) the muzzle is bare; hookArt draws the rope and the flying hook.
  const drawHookshotGun = (fired) => {
    try {
      ctx.save();
      ctx.rotate(-0.3);
      ctx.strokeStyle = config.INK;
      ctx.lineWidth = 1.8;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      const poly = (pts, fill) => {
        ctx.fillStyle = fill;
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      };
      // Coil of rope slung under the barrel.
      ctx.fillStyle = '#d6bf8a';
      ctx.beginPath();
      ctx.ellipse(16, 6, 8, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#a88a54';
      ctx.beginPath();
      ctx.ellipse(16, 6, 4.5, 3, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = config.INK;
      // Wooden stock and grip.
      poly([[-19, -3], [-5, -7], [8, -7], [8, 2], [1, 4], [-4, 13], [-12, 13], [-10, 3], [-19, 3]], '#9a6a3e');
      poly([[-19, -3], [-17, -3], [-17, 3], [-19, 3]], '#6b4a32');
      // Brass barrel with two bands and a flared muzzle.
      poly([[8, -9], [38, -9], [38, -1], [8, -1]], '#c9a54a');
      poly([[8, -9], [38, -9], [38, -6], [8, -6]], '#dcc272');
      poly([[17, -10], [20, -10], [20, 0], [17, 0]], '#8a6a2a');
      poly([[36, -11], [42, -12], [42, 2], [36, 1]], '#a8863a');
      if (!fired) {
        // Three-prong grappling hook seated at the muzzle.
        ctx.strokeStyle = config.INK;
        ctx.lineWidth = 4.6;
        ctx.beginPath();
        ctx.moveTo(42, -5);
        ctx.lineTo(50, -5);
        for (const [ex, ey] of [[58, -14], [61, -5], [58, 4]]) {
          ctx.moveTo(50, -5);
          ctx.quadraticCurveTo(55, ey, ex, ey * 0.8 - 1);
        }
        ctx.stroke();
        ctx.strokeStyle = '#8a8588';
        ctx.lineWidth = 2.6;
        ctx.stroke();
      }
      ctx.restore();
    } catch (e) {
      try { ctx.restore(); } catch (e2) {}
    }
  };

  const drawCarry = (item, face, swingAge, fired) => {
    ctx.save();
    ctx.translate(face * 16, -24);
    ctx.scale(face, 1);
    if (item === 'hookshot') {
      drawHookshotGun(!!fired);
      ctx.restore();
      return;
    }
    if (item === 'ice') {
      drawIceBlock(ctx, 4, 0, 0.8); // a block of ice from the locker (GOING DOWN!)
      ctx.restore();
      return;
    }
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
      ctx.fillStyle = '#a8443f';
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
      ctx.lineWidth = 3;
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
        ctx.fillStyle = '#5a5558';
        ctx.fillRect(-11, -50, 22, 14);
        ctx.strokeRect(-11, -50, 22, 14);
      }
    }
    ctx.restore();
  };

  // Where a player's Action would land (ship coordinates), for the highlight ring.
  const actionSpot = (act) => {
    const P = layout.platforms;
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
      case 'ice':
        return o.area === 'gasbag' ? { x: o.x, y: bagEdgeY(layout.gasbags[Math.max(0, bagNearX(layout.gasbags, o.x))], o.x, false) + 20, r: 60 } : o.gun ? { x: o.x, y: P[o.d].y - 50, r: 56 } : { x: o.x, y: P[o.d].y - 24, r: 52 };
      case 'gas':
        return { x: o.x, y: o.y, r: 40 };
      case 'unclog':
        return { x: o.x, y: P[o.d].y - 36, r: 54 };
      case 'oxygen':
        return { x: o.x, y: P[o.d].y - 60, r: 56 };
      case 'vent':
        return { x: o.x, y: P[o.d].y - 100, r: 42 };
      case 'gasvalve':
        return { x: o.x, y: P[o.d].y - 70, r: 42 };
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

  // A pulsing ring in each (human) player's colour around what their Action button will use (dashed: what GRAB will take or swap).
  const drawHighlights = (time) => {
    for (const p of Object.values(state.players)) {
      if (p.bot || p.ko > 0) continue;
      for (const act of [p.act, p.grabAct === p.act ? null : p.grabAct]) {
        const spot = act && actionSpot(act);
        if (!spot) continue;
        const pulse = 1 + Math.sin(time * 6) * 0.08;
        ctx.setLineDash(act === p.act ? [] : [7, 6]);
        ctx.lineWidth = 3.2;
        ctx.strokeStyle = config.INK;
        ctx.beginPath();
        ctx.arc(spot.x, spot.y, spot.r * pulse + 3, 0, 7);
        ctx.stroke();
        ctx.lineWidth = 2.8;
        ctx.strokeStyle = p.color;
        ctx.beginPath();
        ctx.arc(spot.x, spot.y, spot.r * pulse, 0, 7);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
  };

  const drawPlayer = (player, time) => {
    const species = config.SPECIES[player.species] || config.SPECIES.bulldog;
    const bob = player.moving ? Math.sin(time * 16) * 3 : player.climb ? Math.sin(time * 10) * 3 : 0;
    const face = player.face || 1;
    const actionAge = performance.now() - (player.actT || -1e9);
    const hop = actionAge < 400 ? Math.sin(actionAge / 400 * Math.PI) * 40 + (player.jz || 0) : player.jz || 0;
    // Parachute (bomb bay jump): the canopy opens above them (soft cream and sage, like the pilots'), cut away on landing.
    if (player.chute > 0 && player.fly) {
      const open = player.chuteOpen ? Math.min(1, (player.chute - config.AIR.CHUTE_DELAY) / 0.4 + 0.25) : 0.15;
      ctx.save();
      ctx.translate(player.x, player.y - 4);
      ctx.rotate((player.rot || 0) * 0.6);
      ink();
      ctx.lineWidth = 2.6;
      if (open > 0.3) {
        const cw = 62 * open;
        const ch = 44 * open;
        ctx.fillStyle = '#eee6d2';
        ctx.beginPath();
        ctx.ellipse(0, -150, cw, ch, 0, Math.PI, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#8fb37a';
        ctx.beginPath();
        ctx.ellipse(0, -150, cw * 0.36, ch, 0, Math.PI, 0);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        for (const k of [-1, -0.45, 0.45, 1]) {
          ctx.moveTo(k * cw, -150);
          ctx.lineTo(0, -88);
        }
        ctx.stroke();
      } else {
        // Still bundled: a little pack on their back.
        ctx.fillStyle = '#eee6d2';
        ctx.fillRect(-9 * (player.face || 1) - 7, -78, 14, 24);
        ctx.strokeRect(-9 * (player.face || 1) - 7, -78, 14, 24);
      }
      ctx.restore();
    }
    const art = characterArt.draw(player, time, bob + hop);
    if (!art) crewArt.draw(player, time, bob, hop, drawCarry);

    ctx.font = '700 18px ' + config.FONTS.TEXT;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#fff';
    const nameY = art ? player.y - bob - hop + art.top - 10 : player.y - 96 * (player.scale || 1);
    ctx.strokeText(player.name, player.x, nameY);
    ctx.fillStyle = player.connected === false ? '#888' : config.INK;
    ctx.fillText(player.name, player.x, nameY);
    if (player.windup > 0) {
      // Raider winding up to strike: big pulsing "!".
      const pulse = 1 + Math.sin(time * 30) * 0.15;
      ctx.font = `${Math.round(40 * pulse)}px ${config.FONTS.DISPLAY}`;
      ctx.lineWidth = 3.6;
      ctx.strokeStyle = '#fff';
      ctx.strokeText('!', player.x, nameY - 22);
      ctx.fillStyle = '#a8443f';
      ctx.fillText('!', player.x, nameY - 22);
    }
    if (actionAge < 900) {
      ctx.font = '23px ' + config.FONTS.DISPLAY;
      ctx.lineWidth = 3.2;
      ctx.strokeStyle = config.INK;
      ctx.fillStyle = '#fff';
      ctx.strokeText('Hey!', player.x, player.y - 126 - hop);
      ctx.fillText('Hey!', player.x, player.y - 126 - hop);
    }
  };

  // Crew in free flight (jumped, thrown or swinging on a hookshot) are world objects: drawn in map coordinates, after the ship, with their colour marker and rope.
  const drawAirborne = (time) => {
    hookArt.drawRopes(); // hookshot ropes and hooks (on the deck or in the air: the rope is in the world)
    for (const p of Object.values(state.players)) {
      if (!p.fly || p.hj || p.connected === false) continue;
      drawPlayer(p, time);
      if (!p.color) continue;
      const y = p.y - (p.ko > 0 ? 90 : 165) + Math.sin(time * 1000 / 300 + p.x) * 4;
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

  // A long soft cloud band across the sky (after Bomber XXL): a wavy ribbon of white haze.
  // Like the ridges, its shape is fixed to the landscape - it only slides past, never wobbles.
  const drawCloudBand = (width, height, view, f, baseY, thick, color) => {
    const s = height / config.H;
    const shift = view.cx * f;
    const y0 = height * baseY + (config.H / 2 - view.cy) * view.zoom * f * 0.6;
    const du = 24;
    const top = [];
    const bot = [];
    for (let u = Math.floor(shift / du) * du; (u - shift) * s <= width + du * s; u += du) {
      const x = (u - shift) * s;
      const w1 = Math.sin(u * 0.004) * 0.6 + Math.sin(u * 0.011 + 2) * 0.4;
      const w2 = Math.sin(u * 0.005 + 1) * 0.6 + Math.sin(u * 0.013 + 4) * 0.4;
      top.push([x, y0 - thick * s * (0.6 + 0.4 * w1)]);
      bot.push([x, y0 + thick * s * (0.3 + 0.3 * w2)]);
    }
    ctx.fillStyle = color;
    ctx.beginPath();
    top.forEach(([x, y]) => ctx.lineTo(x, y));
    for (let i = bot.length - 1; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1]);
    ctx.closePath();
    ctx.fill();
  };

  // A far-away mountain range. f = how strongly it follows the camera (0 = fixed, 1 = moves with the ship).
  // Samples sit on a grid fixed to the landscape (not the screen) so the outline doesn't shimmer.
  const drawRidge = (width, height, view, f, baseY, amp, freq, color, extra = {}) => {
    const s = height / config.H;
    const shift = view.cx * f;
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
      ctx.lineWidth = 3.2;
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
      ctx.lineWidth = 2.8;
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
    // Painted images for this environment (if any) replace the drawn sky and ridges.
    if (bgArt.draw(envIdOf(state), width, height, view, () => drawDrawnBackground(width, height, view))) return;
    drawDrawnBackground(width, height, view);
  };
  let skyGrad = null;
  let skyGradKey = '';
  let hazeGrad = null;
  let hazeGradH = -1;
  const drawDrawnBackground = (width, height, view) => {
    if (envArt.background(width, height, view)) return; // Frost Peaks / Ember Forge draw their own sky
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
    // (the sky gradient only changes with the screen height, dusk and storm: rebuilt only then, not every frame)
    const skyKey = height + '|' + dusk.toFixed(3) + '|' + storm.toFixed(3);
    if (skyKey !== skyGradKey || !skyGrad) {
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      // Soft, faded colours (after Bomber XXL): dusty blue overhead, pale haze at the horizon.
      gradient.addColorStop(0, mix('8fb3c9', '6a5a9c', '3a4048'));
      gradient.addColorStop(0.7, mix('cfdde2', 'f4a46a', '6a6e72'));
      gradient.addColorStop(1, mix('e3e6dc', 'e8865a', '585c60'));
      skyGrad = gradient;
      skyGradKey = skyKey;
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, width, height);
    skyArt.skyBack(width, height, view); // sun glow and god-rays

    // Cloud bands at different depths, the far ones fainter.
    drawCloudBand(width, height, view, 0.01, 0.2, 40, 'rgba(255,255,255,.22)');
    drawCloudBand(width, height, view, 0.03, 0.42, 60, 'rgba(255,255,255,.3)');
    skyArt.skyShips(width, height, view); // faint far-off airships
    drawRidge(width, height, view, 0.02, 0.86, 170, 0.003, '#c2d0d8', { snow: '#eef3f8' });
    drawRidge(width, height, view, 0.04, 0.9, 120, 0.004, '#b2c3cc');
    // Haze: distant hills fade into the sky.
    if (hazeGradH !== height || !hazeGrad) {
      hazeGrad = ctx.createLinearGradient(0, height * 0.6, 0, height);
      hazeGrad.addColorStop(0, 'rgba(225,232,232,0)');
      hazeGrad.addColorStop(1, 'rgba(225,232,232,.45)');
      hazeGradH = height;
    }
    ctx.fillStyle = hazeGrad;
    ctx.fillRect(0, height * 0.6, width, height * 0.4);
    drawCloudBand(width, height, view, 0.06, 0.66, 70, 'rgba(255,255,255,.35)');
    // High thin clouds.
    ctx.fillStyle = 'rgba(255,255,255,.45)';
    const span = width / s + 500;
    [[100, 140], [600, 90], [1100, 200], [1500, 60], [1900, 160], [2400, 110]].forEach(([x, y]) => {
      const cx = wrap(x - view.cx * 0.15, span) - 250;
      cloud(cx * s, (y + (config.H / 2 - view.cy) * view.zoom * 0.1) * s, 0.55 * s);
    });
    skyArt.skyBirds(width, height, view);
    drawRidge(width, height, view, 0.1, 0.97, 90, 0.007, '#9cb09c', { trees: '#8aa08b' });
  };

  // Big clouds in the world, drifting past at full ship speed (behind the ship).
  const drawNearClouds = (width, height, view) => {
    if (state.env && (state.env.id === 'fungal' || state.env.id === 'aether')) return; // (no fluffy white clouds in the mushroom caves or up in the Aether)
    const left = view.cx - width / 2 / view.zoom - 300;
    const top = view.cy - height / 2 / view.zoom;
    const viewW = width / view.zoom + 600;
    const viewH = height / view.zoom;
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    [[0, 0.1], [700, 0.75], [1300, 0.3], [1900, 0.9], [2600, 0.55], [3200, 0.2], [3900, 0.8]].forEach(([x, y], i) => {
      cloud(left + wrap(x - left, Math.max(viewW, 4200)), top + y * viewH, 1 + (i % 3) * 0.3); // (a pattern fixed to the world: they drift past the camera at ship speed)
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
    const rainWind = (state.env && state.env.wind ? state.env.wind : 0) * (config.ENVIRONMENTS.storm.RAIN.WIND_SLANT);
    ctx.strokeStyle = `rgba(200,215,230,${0.45 * w.storm})`;
    ctx.lineWidth = 3 / view.zoom * 0.6;
    ctx.beginPath();
    const n = Math.round(160 * w.storm);
    for (let i = 0; i < n; i++) {
      const x = left + ((i * 937.13 + time * 900) % (vw + 400)) - 200;
      const y = top + ((i * 613.7 + time * 2600 + i * 31) % (vh + 200)) - 100;
      ctx.moveTo(x, y);
      ctx.lineTo(x - 30 + rainWind, y + 90); // (a gust slants the rain)
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

  // Debugging: set window.renderProfile = {} and each frame adds the ms spent per stage to it.
  let lapT = 0;
  const lap = (name) => {
    const P = globalThis.renderProfile;
    if (!P) return;
    const now = performance.now();
    if (name) P[name] = (P[name] || 0) + now - lapT;
    lapT = now;
  };

  // renderFrame(time, view, opts): opts is optional and only used by the PvP arena (public/modules/host/pvp/), where two
  // renderers (one per ship) draw onto the SAME canvas with ONE shared camera. With no opts it draws everything as before (co-op).
  //   opts.layers       which parts to draw (array or Set; default = all):
  //                       'background'  sky, painted layers, clouds, rock, buildings, markers, turrets, bombs (shared scenery: renderer A only)
  //                       'ship'        this ship, her guns, crew, hazards, hooks and crew markers
  //                       'effects'     threats, shells, flashes, puffs, rain, snow and smoke
  //                       'dark'        the darkness overlay (dark skies)
  //                       'hud'         the co-op hull / steam / route panels and full-screen cards
  //                       'arrows'      lookout, gust and spotter arrows at the screen edge
  //                       'film'        the old-film look (off by default, config.STYLE)
  //   opts.worldOffset  { dx, dy }: where THIS ship's world sits in the shared camera's world (world pixels); everything
  //                       world-space (ship, crew, effects, arrows) is drawn shifted by it.
  //   opts.noClear      skip the sky fill (the first renderer already painted it); the other layers still draw.
  //   opts.bobPhase     seconds added to this ship's bob and sway, so two ships do not rock in step.
  const renderFrame = (time, view, opts) => {
    lap();
    const width = canvas.width;
    const height = canvas.height;
    const layers = opts && opts.layers ? (opts.layers instanceof Set ? opts.layers : new Set(opts.layers)) : null;
    const has = (name) => !layers || layers.has(name);
    const off = opts && opts.worldOffset;
    const odx = off && Number.isFinite(off.dx) ? off.dx : 0;
    const ody = off && Number.isFinite(off.dy) ? off.dy : 0;
    const wv = odx || ody ? { ...view, cx: view.cx - odx, cy: view.cy - ody } : view; // (the camera as THIS ship's world sees it)
    setBoilTime(time);
    skyArt.setTime(time / 1000);
    envArt.setTime(time / 1000);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (has('background') && !(opts && opts.noClear)) drawBackground(width, height, view);
    lap('background');

    // World layer, positioned by the camera.
    ctx.setTransform(view.zoom, 0, 0, view.zoom, width / 2 - wv.cx * view.zoom, height / 2 - wv.cy * view.zoom);
    if (has('background')) {
      if (!bgArt.has(envIdOf(state))) drawNearClouds(width, height, wv); // (a painted background brings its own clouds)
      if (!(state.course && state.course.map)) skyArt.fogBack(wv, width, height); // (caves draw it themselves)
      courseArt.drawTerrain(wv, width, height);
      courseArt.drawBuildings(wv, width, time / 1000);
      courseArt.drawMarkers(wv, width, time / 1000);
      courseArt.drawTurrets(time / 1000);
      drawBombs(time / 1000);
      skyArt.fogFront(wv, width, height); // thin fog over the rock, under the ship
    }
    lap('terrain');

    // Each ship's art is drawn under her pose. This renderer is made for ONE ship (its `state` is her context: her crew, her guns, fires and art bake), so it draws her;
    // another ship has a renderer of her own (main.js), drawing the 'ship' layer only.
    eachShip(state, (sh) => {
      if (sh !== ship) return;
      ctx.save();
      // A smooth, capped shake (no random jitter), a slow two-speed bob and a slight sway: she's a
      // big thing hanging in the air. (Visual only - collisions use the steady ship.)
      const ts = time / 1000;
      const bts = ts + (opts && Number.isFinite(opts.bobPhase) ? opts.bobPhase : 0);
      const amp = Math.min(config.CAMERA.SHAKE_MAX, state.ship.shake * config.CAMERA.SHAKE_SCALE);
      const bob = Math.sin(bts * 1.1) * 5 + Math.sin(bts * 0.37 + 1) * 3;
      // (the ship's art lives in her own frame: it is drawn where her pose says she is. Facing left it is mirrored about the middle of her bounds, and during a COME ABOUT
      // it is squashed through zero width: |cos| of the turn's progress, so the picture is thin at the middle of the turn, exactly when the facing flips.)
      const shipX = sh.pose.x + (amp ? Math.sin(ts * 61) * amp : 0);
      const shipY = sh.pose.y + bob + (amp ? Math.cos(ts * 47) * amp * 0.6 : 0);
      const squash = sh.pose.turn > 0 ? Math.max(0.02, Math.abs(Math.cos(Math.PI * sh.pose.turn))) : 1;
      if (sh.pose.f === 1 && squash === 1) ctx.translate(shipX, shipY);
      else {
        const pv = pivotOf(sh);
        ctx.translate(shipX + pv, shipY);
        ctx.scale(sh.pose.f * squash, 1);
        ctx.translate(-pv, 0);
      }
      {
        const sway = Math.sin(bts * 0.8) * 0.005 + Math.sin(bts * 0.31) * 0.004;
        const [px, py] = config.SHIP.TILT_PIVOT || layout.tiltPivot;
        ctx.translate(px, py);
        ctx.rotate((state.ship.pitch || 0) + sway);
        ctx.translate(-px, -py);
      }
      const drawShipAndCrew = () => {
        searchlightArt.drawBellyPod(); // (under the hull: the ladder and outrigger draw over it)
        drawShip(time / 1000);
        searchlightArt.drawLamps(time / 1000); // the two brass searchlights (also records where the beams start)
        lap('ship');
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
        envArt.drawIce(); // frost: ice crusts on the gasbag, top deck and guns
        envArt.drawDeep(); // fungal: spore clouds and clogged engines; aether: the oxygen tank
        envArt.drawShip(); // storm rods, sea pump, winch and flood water
        lap('guns+env');
        if (ship.main) drawGunship(time / 1000); // (the gunship hunts the main ship: she is drawn in HER frame)
        lap('gunship');
        drawHazards(time / 1000);
        threatArt.drawBombs(time / 1000);
        drawHighlights(time / 1000);
        lap('hazards');
        [...Object.values(state.players).filter((p) => !p.hj && !p.fly && !(p.lock && (state.escorts || []).some((e) => e.name === p.lock && e.flying))), ...state.boarders].sort((a, b) => a.y - b.y).forEach((player) => {
          // Crew aboard a gunship are stored in HER frame: draw them where she is.
          if (player.onGunship && state.gunship) {
            ctx.save();
            ctx.translate(state.gunship.dx, state.gunship.dy);
            drawPlayer(player, time / 1000);
            ctx.restore();
          } else drawPlayer(player, time / 1000);
        });
        linkArt.drawWires(time / 1000); // loader <-> gunner and lookout <-> helm wires, the boiler's SURGE ring
        // Each crew member's colour marker above their head, easy to spot from the sofa.
        for (const p of Object.values(state.players)) {
          if (!p.color || p.connected === false || p.fly) continue; // (a flying player is a world object: drawn after the ship, below)
          const gs = p.onGunship && state.gunship;
          const y = p.y + (gs ? gs.dy : 0) - (p.ko > 0 ? 90 : 165) + Math.sin(time / 300 + p.x) * 4;
          ink();
          ctx.lineWidth = 4;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          const px = p.x + (gs ? gs.dx : 0);
          ctx.moveTo(px - 16, y - 20);
          ctx.lineTo(px + 16, y - 20);
          ctx.lineTo(px, y);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          // Job finder: a small chevron above an idle player, pointing the way to the job it picked.
          const jb = p.job;
          if (jb && jb.dir && !p.bot && (p.freeT || 0) >= config.JOBS.IDLE_AFTER) {
            const v = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[jb.dir];
            const cy = y - 44 + Math.sin(time / 180) * 3;
            const cx = px + v[0] * 4;
            const ux = v[0];
            const uy = v[1];
            ctx.save();
            ctx.translate(cx, cy);
            ink();
            ctx.lineWidth = 3.4;
            ctx.lineJoin = 'round';
            ctx.fillStyle = jb.color;
            ctx.beginPath();
            // an arrowhead: tip ahead, two wings behind
            ctx.moveTo(ux * 16, uy * 16);
            ctx.lineTo(-ux * 10 - uy * 14, -uy * 10 + ux * 14);
            ctx.lineTo(-ux * 3, -uy * 3);
            ctx.lineTo(-ux * 10 + uy * 14, -uy * 10 - ux * 14);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
          }
          spotterArt.drawHelp(p, px, y, time / 1000); // HELP! call-out
        }
      };
      if (!has('ship')) { /* (another renderer draws this ship's layer, or none) */ } else if (state.wreck) {
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
      if (view.shipOverlay && has('ship')) view.shipOverlay(ctx, ts); // (dev pages draw on the ship's own coordinates: public/buildtest.html)
      ctx.restore();
    });
    if (has('ship')) drawAirborne(time / 1000); // crew in the air and their ropes live in the world, not in the ship's frame
    if (opts && opts.layers && has('shipfx')) { drawCoil(time / 1000); drawShield(time / 1000); } // (another ship's own effects; the first renderer's 'effects' layer draws its own)
    lap('crew');
    if (has('effects')) {
      drawEffects(time / 1000, wv);
      drawStorm(width, height, wv, time / 1000);
      envArt.worldFront(wv, width, height, time / 1000); // snow, blizzard haze, embers, smoke
    }
    lap('effects');
    if (has('dark')) searchlightArt.draw(wv, width, height, time / 1000); // darkness with light cut out, beams, lit-target brackets, glowing eyes
    lap('dark');

    if (has('hud')) {
      // Screen overlay on a fixed 1600x900 stage.
      const scale = Math.min(width / config.W, height / config.H);
      ctx.setTransform(scale, 0, 0, scale, (width - config.W * scale) / 2, (height - config.H * scale) / 2);
      drawHud();
      drawFacing();
      drawGoingDown(ctx, state, time / 1000, config.W, config.H); // GOING DOWN! alarm, meters, "SHE HOLDS!"
      drawLimpCard(ctx, state, config.W, config.H); // LIMPING HOME... (a spare gasbag was used)
      if (state.runEnd && (!state.wreck || state.wreck.t > 1.2)) {
        ctx.globalAlpha = state.wreck ? Math.min(1, (state.wreck.t - 1.2) * 2) : 1;
        drawRunEnd();
        ctx.globalAlpha = 1;
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    lap('hud');
    if (has('arrows')) {
      // Lookout arrows are sized in screen points, so undo the extra pixel density of sharp screens.
      const pr = canvas.width / (canvas.clientWidth || canvas.width) || 1;
      ctx.setTransform(pr, 0, 0, pr, 0, 0);
      threatArt.drawLookoutArrows(width / pr, height / pr, { ...wv, zoom: view.zoom / pr });
      linkArt.drawGust(width / pr, height / pr, { ...wv, zoom: view.zoom / pr }, time / 1000); // gust / updraft warning arrows ahead of the ship
      spotterArt.drawSpots(width / pr, height / pr, { ...wv, zoom: view.zoom / pr }, time / 1000); // SPOTTED marks (and edge arrows)
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    if (has('film')) filmLook(time, width, height);
    lap('film');
  };

  return { renderFrame, ink, drawBar, drawBackground, bgArt, sprites };
}
