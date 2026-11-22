// Game rules and state for Sus Station.
export const TICK_MS = 50;

export const WORLD = { w: 1600, h: 1000 };
export const PLAYER_R = 16;
export const SPEED = 205;
export const KILL_RANGE = 108;
export const KILL_COOLDOWN = 22;
export const START_KILL_COOLDOWN = 12;
export const REPORT_RANGE = 145;
export const TASK_RANGE = 85;
export const TASK_TIME = 2.4;
export const MEETING_TIME = 45_000;
export const END_TIME = 15_000;
export const EJECT_TIME = 7_000;
export const TASKS_PER_PLAYER = 5;
export const MAX_PLAYERS = 10;
export const MIN_PLAYERS = 3;

export const BUTTON = { x: 820, y: 175, name: 'Emergency Button' };

export const COLORS = [
  '#e8433f', '#3f7be8', '#3fbf72', '#e8a33f', '#b642e8',
  '#3fd6e8', '#e83fa6', '#e8e23f', '#f27c3f', '#8f9aa8',
];

export const ROOMS = [
  { id: 'admin', name: 'Admin', x: 60, y: 60, w: 300, h: 270 },
  { id: 'cafeteria', name: 'Cafeteria', x: 660, y: 60, w: 320, h: 300 },
  { id: 'weapons', name: 'Weapons', x: 1200, y: 60, w: 340, h: 270 },
  { id: 'reactor', name: 'Reactor', x: 60, y: 420, w: 260, h: 220 },
  { id: 'medbay', name: 'MedBay', x: 420, y: 400, w: 280, h: 240 },
  { id: 'electrical', name: 'Electrical', x: 1200, y: 420, w: 300, h: 220 },
  { id: 'shields', name: 'Shields', x: 60, y: 720, w: 300, h: 220 },
  { id: 'storage', name: 'Storage', x: 660, y: 700, w: 320, h: 260 },
  { id: 'navigation', name: 'Navigation', x: 1200, y: 700, w: 320, h: 220 },
];

export const HALLS = [
  { x: 350, y: 150, w: 320, h: 80 },
  { x: 960, y: 150, w: 260, h: 80 },
  { x: 130, y: 320, w: 80, h: 110 },
  { x: 760, y: 350, w: 80, h: 360 },
  { x: 310, y: 470, w: 120, h: 80 },
  { x: 690, y: 470, w: 520, h: 80 },
  { x: 160, y: 630, w: 80, h: 100 },
  { x: 350, y: 780, w: 320, h: 80 },
  { x: 970, y: 780, w: 240, h: 80 },
  { x: 1420, y: 320, w: 80, h: 110 },
  { x: 1420, y: 630, w: 80, h: 80 },
];

export const FLOORS = [...ROOMS, ...HALLS];

export const TASKS = [
  { id: 't1', room: 'Admin', name: 'Swipe Card', x: 210, y: 200 },
  { id: 't2', room: 'Admin', name: 'Upload Data', x: 315, y: 265 },
  { id: 't3', room: 'Cafeteria', name: 'Empty Garbage', x: 800, y: 120 },
  { id: 't4', room: 'Cafeteria', name: 'Download Data', x: 900, y: 310 },
  { id: 't5', room: 'Weapons', name: 'Clear Asteroids', x: 1380, y: 190 },
  { id: 't6', room: 'Weapons', name: 'Calibrate Turret', x: 1260, y: 120 },
  { id: 't7', room: 'Reactor', name: 'Start Reactor', x: 120, y: 540 },
  { id: 't8', room: 'Reactor', name: 'Unlock Manifolds', x: 255, y: 600 },
  { id: 't9', room: 'MedBay', name: 'Inspect Sample', x: 480, y: 480 },
  { id: 't10', room: 'MedBay', name: 'Fix Wiring', x: 650, y: 600 },
  { id: 't11', room: 'Electrical', name: 'Fix Wiring', x: 1250, y: 470 },
  { id: 't12', room: 'Electrical', name: 'Calibrate Distributor', x: 1430, y: 575 },
  { id: 't13', room: 'Shields', name: 'Prime Shields', x: 120, y: 810 },
  { id: 't14', room: 'Shields', name: 'Store Samples', x: 300, y: 880 },
  { id: 't15', room: 'Storage', name: 'Fuel Engines', x: 710, y: 800 },
  { id: 't16', room: 'Storage', name: 'Empty Chute', x: 900, y: 910 },
  { id: 't17', room: 'Navigation', name: 'Chart Course', x: 1290, y: 770 },
  { id: 't18', room: 'Navigation', name: 'Stabilize Steering', x: 1450, y: 860 },
];

export const TASK_BY_ID = Object.fromEntries(TASKS.map((t) => [t.id, t]));

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const rand = (n) => Math.floor(Math.random() * n);

export function roomAt(x, y) {
  const room = ROOMS.find(
    (r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h,
  );
  return room ? room.name : 'Hallway';
}

export function canStand(x, y) {
  return FLOORS.some(
    (f) =>
      x - PLAYER_R >= f.x &&
      x + PLAYER_R <= f.x + f.w &&
      y - PLAYER_R >= f.y &&
      y + PLAYER_R <= f.y + f.h,
  );
}

function shuffled(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function cleanName(raw, players) {
  let name = String(raw ?? '')
    .replace(/[<>&"']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 12);
  if (!name) name = 'Crewmate';
  const taken = new Set([...players.values()].map((p) => p.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  for (let i = 2; i < 100; i++) {
    const candidate = `${name.slice(0, 9)} ${i}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return name;
}

let nextPlayerId = 1;
let nextBodyId = 1;

export class GameRoom {
  constructor(code) {
    this.code = code;
    this.phase = 'lobby'; // lobby | playing | meeting | ended
    this.players = new Map();
    this.hostId = null;
    this.bodies = [];
    this.chat = [];
    this.meeting = null;
    this.winner = null;
    this.winnerReason = '';
    this.eject = null;
    this.endedAt = 0;
    this.createdAt = Date.now();
    this.tickCount = 0;
  }

  addPlayer(rawName) {
    if (this.phase !== 'lobby') return null;
    if (this.players.size >= MAX_PLAYERS) return null;
    const usedColors = new Set([...this.players.values()].map((p) => p.color));
    const color =
      COLORS.find((c) => !usedColors.has(c)) ?? COLORS[this.players.size % COLORS.length];
    const p = {
      id: `p${nextPlayerId++}`,
      name: cleanName(rawName, this.players),
      color,
      x: 820,
      y: 200,
      dead: false,
      impostor: false,
      tasks: [],
      kills: 0,
      killCooldown: 0,
      emergencyLeft: 1,
      voted: null,
      hold: null,
      moving: false,
      input: { up: false, down: false, left: false, right: false },
      joinedAt: Date.now(),
    };
    this.players.set(p.id, p);
    if (!this.hostId) this.hostId = p.id;
    this.placeInCafeteria(p);
    return p;
  }

  removePlayer(id) {
    if (!this.players.has(id)) return;
    this.players.delete(id);
    if (this.hostId === id) this.hostId = this.players.keys().next().value ?? null;
    if (this.phase === 'playing' || this.phase === 'meeting') {
      if (this.phase === 'meeting' && this.meeting && !this.meeting.allVotedAt) {
        const alive = [...this.players.values()].filter((p) => !p.dead);
        if (alive.length && alive.every((p) => p.voted)) this.meeting.allVotedAt = Date.now();
      }
      this.checkWin();
    }
  }

  placeInCafeteria(p) {
    const index = [...this.players.keys()].indexOf(p.id);
    const count = Math.max(1, this.players.size);
    const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
    p.x = 820 + Math.cos(angle) * 105;
    p.y = 200 + Math.sin(angle) * 90;
    p.input = { up: false, down: false, left: false, right: false };
    p.hold = null;
  }

  start(playerId) {
    if (this.phase !== 'lobby') return { error: 'That game has already started.' };
    if (playerId !== this.hostId) return { error: 'Only the host can start the game.' };
    if (this.players.size < MIN_PLAYERS) {
      return { error: `You need at least ${MIN_PLAYERS} players.` };
    }
    const list = [...this.players.values()];
    const impostorCount = list.length >= 7 ? 2 : 1;
    const order = shuffled(list);
    for (const p of list) {
      p.dead = false;
      p.impostor = false;
      p.kills = 0;
      p.emergencyLeft = 1;
      p.voted = null;
      p.hold = null;
      p.tasks = shuffled(TASKS).slice(0, TASKS_PER_PLAYER).map((t) => ({ id: t.id, done: false }));
      p.killCooldown = 0;
      this.placeInCafeteria(p);
    }
    for (let i = 0; i < impostorCount; i++) {
      order[i].impostor = true;
      order[i].killCooldown = START_KILL_COOLDOWN;
    }
    this.bodies = [];
    this.chat = [];
    this.meeting = null;
    this.winner = null;
    this.winnerReason = '';
    this.eject = null;
    this.phase = 'playing';
    return {};
  }

  say(id, text) {
    const p = this.players.get(id);
    if (!p) return;
    if (this.phase === 'playing') return;
    const clean = String(text ?? '')
      .replace(/[<>&]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
    if (!clean) return;
    const last = this.chat[this.chat.length - 1];
    if (last && last.playerId === p.id && last.text === clean && Date.now() - last.at < 500) return;
    this.chat.push({ playerId: p.id, name: p.name, color: p.color, text: clean, at: Date.now() });
    if (this.chat.length > 80) this.chat.shift();
  }

  startHold(id, taskId) {
    if (this.phase !== 'playing') return;
    const p = this.players.get(id);
    if (!p || p.dead) return;
    const task = p.tasks.find((t) => t.id === taskId);
    if (!task || task.done) return;
    const station = TASK_BY_ID[taskId];
    if (!station || dist(p, station) > TASK_RANGE) return;
    p.hold = { id: taskId, progress: 0 };
  }

  stopHold(id) {
    const p = this.players.get(id);
    if (p) p.hold = null;
  }

  advanceHold(p, dt) {
    if (!p.hold) return;
    const station = TASK_BY_ID[p.hold.id];
    if (!station || dist(p, station) > TASK_RANGE) {
      p.hold = null;
      return;
    }
    p.hold.progress += dt;
    if (p.hold.progress < TASK_TIME) return;
    const task = p.tasks.find((t) => t.id === p.hold.id);
    if (task) task.done = true;
    p.hold = null;
    if (!p.impostor) this.checkWin();
  }

  kill(id) {
    if (this.phase !== 'playing') return;
    const p = this.players.get(id);
    if (!p || p.dead || !p.impostor || p.killCooldown > 0) return;
    let victim = null;
    let best = KILL_RANGE;
    for (const q of this.players.values()) {
      if (q.dead || q.impostor || q.id === p.id) continue;
      const d = dist(p, q);
      if (d < best) {
        best = d;
        victim = q;
      }
    }
    if (!victim) return;
    victim.dead = true;
    victim.hold = null;
    p.kills += 1;
    p.killCooldown = KILL_COOLDOWN;
    this.bodies.push({
      id: `b${nextBodyId++}`,
      victim: victim.name,
      color: victim.color,
      x: victim.x,
      y: victim.y,
      room: roomAt(victim.x, victim.y),
    });
    this.checkWin();
  }

  report(id) {
    if (this.phase !== 'playing') return;
    const p = this.players.get(id);
    if (!p || p.dead) return;
    const body = this.bodies.find((b) => dist(p, b) < REPORT_RANGE);
    if (!body) return;
    this.startMeeting(`${p.name} reported ${body.victim}'s body`, p.name);
  }

  emergency(id) {
    if (this.phase !== 'playing') return;
    const p = this.players.get(id);
    if (!p || p.dead || p.emergencyLeft <= 0) return;
    if (dist(p, BUTTON) > 95) return;
    p.emergencyLeft -= 1;
    this.startMeeting(`${p.name} called an emergency meeting`, p.name);
  }

  startMeeting(reason, caller) {
    this.phase = 'meeting';
    this.bodies = [];
    for (const p of this.players.values()) {
      p.voted = null;
      p.hold = null;
      this.placeInCafeteria(p);
    }
    this.meeting = {
      reason,
      caller,
      startedAt: Date.now(),
      endsAt: Date.now() + MEETING_TIME,
      allVotedAt: null,
    };
  }

  vote(id, target) {
    if (this.phase !== 'meeting' || !this.meeting) return;
    const voter = this.players.get(id);
    if (!voter || voter.dead || voter.voted) return;
    if (target !== 'skip') {
      const t = this.players.get(target);
      if (!t || t.dead || t.id === voter.id) return;
    }
    voter.voted = target;
    const alive = [...this.players.values()].filter((p) => !p.dead);
    if (alive.length && alive.every((p) => p.voted)) {
      this.meeting.allVotedAt = this.meeting.allVotedAt ?? Date.now();
    }
  }

  finishMeeting() {
    if (this.phase !== 'meeting' || !this.meeting) return;
    const counts = new Map();
    let skip = 0;
    for (const p of this.players.values()) {
      if (p.dead || !p.voted) continue;
      if (p.voted === 'skip') skip += 1;
      else counts.set(p.voted, (counts.get(p.voted) ?? 0) + 1);
    }
    let topId = null;
    let topCount = 0;
    for (const [id, count] of counts) {
      if (count > topCount) {
        topCount = count;
        topId = id;
      }
    }
    const tied = [...counts.values()].filter((c) => c === topCount).length > 1;
    if (!topId || tied || skip >= topCount) {
      this.eject = {
        ejected: false,
        text: 'No one was ejected.',
        reveal: topCount === 0 ? 'Nobody cast a vote.' : 'The vote was skipped or tied.',
        color: '#8ea3c4',
        until: Date.now() + EJECT_TIME,
      };
    } else {
      const victim = this.players.get(topId);
      if (victim) {
        victim.dead = true;
        victim.hold = null;
        this.eject = {
          ejected: true,
          text: `${victim.name} was ejected.`,
          reveal: victim.impostor
            ? `${victim.name} was an impostor.`
            : `${victim.name} was not an impostor.`,
          name: victim.name,
          color: victim.color,
          impostor: victim.impostor,
          until: Date.now() + EJECT_TIME,
        };
      }
    }
    this.meeting = null;
    this.phase = 'playing';
    for (const p of this.players.values()) {
      p.voted = null;
      p.killCooldown = Math.max(p.killCooldown, 8);
      this.placeInCafeteria(p);
    }
    this.checkWin();
  }

  getProgress() {
    let total = 0;
    let done = 0;
    for (const p of this.players.values()) {
      if (p.impostor) continue;
      for (const t of p.tasks) {
        total += 1;
        if (t.done) done += 1;
      }
    }
    return { total, done, percent: total ? Math.round((done / total) * 100) : 0 };
  }

  checkWin() {
    if (this.phase === 'ended' || this.phase === 'lobby') return false;
    const alive = [...this.players.values()].filter((p) => !p.dead);
    const impostors = alive.filter((p) => p.impostor);
    const crew = alive.length - impostors.length;
    let winner = null;
    let reason = '';
    if (impostors.length === 0) {
      winner = 'crew';
      reason = 'Every impostor has been ejected.';
    } else if (impostors.length >= crew) {
      winner = 'impostor';
      reason = 'The impostors now match the crew.';
    } else {
      const progress = this.getProgress();
      if (progress.total > 0 && progress.done >= progress.total) {
        winner = 'crew';
        reason = 'The crew finished every task.';
      }
    }
    if (!winner) return false;
    this.phase = 'ended';
    this.winner = winner;
    this.winnerReason = reason;
    this.meeting = null;
    this.endedAt = Date.now() + END_TIME;
    return true;
  }

  toLobby() {
    this.phase = 'lobby';
    this.winner = null;
    this.winnerReason = '';
    this.eject = null;
    this.meeting = null;
    this.bodies = [];
    this.chat = [];
    for (const p of this.players.values()) {
      p.dead = false;
      p.impostor = false;
      p.tasks = [];
      p.kills = 0;
      p.killCooldown = 0;
      p.emergencyLeft = 1;
      p.voted = null;
      p.hold = null;
      this.placeInCafeteria(p);
    }
  }

  move(p, dt) {
    const input = p.input;
    let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    if (dx && dy) {
      dx *= Math.SQRT1_2;
      dy *= Math.SQRT1_2;
    }
    p.moving = !!(dx || dy);
    if (p.hold && p.moving) p.hold = null;
    const step = SPEED * dt;
    if (dx) {
      const nx = p.x + dx * step;
      if (canStand(nx, p.y)) p.x = nx;
    }
    if (dy) {
      const ny = p.y + dy * step;
      if (canStand(p.x, ny)) p.y = ny;
    }
  }

  update(dt) {
    this.tickCount += 1;
    const t = Date.now();
    if (this.phase === 'playing') {
      for (const p of this.players.values()) {
        p.killCooldown = Math.max(0, p.killCooldown - dt);
        if (p.hold) this.advanceHold(p, dt);
        this.move(p, dt);
      }
    } else if (this.phase === 'meeting' && this.meeting) {
      if (
        (this.meeting.allVotedAt && t >= this.meeting.allVotedAt + 2200) ||
        t >= this.meeting.endsAt
      ) {
        this.finishMeeting();
      }
    } else if (this.phase === 'ended' && t >= this.endedAt) {
      this.toLobby();
    }
    if (this.eject && t >= this.eject.until) this.eject = null;
  }

  snapshotFor(viewer) {
    const reveal = viewer.impostor || viewer.dead || this.phase === 'ended';
    let killTarget = null;
    let bestDist = KILL_RANGE;
    if (viewer.impostor && !viewer.dead && this.phase === 'playing') {
      for (const q of this.players.values()) {
        if (q.dead || q.impostor || q.id === viewer.id) continue;
        const d = dist(viewer, q);
        if (d < bestDist) {
          bestDist = d;
          killTarget = q.id;
        }
      }
    }
    const alivePlayers = [...this.players.values()].filter((p) => !p.dead);
    const progress = this.getProgress();
    return {
      t: 'state',
      phase: this.phase,
      code: this.code,
      hostId: this.hostId,
      viewerId: viewer.id,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        x: Math.round(p.x * 10) / 10,
        y: Math.round(p.y * 10) / 10,
        dead: p.dead,
        moving: p.moving,
        voted: !!p.voted,
        room: roomAt(p.x, p.y),
        impostor: reveal ? p.impostor : false,
        isHost: p.id === this.hostId,
      })),
      bodies: this.bodies.map((b) => ({
        id: b.id,
        victim: b.victim,
        color: b.color,
        x: b.x,
        y: b.y,
      })),
      you: {
        id: viewer.id,
        name: viewer.name,
        color: viewer.color,
        impostor: viewer.impostor,
        dead: viewer.dead,
        kills: viewer.kills,
        killCooldown: Math.ceil(viewer.killCooldown),
        killTarget,
        emergencyLeft: viewer.emergencyLeft,
        room: roomAt(viewer.x, viewer.y),
        tasks: viewer.tasks.map((t) => ({ id: t.id, done: t.done })),
        holdId: viewer.hold ? viewer.hold.id : null,
        holdProgress: viewer.hold ? Math.min(1, viewer.hold.progress / TASK_TIME) : 0,
      },
      progress,
      meeting:
        this.phase === 'meeting' && this.meeting
          ? {
              reason: this.meeting.reason,
              endsIn: Math.max(0, this.meeting.endsAt - Date.now()),
              myVote: viewer.voted,
              votes: alivePlayers.filter((p) => p.voted).length,
              aliveCount: alivePlayers.length,
            }
          : null,
      eject: this.eject
        ? {
            ejected: this.eject.ejected,
            text: this.eject.text,
            reveal: this.eject.reveal,
            color: this.eject.color,
            until: this.eject.until,
            msLeft: Math.max(0, this.eject.until - Date.now()),
          }
        : null,
      winner: this.winner,
      winnerReason: this.winnerReason,
      endedIn: this.phase === 'ended' ? Math.max(0, this.endedAt - Date.now()) : 0,
      chat: this.chat.slice(-40).map((m) => ({
        name: m.name,
        color: m.color,
        text: m.text,
        at: m.at,
      })),
    };
  }
}
