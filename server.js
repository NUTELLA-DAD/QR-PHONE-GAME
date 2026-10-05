// Relay + identity server. The HOST BROWSER runs the game; this just connects phones to it.
const express = require('express'), http = require('http'), os = require('os');
const QR = require('qrcode'), { Server } = require('socket.io');
const app = express(), server = http.createServer(app), io = new Server(server);
const PORT = process.env.PORT || 3000, MAX = 16;
const lan = () => { // prefer real home/office Wi-Fi ranges over virtual adapters (WSL, VPN, VirtualBox)
  const all = []; for (const [n, l] of Object.entries(os.networkInterfaces())) for (const i of l) if (i.family === 'IPv4' && !i.internal && !/vethernet|wsl|virtual|vmware|vbox|vpn|tailscale/i.test(n)) all.push(i.address);
  return all.find(a => a.startsWith('192.168.')) || all.find(a => a.startsWith('10.')) || all[0] || 'localhost'; };
const BASE = process.env.PUBLIC_URL || `http://${lan()}:${PORT}`; // set PUBLIC_URL when tunnelling/deploying
const COLORS = ['#e63946','#f4a261','#f1c40f','#2a9d8f','#3a86ff','#8338ec','#ff5da2','#06d6a0',
                '#ff7b00','#00b4d8','#9ef01a','#b5179e','#ffffff','#7f5539','#4cc9f0','#d00000'];

app.use(express.static('public'));
app.get('/api/info', (q, r) => r.json({ base: BASE }));
app.get('/qr', async (q, r) => r.type('image/svg+xml').send(await QR.toString(String(q.query.t || '').slice(0, 200), { type: 'svg', margin: 1 })));
app.get('/join/:code', (q, r) => r.redirect('/controller.html?code=' + encodeURIComponent(q.params.code)));

const rooms = {}; // code -> { host, players: { token: {token,name,species,color,sid} } }
const newCode = () => { let c; do c = Math.random().toString(36).slice(2, 6).toUpperCase(); while (rooms[c] || /[01OI]/.test(c)); return c; };

io.on('connection', (s) => {
  s.on('host:create', () => {
    const code = newCode(); rooms[code] = { host: s.id, players: {} };
    s.data = { host: code }; s.join(code); s.emit('host:created', code);
  });

  s.on('player:join', ({ code, name, species, token }) => {
    code = String(code || '').toUpperCase(); const room = rooms[code];
    if (!room) return s.emit('join:error', 'Room not found. Check the code.');
    let p = token && room.players[token];
    if (!p) {
      if (Object.keys(room.players).length >= MAX) return s.emit('join:error', 'Crew is full (16).');
      const used = Object.values(room.players).map(x => x.color);
      token = Math.random().toString(36).slice(2) + Date.now().toString(36);
      p = room.players[token] = { token, color: COLORS.find(c => !used.includes(c)) || COLORS[0] };
    }
    Object.assign(p, { sid: s.id, name: String(name || 'Crew').slice(0, 12), species: species || 'bulldog' });
    s.data = { code, token }; s.join(code);
    s.emit('join:ok', { token, color: p.color, name: p.name, code });
    io.to(room.host).emit('player:joined', { id: token, name: p.name, species: p.species, color: p.color });
  });

  s.on('player:input', (data) => {
    const { code, token } = s.data || {}; const room = rooms[code];
    if (!room || !token) return;
    // Joystick-only updates may be dropped when busy (a newer one follows); button presses never are.
    const onlyStick = Object.keys(data || {}).every((k) => k === 'jx' || k === 'jy');
    (onlyStick ? io.to(room.host).volatile : io.to(room.host)).emit('player:input', { id: token, data });
  });

  s.on('host:ui', ({ id, ui }) => { // host -> one phone
    const room = rooms[s.data?.host]; const p = room?.players[id];
    if (p?.sid) io.to(p.sid).emit('ui', ui);
  });

  s.on('disconnect', () => {
    const { host, code, token } = s.data || {};
    if (host) { io.to(host).emit('room:closed'); delete rooms[host]; }
    else if (rooms[code]?.players[token]?.sid === s.id) io.to(rooms[code].host).emit('player:left', { id: token });
  });
});

server.listen(PORT, () => console.log(`\nHost screen:  http://localhost:${PORT}/host.html\nPhones join:  ${BASE}\n`));
