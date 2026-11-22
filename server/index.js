import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import {
  GameRoom,
  TICK_MS,
  WORLD,
  ROOMS,
  HALLS,
  TASKS,
  BUTTON,
  COLORS,
} from './game.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT || 3000);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
      return;
    }
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/index.html';
    const safe = pathname.replace(/\\/g, '/').replace(/\.\./g, '');
    const file = path.join(PUBLIC_DIR, safe);
    if (!file.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      res.end('forbidden');
      return;
    }
    const data = await fs.readFile(file);
    res.writeHead(200, {
      'content-type': MIME[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  }
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8192 });
const rooms = new Map();
const conns = new Map();

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeCode() {
  let code = '';
  for (let i = 0; i < 5; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}

function send(ws, payload) {
  if (ws.readyState === 1) ws.send(JSON.stringify(payload));
}

function sendError(ws, message) {
  send(ws, { t: 'error', message });
}

function join(ws, msg) {
  if (ws.playerId) return;
  let code = String(msg.room ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 5);
  let room;
  if (code) {
    room = rooms.get(code);
    if (!room) return sendError(ws, 'No room with that code. Check the code and try again.');
    if (room.phase !== 'lobby') return sendError(ws, 'That station is already in play. Try another code.');
    if (room.players.size >= 10) return sendError(ws, 'That room is full (10 players max).');
  } else {
    do {
      code = makeCode();
    } while (rooms.has(code));
    room = new GameRoom(code);
    rooms.set(code, room);
  }
  const player = room.addPlayer(msg.name);
  if (!player) return sendError(ws, 'Could not join that room.');
  ws.playerId = player.id;
  ws.roomCode = code;
  conns.set(player.id, { ws, roomCode: code });
  send(ws, {
    t: 'joined',
    id: player.id,
    code,
    name: player.name,
    map: {
      world: WORLD,
      rooms: ROOMS,
      halls: HALLS,
      tasks: TASKS,
      button: BUTTON,
      colors: COLORS,
    },
  });
}

function drop(ws) {
  if (!ws.playerId) return;
  const conn = conns.get(ws.playerId);
  conns.delete(ws.playerId);
  if (conn) {
    const room = rooms.get(conn.roomCode);
    if (room) {
      room.removePlayer(ws.playerId);
      if (room.players.size === 0) rooms.delete(conn.roomCode);
    }
  }
  ws.playerId = null;
}

function handle(ws, msg) {
  if (msg.t === 'join') return join(ws, msg);
  if (!ws.playerId) return;
  const conn = conns.get(ws.playerId);
  const room = conn ? rooms.get(conn.roomCode) : null;
  const me = room ? room.players.get(ws.playerId) : null;
  if (!room || !me) return;
  switch (msg.t) {
    case 'input':
      me.input = {
        up: !!msg.up,
        down: !!msg.down,
        left: !!msg.left,
        right: !!msg.right,
      };
      break;
    case 'hold':
      if (msg.on) room.startHold(me.id, String(msg.id ?? ''));
      else room.stopHold(me.id);
      break;
    case 'kill':
      room.kill(me.id);
      break;
    case 'report':
      room.report(me.id);
      break;
    case 'emergency':
      room.emergency(me.id);
      break;
    case 'vote':
      room.vote(me.id, String(msg.target ?? 'skip'));
      break;
    case 'chat':
      room.say(me.id, String(msg.text ?? ''));
      break;
    case 'start': {
      const result = room.start(me.id);
      if (result.error) sendError(ws, result.error);
      break;
    }
    default:
      break;
  }
}

wss.on('connection', (ws) => {
  ws.playerId = null;
  ws.on('message', (raw) => {
    if (raw.length > 4096) return;
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg.t !== 'string') return;
    handle(ws, msg);
  });
  ws.on('close', () => drop(ws));
  ws.on('error', () => drop(ws));
});

let lastTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(0.15, Math.max(0, (now - lastTick) / 1000));
  lastTick = now;
  for (const [code, room] of rooms) {
    room.update(dt);
    for (const player of room.players.values()) {
      const conn = conns.get(player.id);
      if (!conn || conn.roomCode !== code) continue;
      if (conn.ws.readyState !== 1) continue;
      try {
        conn.ws.send(JSON.stringify(room.snapshotFor(player)));
      } catch {
        drop(conn.ws);
      }
    }
    if (room.players.size === 0) rooms.delete(code);
  }
}, TICK_MS);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Sus Station listening on http://0.0.0.0:${PORT}`);
});
