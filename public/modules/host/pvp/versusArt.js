// What the TV shows for a Versus match (pvp/match.js; PVP.md "Round flow"): the lobby with two mast pennants and the crew's heads under each, the two-sided HUD (hull bars, round
// pips and the round clock), the count-in, the shout when a round is decided, the scoreboard between rounds, and the match winner with the winners' faces. Captain's-logbook look
// (logbookArt.js, config.LOGBOOK, config.FONTS), the team colours of config.FLEET.TEAMS. All of it is drawn on the fixed 1600x900 stage. Never throws.
//
//   const art = createVersusArt({ ctx, fleet, drawCrewAt });
//   art.drawLobby(world, now)        // Versus lobby: the title, a card per team (pennant, name, heads), the hint line
//   art.drawHud(world, w, h, now)    // top bar, the compact panel of each ship, the count-in / FIGHT! / round result shouts
//   art.drawBoard(world, now)        // between rounds and when the match is over: the scoreboard
// drawCrewAt(player, x, y, scale, time) draws one crewman standing at (x, y) (render.js: the same sprites as on the ship).
import { config } from '../../../config.js';
import { createLogbook } from '../logbookArt.js';
import { createPvpArt } from './pvpArt.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));
const fmtTime = (t) => {
  const s = Math.max(0, Math.ceil(Number.isFinite(t) ? t : 0));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};

export function createVersusArt({ ctx, fleet, drawCrewAt }) {
  const book = createLogbook({ ctx });
  const pvp = createPvpArt({ ctx });
  const L = () => config.LOGBOOK;
  const team = (id) => config.FLEET.TEAMS[id] || config.FLEET.TEAMS.brass;
  const ink = (w) => {
    ctx.strokeStyle = config.INK;
    ctx.lineWidth = w;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
  };
  const text = (s, x, y, size, fill, align = 'center', font = config.FONTS.DISPLAY, maxW) => {
    ctx.font = (font === config.FONTS.TEXT ? '700 ' : '') + size + 'px ' + font;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = fill;
    if (maxW) ctx.fillText(s, x, y, maxW);
    else ctx.fillText(s, x, y);
  };
  // Words that jump out over the sky (white ink outline, a team colour or ink fill).
  const shout = (s, x, y, size, fill) => {
    ctx.font = size + 'px ' + config.FONTS.DISPLAY;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(6, size / 7);
    ctx.strokeStyle = config.INK;
    ctx.strokeText(s, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(s, x, y);
  };
  const crewOf = (world, id) => Object.values(world.players).filter((p) => p.team === id && !p.mate);

  // ---- the lobby ----
  // One team's card: its name and flag, how many are aboard, and their heads (the crew themselves, small).
  const teamCard = (world, id, x, y, w, time) => {
    const T = team(id);
    const crew = crewOf(world, id);
    const per = 4;
    const rows = Math.max(1, Math.ceil(crew.length / per));
    const h = 168 + rows * 118;
    book.paper(x, y, w, h, { r: 14 });
    ctx.fillStyle = T.color;
    ctx.fillRect(x + 12, y + 14, w - 24, 10);
    ink(2);
    ctx.strokeRect(x + 12, y + 14, w - 24, 10);
    pvp.pennant(x + w - 30, y + 150, id, 1, time, id === 'red' ? 0 : 1.9);
    text(T.name + ' CREW', x + 24, y + 74, 30, L().INK, 'left', config.FONTS.DISPLAY, 190);
    text(crew.length ? crew.length + ' aboard' : 'nobody yet', x + 26, y + 102, 15, L().INK_SOFT, 'left', config.FONTS.TEXT);
    crew.forEach((p, i) => {
      const cx = x + 60 + (i % per) * ((w - 120) / (per - 1 || 1));
      const cy = y + 232 + Math.floor(i / per) * 118;
      drawCrewAt(p, cx, cy, 0.42, time);
      text(p.name || '', cx, cy + 18, 13, p.bot ? L().INK_SOFT : L().INK, 'center', config.FONTS.TEXT, 86);
    });
  };
  const drawLobby = (world, time) => {
    try {
      const M = world.match;
      const t = time / 1000;
      ctx.save();
      book.paper(480, 18, 640, 112, { r: 14 });
      text('VERSUS', 800, 86, 60, L().INK);
      text("TWO CREWS, TWO AIRSHIPS, ONE SKY - BEST OF THREE", 800, 114, 13, L().INK_SOFT, 'center', config.FONTS.TEXT);
      teamCard(world, 'red', 40, 150, 420, t);
      teamCard(world, 'blue', 880, 150, 420, t);
      book.paper(430, 760, 740, 96, { r: 12 });
      text('Tap the banner on your phone to swap sides. Add bots to fill a crew.', 800, 800, 17, L().INK, 'center', config.FONTS.TEXT, 700);
      const mode = config.PVP.MODE === 'capture' ? 'CAPTURE: sink her, or hold her helm for ' + config.PVP.CAPTURE_TIME + ' s. (C: Broadside)' : 'BROADSIDE: sink or wreck the other ship. Boarders fight, sabotage and take the helm. (C: Capture)';
      text(mode, 800, 826, 15, L().INK_SOFT, 'center', config.FONTS.TEXT, 700);
      text(M && M.phase === 'shelf' ? 'Pick your ships on the phones!' : 'Press CAST OFF (or Space) to pick ships and start!', 800, 848, 15, L().STAMP, 'center', config.FONTS.TEXT, 700);
      ctx.restore();
    } catch (e) { try { ctx.restore(); } catch (e2) { /* ignore */ } }
  };

  // ---- the HUD ----
  const hullOf = (world, id) => {
    const sh = world.ships.find((s) => s.team && s.team.id === id);
    return sh ? clamp(sh.state.hull, 0, 100) : 0;
  };
  const drawHud = (world, w, h, time) => {
    try {
      const M = world.match;
      const P = config.PVP;
      const t = time / 1000;
      const timer = M.phase === 'count' ? P.ROUND_TIME : P.ROUND_TIME - M.fightT; // (frozen at what was left when the round was decided)
      const rounds = P.WINS_NEEDED * 2 - 1;
      pvp.drawHud({ round: Math.max(1, M.round), rounds, timer, left: { team: 'red', label: 'RED CREW', hull: hullOf(world, 'red'), wins: M.score.red }, right: { team: 'blue', label: 'BLUE CREW', hull: hullOf(world, 'blue'), wins: M.score.blue } }, w, h, time);
      ctx.save();
      for (const sh of world.ships) if (sh.team) fleet.panel(sh, sh.team.id === 'red' ? 30 : config.W - 30 - 238, 148, 238, 116);
      const cx = config.W / 2;
      if (M.phase === 'count') {
        const n = Math.ceil(P.COUNT_IN - M.t);
        shout(n > 0 ? String(n) : 'GO!', cx, 330, 190, '#fff2cf');
        shout((M.left === 'red' ? 'RED' : 'BLUE') + ' starts on the left', cx, 392, 34, '#fff2cf');
      } else if (M.phase === 'fight' && M.t < 1.6) {
        shout('FIGHT!', cx, 330, 150, '#ffd23f');
      } else if (M.phase === 'finale') {
        const win = M.roundWinner;
        shout(win ? team(win).name + ' WINS THE ROUND' : 'A DRAW', cx, 320, 76, win ? team(win).pale : '#fff2cf');
        const why = M.cause === 'captured' ? 'HELM TAKEN!' : M.cause === 'timeout' ? 'Out of time - the higher hull wins' : M.cause === 'sunk' ? 'She is going down!' : '';
        if (why) shout(why, cx, 372, 32, '#fff');
      }
      ctx.restore();
    } catch (e) { try { ctx.restore(); } catch (e2) { /* ignore */ } }
  };

  // ---- the scoreboard ----
  const ROWS = [['shots', 'Shells fired'], ['hits', 'Hits'], ['dmg', 'Hull damage dealt'], ['bumps', 'Collisions'], ['boardings', 'Boardings'], ['knockouts', 'Knock-outs'], ['sabotage', 'Boilers sabotaged'], ['captures', 'Helms taken'], ['patches', 'Patches and repairs']];
  const drawBoard = (world, time) => {
    try {
      const M = world.match;
      if (M.phase !== 'between' && M.phase !== 'over') return;
      const P = config.PVP;
      const last = M.results[M.results.length - 1];
      if (!last) return;
      const over = M.phase === 'over';
      const t = time / 1000;
      const x = 330, y = 96, w = 940, h = 730;
      ctx.save();
      book.paper(x, y, w, h, { r: 16 });
      const cx = x + w / 2;
      // headline
      const win = over ? M.winner : last.winner;
      const T = win && win !== 'draw' ? team(win) : null;
      if (over) text(T ? T.name + ' WINS THE MATCH!' : 'A DRAW!', cx, y + 76, 56, T ? T.dark : L().INK);
      else text('ROUND ' + last.round + ': ' + (T ? T.name + ' WINS' : 'A DRAW'), cx, y + 70, 48, T ? T.dark : L().INK);
      text((last.cause === 'captured' ? 'helm taken' : last.cause === 'timeout' ? 'on hull, at the time limit' : last.cause === 'both wrecked' ? 'both ships down' : 'ship sunk') + ' after ' + fmtTime(last.time), cx, y + 100, 15, L().INK_SOFT, 'center', config.FONTS.TEXT);
      // the score as pips
      const pip = (id, px) => {
        for (let i = 0; i < P.WINS_NEEDED; i++) {
          ctx.beginPath();
          ctx.arc(px + i * 34 * (id === 'red' ? 1 : -1), y + 150, 12, 0, 7);
          ctx.fillStyle = i < M.score[id] ? team(id).color : 'rgba(58,44,32,.12)';
          ctx.fill();
          ink(2.5);
          ctx.stroke();
        }
      };
      text('RED', cx - 150, y + 158, 28, team('red').dark, 'right');
      text('BLUE', cx + 150, y + 158, 28, team('blue').dark, 'left');
      pip('red', cx - 130 + 0);
      pip('blue', cx + 130);
      text(M.score.red + ' - ' + M.score.blue, cx, y + 162, 40, L().INK);
      // stat rows: this round (and, over, the match)
      const src = over ? M.totals : last.stats;
      text(over ? 'THE WHOLE MATCH' : 'THIS ROUND', cx, y + 204, 14, L().INK_SOFT, 'center', config.FONTS.TEXT);
      ROWS.forEach(([k, label], i) => {
        const ry = y + 236 + i * 32;
        if (i % 2 === 0) { ctx.fillStyle = 'rgba(107,74,50,.07)'; ctx.fillRect(x + 40, ry - 22, w - 80, 30); }
        text(String(Math.round(src.red[k] || 0)), cx - 190, ry, 22, team('red').dark, 'center');
        text(label, cx, ry, 16, L().INK, 'center', config.FONTS.TEXT);
        text(String(Math.round(src.blue[k] || 0)), cx + 190, ry, 22, team('blue').dark, 'center');
      });
      // the faces: the winners (or this round's winners), with their best
      const faces = win && win !== 'draw' ? crewOf(world, win) : [];
      faces.forEach((p, i) => {
        const fx = cx - ((faces.length - 1) * 70) / 2 + i * 70;
        drawCrewAt(p, fx, y + h - 78, 0.5, t);
      });
      if (last.mvp && !over) text('Best aboard: ' + last.mvp.name, cx, y + h - 46, 15, L().INK_SOFT, 'center', config.FONTS.TEXT);
      if (!over) text('Next round in ' + Math.max(0, Math.ceil(P.BETWEEN - M.t)) + ' - the sides swap!', cx, y + h - 22, 15, L().STAMP, 'center', config.FONTS.TEXT);
      else text('The rematch vote is coming up on the phones...', cx, y + h - 22, 15, L().INK_SOFT, 'center', config.FONTS.TEXT);
      ctx.restore();
    } catch (e) { try { ctx.restore(); } catch (e2) { /* ignore */ } }
  };

  return { drawLobby, drawHud, drawBoard, bang: pvp.drawBang, team };
}
