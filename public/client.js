/* Sus Station client */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const KEYMAP = {
    w: 'up', arrowup: 'up',
    s: 'down', arrowdown: 'down',
    a: 'left', arrowleft: 'left',
    d: 'right', arrowright: 'right',
  };

  const keys = { up: false, down: false, left: false, right: false, e: false };
  const renderPos = new Map();
  const tasksById = new Map();

  let ws = null;
  let myId = null;
  let map = null;
  let state = null;
  let screen = 'menu';
  let pendingJoin = null;
  let holdingId = null;
  let lastInputSig = '';
  let lobbySig = '';
  let meetingSig = '';
  let toastTimer = 0;
  let cam = { x: 820, y: 200 };
  let lastFrame = performance.now();
  let dpr = 1;

  const cv = $('game');
  const ctx = cv.getContext('2d');
  const mini = $('minimap');
  const mctx = mini.getContext('2d');

  const stars = Array.from({ length: 240 }, () => ({
    x: Math.random() * 2000 - 200,
    y: Math.random() * 1400 - 200,
    r: Math.random() * 1.5 + 0.3,
    a: Math.random() * 0.45 + 0.12,
    p: Math.random() * Math.PI * 2,
  }));

  /* ------------------------------ helpers ------------------------------ */

  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function toast(msg, kind = 'error') {
    const el = $('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    el.style.borderColor = kind === 'ok' ? 'rgba(87,227,137,.55)' : '';
    el.style.color = kind === 'ok' ? '#c9ffdc' : '';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 3200);
  }

  function send(payload) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(payload));
  }

  function typing() {
    const a = document.activeElement;
    return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA');
  }

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  /* ------------------------------ socket ------------------------------ */

  function openSocket() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => {
      if (pendingJoin) {
        ws.send(JSON.stringify(pendingJoin));
        pendingJoin = null;
      }
    };
    ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      onMessage(msg);
    };
    ws.onclose = () => {
      ws = null;
      if (screen !== 'menu') {
        toMenu();
        toast('Disconnected from the station.');
      }
    };
  }

  function ensureJoin(payload) {
    pendingJoin = payload;
    if (ws && ws.readyState === 1) {
      const p = pendingJoin;
      pendingJoin = null;
      ws.send(JSON.stringify(p));
      return;
    }
    if (ws && ws.readyState === 0) return;
    openSocket();
  }

  function onMessage(msg) {
    if (msg.t === 'joined') {
      myId = msg.id;
      map = msg.map;
      tasksById.clear();
      for (const t of map.tasks) tasksById.set(t.id, t);
      renderPos.clear();
      $('roomCode').textContent = msg.code;
      if (history.replaceState) {
        const url = new URL(location.href);
        url.searchParams.set('room', msg.code);
        history.replaceState({}, '', url);
      }
      return;
    }
    if (msg.t === 'error') {
      toast(msg.message);
      if (screen === 'menu' && ws) {
        ws.close();
        ws = null;
      }
      return;
    }
    if (msg.t === 'state') {
      state = msg;
      applyState();
    }
  }

  /* ------------------------------ screens ------------------------------ */

  function setScreen(name) {
    screen = name;
    $('menu').classList.toggle('hidden', name !== 'menu');
    $('lobby').classList.toggle('hidden', name !== 'lobby');
    $('hud').classList.toggle('hidden', name !== 'game');
    if (name !== 'game') {
      $('meeting').classList.add('hidden');
      $('result').classList.add('hidden');
      $('eject').classList.add('hidden');
      $('prompt').classList.add('hidden');
    }
  }

  function toMenu() {
    setScreen('menu');
    state = null;
    myId = null;
    holdingId = null;
    lobbySig = '';
    meetingSig = '';
    $('roomCode').textContent = '-----';
  }

  function applyState() {
    if (!state || !state.you) return;
    if (state.phase === 'lobby') {
      if (screen !== 'lobby') setScreen('lobby');
      renderLobby();
    } else {
      if (screen !== 'game') setScreen('game');
      syncHud();
    }
    syncMeeting();
    syncResult();
    syncEject();
    updateHold();
  }

  /* ------------------------------ lobby ------------------------------ */

  function nameValue() {
    const raw = $('nameInput').value.replace(/\s+/g, ' ').trim().slice(0, 12);
    return raw || 'Crewmate';
  }

  function renderLobby() {
    const sig = state.code + '|' + state.players.map((p) => `${p.id}:${p.name}:${p.isHost}`).join('|');
    if (sig !== lobbySig) {
      lobbySig = sig;
      const wrap = $('lobbyPlayers');
      wrap.innerHTML = '';
      for (const p of state.players) {
        const el = document.createElement('div');
        el.className = 'lobby-player' + (p.id === myId ? ' me' : '');
        el.innerHTML =
          `<span class="dot" style="background:${p.color};color:${p.color}"></span>` +
          `<span>${esc(p.name)}</span>` +
          (p.isHost ? '<span class="tag">HOST</span>' : '');
        wrap.appendChild(el);
      }
    }
    const count = state.players.length;
    const impostors = count >= 7 ? 2 : 1;
    $('lobbyHint').textContent =
      count < 3
        ? `Waiting for players (${count}/3 minimum)`
        : `${count} aboard · ${impostors} impostor${impostors > 1 ? 's' : ''} · share the code`;
    const startBtn = $('startBtn');
    startBtn.classList.toggle('hidden', state.hostId !== myId);
    startBtn.disabled = count < 3;
    startBtn.textContent = count < 3 ? 'Need 3 players' : 'Start game';
    renderChat($('chatLog'), state.chat);
  }

  function renderChat(el, chat) {
    const key = `${chat.length}:${chat.length ? chat[chat.length - 1].at : 0}`;
    if (el.dataset.key === key) return;
    el.dataset.key = key;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    el.innerHTML = chat
      .map(
        (m) =>
          `<div class="msg"><span class="who" style="color:${m.color}">${esc(m.name)}</span> ${esc(m.text)}</div>`,
      )
      .join('');
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }

  /* ------------------------------ HUD ------------------------------ */

  function mePlayer() {
    return state ? state.players.find((p) => p.id === myId) : null;
  }

  function nearestOwnTask() {
    if (!state || !state.you || state.phase !== 'playing') return null;
    const me = mePlayer();
    if (!me) return null;
    let best = null;
    let bestDist = 95;
    for (const t of state.you.tasks) {
      if (t.done) continue;
      const st = tasksById.get(t.id);
      if (!st) continue;
      const d = Math.hypot(me.x - st.x, me.y - st.y);
      if (d < bestDist) {
        bestDist = d;
        best = st;
      }
    }
    return best;
  }

  function syncHud() {
    const you = state.you;
    const me = mePlayer();
    const chip = $('roleChip');
    chip.textContent = you.impostor ? 'IMPOSTOR' : 'CREWMATE';
    chip.classList.toggle('imp', !!you.impostor);
    chip.classList.toggle('crew', !you.impostor);
    $('hudAlive').textContent = `${state.players.filter((p) => !p.dead).length} alive`;
    $('hudLocation').textContent = you.room || '';

    const prog = state.progress;
    $('taskFill').style.width = `${prog.percent}%`;
    $('taskText').textContent = `Tasks ${prog.done}/${prog.total}`;

    const list = you.tasks
      .map((t) => {
        const st = tasksById.get(t.id);
        return `<div class="task ${t.done ? 'done' : ''}">
          <span class="box">${t.done ? '✓' : ''}</span>
          <span>${esc(st ? st.name : t.id)}</span>
          <span class="where">${esc(st ? st.room : '')}</span>
        </div>`;
      })
      .join('');
    $('taskList').innerHTML = list || '<div class="task">Impostors get no real tasks.</div>';

    const near = nearestOwnTask();
    const prompt = $('prompt');
    if (near && !you.dead) {
      prompt.classList.remove('hidden');
      $('promptLabel').textContent = `Hold E — ${near.name}`;
      $('promptFill').style.width = `${(you.holdId === near.id ? you.holdProgress : 0) * 100}%`;
    } else {
      prompt.classList.add('hidden');
    }

    const alive = !you.dead && state.phase === 'playing';
    const nearBody = !!me && state.bodies.some((b) => Math.hypot(me.x - b.x, me.y - b.y) < 150);
    $('btnReport').disabled = !(alive && nearBody);
    const nearButton = !!me && Math.hypot(me.x - map.button.x, me.y - map.button.y) < 95;
    $('btnEmergency').disabled = !(alive && nearButton && you.emergencyLeft > 0);
    $('btnEmergency').querySelector('small').textContent =
      you.emergencyLeft > 0 ? 'B' : 'USED';

    const kill = $('btnKill');
    if (you.impostor) {
      kill.classList.remove('hidden');
      kill.disabled = !(alive && you.killCooldown <= 0 && you.killTarget);
      kill.querySelector('b').textContent = you.killCooldown > 0 ? you.killCooldown : 'KILL';
    } else {
      kill.classList.add('hidden');
    }

    $('ghostBanner').classList.toggle('hidden', !you.dead);
  }

  /* ------------------------------ meeting ------------------------------ */

  function syncMeeting() {
    const m = state.meeting;
    if (!m) {
      $('meeting').classList.add('hidden');
      meetingSig = '';
      return;
    }
    $('meeting').classList.remove('hidden');
    $('meetReason').textContent = m.reason;
    $('meetTimer').textContent = Math.ceil(m.endsIn / 1000);
    $('voteCount').textContent = `${m.votes}/${m.aliveCount} voted`;

    const alive = state.players.filter((p) => !p.dead);
    const sig = `${alive.map((p) => `${p.id}:${p.voted ? 1 : 0}`).join(',')}|${m.myVote}|${state.you.dead}`;
    if (sig !== meetingSig) {
      meetingSig = sig;
      const grid = $('voteGrid');
      grid.innerHTML = alive
        .map(
          (p) => `<button class="vote ${m.myVote === p.id ? 'picked' : ''}" data-target="${p.id}" ${m.myVote || state.you.dead ? 'disabled' : ''}>
            <span class="dot" style="background:${p.color};color:${p.color}"></span>
            <span>${esc(p.name)}</span>
            ${p.voted ? '<span class="voted-tick">VOTED</span>' : ''}
          </button>`,
        )
        .join('');
      for (const btn of grid.querySelectorAll('.vote')) {
        btn.onclick = () => send({ t: 'vote', target: btn.dataset.target });
      }
    }

    const skip = $('skipBtn');
    skip.disabled = !!m.myVote || !!state.you.dead;
    skip.classList.toggle('picked', m.myVote === 'skip');
    renderChat($('meetChat'), state.chat);
  }

  function syncEject() {
    const e = state.eject;
    if (!e || state.phase === 'meeting') {
      $('eject').classList.add('hidden');
      return;
    }
    $('eject').classList.remove('hidden');
    $('ejectText').textContent = e.text;
    $('ejectSub').textContent = e.reveal || '';
  }

  function syncResult() {
    const el = $('result');
    if (state.phase !== 'ended') {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    const title = $('resultTitle');
    title.textContent = state.winner === 'crew' ? 'CREW WINS' : 'IMPOSTORS WIN';
    title.className = state.winner === 'crew' ? 'crew' : 'imp';
    $('resultReason').textContent = state.winnerReason;
    const imps = state.players.filter((p) => p.impostor);
    $('resultImps').textContent = imps.length
      ? `Impostor${imps.length > 1 ? 's' : ''}: ${imps.map((p) => p.name).join(', ')}`
      : '';
    $('resultCount').textContent = `Back to lobby in ${Math.ceil(state.endedIn / 1000)}s`;
  }

  /* ------------------------------ holding tasks ------------------------------ */

  function updateHold() {
    if (!state || !state.you || state.phase !== 'playing' || state.you.dead) {
      if (holdingId) {
        send({ t: 'hold', id: holdingId, on: false });
        holdingId = null;
      }
      return;
    }
    if (holdingId && state.you.holdId !== holdingId) holdingId = state.you.holdId;
    const near = nearestOwnTask();
    if (keys.e && near) {
      if (holdingId !== near.id) {
        if (holdingId) send({ t: 'hold', id: holdingId, on: false });
        holdingId = near.id;
        send({ t: 'hold', id: holdingId, on: true });
      }
    } else if (holdingId) {
      send({ t: 'hold', id: holdingId, on: false });
      holdingId = null;
    }
  }

  /* ------------------------------ input ------------------------------ */

  function sendInput() {
    const sig = `${+keys.up}${+keys.down}${+keys.left}${+keys.right}`;
    if (sig === lastInputSig) return;
    lastInputSig = sig;
    send({ t: 'input', up: keys.up, down: keys.down, left: keys.left, right: keys.right });
  }

  addEventListener('keydown', (e) => {
    if (typing()) {
      if (e.key === 'Escape') document.activeElement.blur();
      return;
    }
    const k = e.key.toLowerCase();
    const dir = KEYMAP[k];
    if (dir) {
      keys[dir] = true;
      sendInput();
      e.preventDefault();
      return;
    }
    if (screen !== 'game') return;
    if (k === 'e') {
      if (!keys.e) {
        keys.e = true;
        updateHold();
      }
      e.preventDefault();
    } else if (k === 'q') {
      send({ t: 'kill' });
    } else if (k === 'r') {
      send({ t: 'report' });
    } else if (k === 'b') {
      send({ t: 'emergency' });
    }
  });

  addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    const dir = KEYMAP[k];
    if (dir) {
      keys[dir] = false;
      sendInput();
    }
    if (k === 'e') {
      keys.e = false;
      updateHold();
    }
  });

  addEventListener('blur', () => {
    keys.up = keys.down = keys.left = keys.right = keys.e = false;
    sendInput();
    updateHold();
  });

  /* ------------------------------ menu / lobby wiring ------------------------------ */

  $('createBtn').onclick = () => ensureJoin({ t: 'join', name: nameValue() });
  $('joinBtn').onclick = () => {
    const code = $('codeInput').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length < 4) return toast('Enter the 5-character room code.');
    ensureJoin({ t: 'join', name: nameValue(), room: code });
  };
  $('codeInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('joinBtn').click();
  });
  $('nameInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('createBtn').click();
  });
  $('startBtn').onclick = () => send({ t: 'start' });
  $('skipBtn').onclick = () => send({ t: 'vote', target: 'skip' });
  $('btnKill').onclick = () => send({ t: 'kill' });
  $('btnReport').onclick = () => send({ t: 'report' });
  $('btnEmergency').onclick = () => send({ t: 'emergency' });

  $('copyBtn').onclick = async () => {
    const url = `${location.origin}/?room=${state ? state.code : ''}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('Invite link copied.', 'ok');
    } catch {
      toast(`Share this code: ${state ? state.code : ''}`, 'ok');
    }
  };

  function wireChat(formId, inputId) {
    $(formId).addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $(inputId);
      const text = input.value.trim();
      if (!text) return;
      send({ t: 'chat', text });
      input.value = '';
    });
  }
  wireChat('chatForm', 'chatInput');
  wireChat('meetForm', 'meetInput');

  /* ------------------------------ rendering ------------------------------ */

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.floor(innerWidth * dpr);
    cv.height = Math.floor(innerHeight * dpr);
    cv.style.width = `${innerWidth}px`;
    cv.style.height = `${innerHeight}px`;
  }
  addEventListener('resize', resize);
  resize();

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = clamp(((n >> 16) & 255) + amt * 255, 0, 255);
    const g = clamp(((n >> 8) & 255) + amt * 255, 0, 255);
    const b = clamp((n & 255) + amt * 255, 0, 255);
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }

  function floorRect(r, fill, stroke) {
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, 12);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }

  function drawTaskMarker(t, mine, time) {
    const pulse = 1 + Math.sin(time / 380 + t.x * 0.01) * 0.09;
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.scale(pulse, pulse);
    ctx.rotate(Math.PI / 4);
    if (mine) {
      ctx.shadowColor = 'rgba(255,217,90,0.85)';
      ctx.shadowBlur = 16;
    }
    ctx.fillStyle = mine ? '#ffd95a' : 'rgba(108,146,205,0.28)';
    ctx.beginPath();
    ctx.roundRect(-8, -8, 16, 16, 4);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = mine ? 'rgba(120,80,0,0.5)' : 'transparent';
    ctx.stroke();
    ctx.restore();
  }

  function drawBody(b) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(0, 8, 16, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(-0.45);
    ctx.fillStyle = shade(b.color, -0.12);
    ctx.beginPath();
    ctx.roundRect(-14, -9, 28, 18, 9);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // bone
    ctx.strokeStyle = '#f3f7ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-2, -10);
    ctx.lineTo(10, -10);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-2, -10, 2.6, 0, Math.PI * 2);
    ctx.arc(10, -10, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = '#f3f7ff';
    ctx.fill();
    // X eyes
    ctx.strokeStyle = '#121a28';
    ctx.lineWidth = 2;
    for (const ex of [-8, 0]) {
      ctx.beginPath();
      ctx.moveTo(ex - 2, -2);
      ctx.lineTo(ex + 2, 2);
      ctx.moveTo(ex + 2, -2);
      ctx.lineTo(ex - 2, 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPlayer(p, rp, isSelf, viewerDead, mate) {
    const dead = p.dead;
    const bob = dead ? Math.sin(performance.now() / 450 + rp.x * 0.1) * 3 : 0;
    ctx.save();
    ctx.translate(rp.x, rp.y + bob);
    ctx.globalAlpha = dead ? 0.4 : 1;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 14, 15, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    // backpack
    ctx.fillStyle = shade(p.color, -0.32);
    ctx.beginPath();
    ctx.roundRect(-16, -8, 8, 20, 3);
    ctx.fill();
    // body
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.roundRect(-11, -16, 22, 30, 11);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.stroke();
    // visor
    ctx.fillStyle = '#c9ecff';
    ctx.beginPath();
    ctx.ellipse(3, -6, 6.5, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.ellipse(5, -8, 2, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (isSelf) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = dead ? '#8fd4ff' : '#ffffff';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.ellipse(rp.x, rp.y + bob, 22, 25, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (dead && !viewerDead) return;

    ctx.save();
    ctx.globalAlpha = dead ? 0.5 : 1;
    ctx.font = '700 12px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(3,7,13,0.9)';
    ctx.fillStyle = mate ? '#ff7b88' : '#eef4ff';
    const label = p.name + (isSelf ? ' (you)' : '');
    ctx.strokeText(label, rp.x, rp.y - 27 + bob);
    ctx.fillText(label, rp.x, rp.y - 27 + bob);
    ctx.restore();
  }

  function drawMinimap() {
    const w = mini.width;
    const h = mini.height;
    const s = Math.min(w / map.world.w, h / map.world.h);
    const ox = (w - map.world.w * s) / 2;
    const oy = (h - map.world.h * s) / 2;
    mctx.clearRect(0, 0, w, h);
    mctx.fillStyle = 'rgba(5,10,19,0.75)';
    mctx.fillRect(0, 0, w, h);
    for (const r of map.rooms) {
      mctx.fillStyle = '#22304a';
      mctx.beginPath();
      mctx.roundRect(ox + r.x * s, oy + r.y * s, r.w * s, r.h * s, 2);
      mctx.fill();
    }
    // emergency button
    mctx.fillStyle = 'rgba(255,90,100,0.9)';
    mctx.beginPath();
    mctx.arc(ox + map.button.x * s, oy + map.button.y * s, 2.2, 0, Math.PI * 2);
    mctx.fill();

    const viewerDead = !!state.you.dead;
    for (const p of state.players) {
      if (p.dead && !viewerDead) continue;
      mctx.fillStyle = p.color;
      mctx.globalAlpha = p.dead ? 0.5 : 1;
      mctx.beginPath();
      mctx.arc(ox + p.x * s, oy + p.y * s, 2.6, 0, Math.PI * 2);
      mctx.fill();
      mctx.globalAlpha = 1;
      if (p.id === myId) {
        mctx.strokeStyle = '#ffffff';
        mctx.lineWidth = 1.2;
        mctx.beginPath();
        mctx.arc(ox + p.x * s, oy + p.y * s, 4.2, 0, Math.PI * 2);
        mctx.stroke();
      }
    }
  }

  function drawWorld(time) {
    // parallax star field
    ctx.save();
    for (const s of stars) {
      const tw = 0.5 + Math.sin(time / 900 + s.p) * 0.5;
      ctx.globalAlpha = s.a * (0.55 + tw * 0.45);
      ctx.fillStyle = '#cfe6ff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    for (const h of map.halls) floorRect(h, '#131d2f', '#1f2c45');
    for (const r of map.rooms) floorRect(r, '#1a2539', '#31456a');

    // room labels
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 15px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(150,180,225,0.32)';
    for (const r of map.rooms) {
      ctx.fillText(r.name.toUpperCase(), r.x + r.w / 2, r.y + 26);
    }
    ctx.restore();

    // emergency button
    const btn = map.button;
    ctx.save();
    ctx.translate(btn.x, btn.y);
    ctx.fillStyle = 'rgba(120,20,30,0.9)';
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff4d5e';
    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,140,150,0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // tasks
    const ownTasks = new Map((state.you.tasks || []).map((t) => [t.id, t.done]));
    for (const t of map.tasks) {
      const mine = ownTasks.has(t.id);
      if (mine && ownTasks.get(t.id)) continue;
      drawTaskMarker(t, mine, time);
    }

    for (const b of state.bodies) drawBody(b);

    const viewerDead = !!state.you.dead;
    const viewerImp = !!state.you.impostor;
    const sorted = [...state.players].sort(
      (a, b) => (renderPos.get(a.id)?.y ?? 0) - (renderPos.get(b.id)?.y ?? 0),
    );
    for (const p of sorted) {
      if (p.dead && !viewerDead) continue;
      const rp = renderPos.get(p.id) || { x: p.x, y: p.y };
      drawPlayer(p, rp, p.id === myId, viewerDead, viewerImp && p.impostor && p.id !== myId);
    }

    // kill target highlight
    if (viewerImp && state.you.killTarget && !state.you.dead) {
      const t = renderPos.get(state.you.killTarget);
      if (t) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,70,90,0.85)';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.ellipse(t.x, t.y, 24, 27, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function draw() {
    requestAnimationFrame(draw);
    const time = performance.now();
    const dt = Math.min(0.05, (time - lastFrame) / 1000);
    lastFrame = time;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);

    const bg = ctx.createRadialGradient(
      innerWidth * 0.5,
      innerHeight * 0.35,
      60,
      innerWidth * 0.5,
      innerHeight * 0.5,
      Math.max(innerWidth, innerHeight) * 0.85,
    );
    bg.addColorStop(0, '#0b1424');
    bg.addColorStop(1, '#04060b');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, innerWidth, innerHeight);

    if (!state || !map || !state.you) return;

    for (const p of state.players) {
      let rp = renderPos.get(p.id);
      if (!rp) {
        rp = { x: p.x, y: p.y };
        renderPos.set(p.id, rp);
      }
      if (Math.hypot(p.x - rp.x, p.y - rp.y) > 340) {
        rp.x = p.x;
        rp.y = p.y;
      } else {
        const k = 1 - Math.pow(0.0005, dt);
        rp.x += (p.x - rp.x) * (p.id === myId ? Math.min(1, k * 3) : k);
        rp.y += (p.y - rp.y) * (p.id === myId ? Math.min(1, k * 3) : k);
      }
    }

    const me = mePlayer();
    const target = me ? renderPos.get(me.id) || me : { x: map.world.w / 2, y: map.world.h / 2 };
    cam.x += (target.x - cam.x) * Math.min(1, dt * 8);
    cam.y += (target.y - cam.y) * Math.min(1, dt * 8);

    const scale = clamp(
      Math.min(innerWidth / 1300, innerHeight / 820),
      0.72,
      1.2,
    );
    const halfW = innerWidth / (2 * scale);
    const halfH = innerHeight / (2 * scale);
    const cx = map.world.w <= halfW * 2 ? map.world.w / 2 : clamp(cam.x, halfW, map.world.w - halfW);
    const cy = map.world.h <= halfH * 2 ? map.world.h / 2 : clamp(cam.y, halfH, map.world.h - halfH);

    ctx.save();
    ctx.translate(innerWidth / 2, innerHeight / 2);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);
    drawWorld(time);
    ctx.restore();

    const vg = ctx.createRadialGradient(
      innerWidth / 2,
      innerHeight / 2,
      Math.min(innerWidth, innerHeight) * 0.34,
      innerWidth / 2,
      innerHeight / 2,
      Math.max(innerWidth, innerHeight) * 0.78,
    );
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, innerWidth, innerHeight);

    if (screen === 'game') drawMinimap();
  }

  /* ------------------------------ boot ------------------------------ */

  const storedName = localStorage.getItem('sus-name');
  if (storedName) $('nameInput').value = storedName;
  $('nameInput').addEventListener('change', () => {
    localStorage.setItem('sus-name', nameValue());
  });

  const roomParam = new URL(location.href).searchParams.get('room');
  if (roomParam) {
    $('codeInput').value = roomParam.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    $('joinBtn').classList.add('primary');
  }

  setScreen('menu');
  requestAnimationFrame(draw);
})();
