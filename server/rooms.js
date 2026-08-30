/**
 * Лобби и матчи «Коридора».
 * Всё состояние в памяти процесса; сервер это единственный источник правды
 * по правилам (клиент дублирует их только ради отзывчивости).
 */

import {
  createGame, applyMove, serialize, getMode, seatCount, MODES,
  retirePlayer, distanceToGoal,
} from '../shared/quoridor.js';
import { advanceMove } from '../shared/ai.js';

const CODE_ALPHABET = 'ACDEFGHJKLMNPQRSTUVWXYZ23456789';
const RECONNECT_GRACE_MS = 45_000;
const LOBBY_IDLE_MS = 90_000;
const ROOM_TTL_MS = 30 * 60_000;
const MAX_CHAT = 60;
const MAX_ROOMS = 400;
const TURN_TIMES = [0, 5, 10, 15, 30, 60, 120];

/* ------------------------------------------------------------------ */

function makeCode(taken) {
  for (let attempt = 0; attempt < 200; attempt++) {
    let s = '';
    for (let i = 0; i < 5; i++) {
      s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    if (!taken.has(s)) return s;
  }
  return 'R' + Date.now().toString(36).toUpperCase().slice(-5);
}

function sanitizeName(raw, fallback = 'Игрок') {
  const s = String(raw ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 18);
  return s || fallback;
}

function sanitizeText(raw, max = 240) {
  return String(raw ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

function sanitizeSkin(raw) {
  const s = String(raw ?? '').slice(0, 24);
  return /^[a-z0-9_-]{2,24}$/.test(s) ? s : null;
}

/** Косметика игрока: отдельно фишка и стена. */
function sanitizeLook(msg, prev = null) {
  return {
    pawn: sanitizeSkin(msg.pawn) || prev?.pawn || null,
    wall: sanitizeSkin(msg.wall) || prev?.wall || null,
  };
}

function now() { return Date.now(); }

function clampInt(v, min, max, dflt) {
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}

function intIn(v, min, max) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

function normalizeMove(mv) {
  if (!mv || typeof mv !== 'object') return null;
  if (mv.type === 'move') {
    const r = intIn(mv.r, 0, 8), c = intIn(mv.c, 0, 8);
    if (r === null || c === null) return null;
    return { type: 'move', r, c };
  }
  if (mv.type === 'wall') {
    const r = intIn(mv.r, 0, 7), c = intIn(mv.c, 0, 7), o = intIn(mv.o, 1, 2);
    if (r === null || c === null || o === null) return null;
    return { type: 'wall', r, c, o };
  }
  return null;
}

function reasonText(reason) {
  switch (reason) {
    case 'goal': return 'фишка дошла до цели';
    case 'resign': return 'соперник сдался';
    case 'timeout': return 'просрочка времени';
    case 'disconnect': return 'соперник отключился';
    case 'alone': return 'остальные вышли';
    default: return String(reason || '');
  }
}

/* ------------------------------------------------------------------ */

export class Hub {
  constructor() {
    /** @type {Map<string, any>} clientId -> client */
    this.clients = new Map();
    /** @type {Map<string, any>} code -> room */
    this.rooms = new Map();
    this.sweepTimer = setInterval(() => this.sweep(), 15_000);
    this.sweepTimer.unref?.();
  }

  /* ---------------- клиенты ---------------- */

  attach(conn) {
    const client = {
      id: null,
      conn,
      name: 'Игрок',
      room: null,
      lastSeen: now(),
      alive: true,
    };
    conn.on('message', (text) => {
      let msg;
      try { msg = JSON.parse(text); } catch { return; }
      if (!msg || typeof msg.type !== 'string') return;
      client.lastSeen = now();
      try {
        this.handle(client, msg);
      } catch (e) {
        console.error('[hub] ошибка обработки', msg.type, e);
        this.send(client, { type: 'error', message: 'Внутренняя ошибка сервера' });
      }
    });
    conn.on('close', () => this.detach(client));
  }

  detach(client) {
    client.alive = false;
    if (client.replacedBy) return;
    if (client.id && this.clients.get(client.id) === client) {
      this.clients.delete(client.id);
    }
    const room = client.room;
    if (!room) return;
    const m = room.members.get(client.id);
    if (!m) return;

    m.connected = false;
    m.disconnectAt = now();

    if (room.status === 'playing' && m.seat !== null) {
      this.broadcast(room, {
        type: 'room:notice',
        kind: 'disconnect',
        name: m.name,
        graceMs: RECONNECT_GRACE_MS,
      });
      this.pushRoom(room);
    } else {
      this.removeMember(room, client.id, 'disconnect');
    }
    this.broadcastLobby();
  }

  send(client, msg) {
    if (client?.conn?.open) client.conn.send(msg);
  }

  sendTo(clientId, msg) {
    const c = this.clients.get(clientId);
    if (c) this.send(c, msg);
  }

  /* ---------------- маршрутизация ---------------- */

  handle(client, msg) {
    switch (msg.type) {
      case 'hello': return this.onHello(client, msg);
      case 'ping': return this.send(client, { type: 'pong', t: msg.t });
      case 'profile': return this.onProfile(client, msg);
      case 'lobby:subscribe': return this.onLobbySubscribe(client, msg);
      case 'room:create': return this.onCreate(client, msg);
      case 'room:join': return this.onJoin(client, msg);
      case 'room:leave': return this.onLeave(client);
      case 'room:start': return this.onStart(client);
      case 'room:kick': return this.onKick(client, msg);
      case 'room:settings': return this.onSettings(client, msg);
      case 'room:resync': return this.onResync(client);
      case 'game:move': return this.onMove(client, msg);
      case 'game:resign': return this.onResign(client);
      case 'game:rematch': return this.onRematch(client);
      case 'chat:send': return this.onChat(client, msg);
      default: return;
    }
  }

  onHello(client, msg) {
    const wanted = typeof msg.clientId === 'string' && /^[A-Za-z0-9_-]{6,40}$/.test(msg.clientId)
      ? msg.clientId : null;

    if (wanted && this.clients.has(wanted)) {
      const old = this.clients.get(wanted);
      if (old !== client) {
        old.replacedBy = client;
        if (old.conn?.open) old.conn.close(4001, 'replaced');
      }
      this.clients.delete(wanted);
    }

    client.id = wanted || ('c' + Math.random().toString(36).slice(2, 12));
    client.name = sanitizeName(msg.name);
    client.look = sanitizeLook(msg);
    this.clients.set(client.id, client);

    let restored = null;
    for (const room of this.rooms.values()) {
      const m = room.members.get(client.id);
      if (!m) continue;
      m.connected = true;
      m.disconnectAt = null;
      m.name = client.name;
      m.look = client.look;
      client.room = room;
      restored = room;
      break;
    }

    this.send(client, {
      type: 'hello:ok',
      clientId: client.id,
      name: client.name,
      serverTime: now(),
      modes: Object.fromEntries(Object.entries(MODES).map(([k, m]) => [k, {
        id: m.id, label: m.label, short: m.short, hint: m.hint,
        seats: m.seats, teams: m.teams, teamNames: m.teamNames,
      }])),
    });
    if (restored) {
      this.pushRoom(restored, client);
      this.send(client, {
        type: 'game:clock',
        turnDeadline: restored.turnDeadline,
        turn: restored.game ? restored.game.turn : 0,
      });
      this.broadcast(restored, { type: 'room:notice', kind: 'reconnect', name: client.name });
    } else {
      this.sendLobby(client);
    }
  }

  onProfile(client, msg) {
    client.name = sanitizeName(msg.name, client.name);
    if (msg.pawn !== undefined || msg.wall !== undefined) client.look = sanitizeLook(msg, client.look);
    const room = client.room;
    if (room) {
      const m = room.members.get(client.id);
      if (m) { m.name = client.name; m.look = client.look; this.pushRoom(room); }
      this.broadcastLobby();
    }
    this.send(client, { type: 'profile:ok', name: client.name });
  }

  onLobbySubscribe(client, msg) {
    client.watchingLobby = msg.on !== false;
    if (client.watchingLobby) this.sendLobby(client);
  }

  onResync(client) {
    const room = client.room;
    if (room) this.pushRoom(room, client);
    else this.sendLobby(client);
  }

  /* ---------------- лобби ---------------- */

  publicRooms() {
    const list = [];
    for (const room of this.rooms.values()) {
      if (room.hidden) continue;
      const seated = room.seats.filter(Boolean).length;
      list.push({
        code: room.code,
        name: room.name,
        host: room.members.get(room.hostId)?.name || 'нет хоста',
        players: seated,
        capacity: room.seats.length,
        spectators: [...room.members.values()].filter((m) => m.seat === null).length,
        status: room.status,
        isPrivate: room.isPrivate,
        mode: room.settings.mode,
        wallsPerPlayer: room.settings.wallsPerPlayer,
        turnTimeSec: room.settings.turnTimeSec,
        createdAt: room.createdAt,
      });
    }
    list.sort((a, b) => {
      const rank = (r) => (r.status === 'lobby' && r.players < r.capacity ? 0
        : r.status === 'lobby' ? 1 : 2);
      return rank(a) - rank(b) || b.createdAt - a.createdAt;
    });
    return list;
  }

  lobbyPayload() {
    return {
      type: 'lobby:rooms',
      rooms: this.publicRooms(),
      online: this.clients.size,
    };
  }

  sendLobby(client) { this.send(client, this.lobbyPayload()); }

  broadcastLobby() {
    const payload = this.lobbyPayload();
    for (const c of this.clients.values()) {
      if (c.watchingLobby) this.send(c, payload);
    }
  }

  /* ---------------- комнаты ---------------- */

  normalizeSettings(raw = {}, prev = null) {
    const modeId = MODES[raw.mode] ? raw.mode : (prev?.mode || 'duel');
    const mode = getMode(modeId);
    const baseWalls = mode.walls[0];
    const wallsPerPlayer = raw.wallsPerPlayer === undefined
      ? (prev && prev.mode === modeId ? prev.wallsPerPlayer : baseWalls)
      : clampInt(raw.wallsPerPlayer, 3, 20, baseWalls);
    const turnTimeSec = TURN_TIMES.includes(raw.turnTimeSec)
      ? raw.turnTimeSec
      : (prev ? prev.turnTimeSec : 0);
    return { mode: modeId, wallsPerPlayer, turnTimeSec };
  }

  makeRoom(client, opts = {}) {
    const code = makeCode(this.rooms);
    const settings = this.normalizeSettings(opts);
    const room = {
      code,
      name: sanitizeName(opts.name, `Партия ${client.name}`).slice(0, 28),
      hostId: client.id,
      isPrivate: !!opts.isPrivate,
      password: opts.isPrivate ? sanitizeText(opts.password, 24) : '',
      hidden: !!opts.hidden,
      settings,
      seats: new Array(seatCount(settings.mode)).fill(null),
      members: new Map(),
      status: 'lobby',
      game: null,
      chat: [],
      rematch: new Set(),
      turnDeadline: 0,
      turnTimer: null,
      score: [],
      seq: 0,
      createdAt: now(),
      lastActivity: now(),
    };
    this.rooms.set(code, room);
    return room;
  }

  /** Свободное место или null. */
  freeSeat(room) {
    const i = room.seats.indexOf(null);
    return i === -1 ? null : i;
  }

  addMember(room, client, seat) {
    const m = {
      id: client.id,
      name: client.name,
      look: client.look || null,
      seat,
      connected: true,
      disconnectAt: null,
      joinedAt: now(),
    };
    room.members.set(client.id, m);
    if (seat !== null) room.seats[seat] = client.id;
    client.room = room;
    room.lastActivity = now();
    return m;
  }

  removeMember(room, clientId, why) {
    const m = room.members.get(clientId);
    if (!m) return;
    room.members.delete(clientId);
    if (m.seat !== null && room.seats[m.seat] === clientId) room.seats[m.seat] = null;
    room.rematch.delete(clientId);
    const c = this.clients.get(clientId);
    if (c && c.room === room) c.room = null;

    if (room.hostId === clientId) {
      const next = [...room.members.values()].find((x) => x.seat !== null)
        || [...room.members.values()][0];
      room.hostId = next ? next.id : null;
    }
    if (room.members.size === 0) {
      this.destroyRoom(room);
      return;
    }
    this.pushRoom(room);
    this.broadcast(room, { type: 'room:notice', kind: why || 'leave', name: m.name });
  }

  destroyRoom(room) {
    if (room.turnTimer) clearTimeout(room.turnTimer);
    this.rooms.delete(room.code);
    this.broadcastLobby();
  }

  onCreate(client, msg) {
    if (!client.id) return;
    if (this.rooms.size >= MAX_ROOMS) {
      return this.send(client, { type: 'error', message: 'Сервер переполнен, попробуйте позже' });
    }
    this.leaveCurrent(client);
    const room = this.makeRoom(client, msg);
    this.addMember(room, client, 0);
    this.sysChat(room, `${client.name} создал комнату`);
    this.pushRoom(room);
    this.broadcastLobby();
  }

  onJoin(client, msg) {
    const code = String(msg.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    const room = this.rooms.get(code);
    if (!room) return this.send(client, { type: 'room:error', message: 'Комната не найдена' });
    if (room.isPrivate && room.password && sanitizeText(msg.password, 24) !== room.password) {
      return this.send(client, { type: 'room:error', message: 'Неверный пароль' });
    }
    if (room.members.has(client.id)) {
      const m = room.members.get(client.id);
      m.connected = true;
      m.disconnectAt = null;
      client.room = room;
      return this.pushRoom(room);
    }
    this.leaveCurrent(client);
    const seat = room.status === 'lobby' ? this.freeSeat(room) : null;
    this.addMember(room, client, seat);
    this.sysChat(room, seat === null
      ? `${client.name} наблюдает за партией`
      : `${client.name} присоединился`);
    this.pushRoom(room);
    this.broadcastLobby();
  }

  leaveCurrent(client) {
    const room = client.room;
    if (!room) return;
    if (room.status === 'playing' && room.game) {
      const m = room.members.get(client.id);
      if (m && m.seat !== null) this.retire(room, m.seat, 'resign');
    }
    this.removeMember(room, client.id, 'leave');
    client.room = null;
  }

  onLeave(client) {
    this.leaveCurrent(client);
    this.sendLobby(client);
    this.broadcastLobby();
  }

  onSettings(client, msg) {
    const room = client.room;
    if (!room || room.hostId !== client.id || room.status === 'playing') return;
    const prev = room.settings;
    room.settings = this.normalizeSettings(msg, prev);
    if (msg.name !== undefined) room.name = sanitizeName(msg.name, room.name).slice(0, 28);
    if (msg.isPrivate !== undefined) {
      room.isPrivate = !!msg.isPrivate;
      room.password = room.isPrivate ? sanitizeText(msg.password ?? room.password, 24) : '';
    }

    // смена режима меняет число мест: пересобираем рассадку
    const need = seatCount(room.settings.mode);
    if (need !== room.seats.length) {
      const sitting = room.seats.filter(Boolean);
      room.seats = new Array(need).fill(null);
      for (const m of room.members.values()) m.seat = null;
      for (const id of sitting) {
        const free = this.freeSeat(room);
        if (free === null) break;
        room.seats[free] = id;
        const m = room.members.get(id);
        if (m) m.seat = free;
      }
      // добавляем наблюдателей на освободившиеся места
      for (const m of room.members.values()) {
        if (m.seat !== null) continue;
        const free = this.freeSeat(room);
        if (free === null) break;
        room.seats[free] = m.id;
        m.seat = free;
      }
    }
    if (room.status === 'finished') { room.status = 'lobby'; room.game = null; }
    this.pushRoom(room);
    this.broadcastLobby();
  }

  onKick(client, msg) {
    const room = client.room;
    if (!room || room.hostId !== client.id) return;
    const target = String(msg.playerId || '');
    if (target === client.id) return;
    if (!room.members.has(target)) return;
    this.sendTo(target, { type: 'room:kicked' });
    this.removeMember(room, target, 'kick');
    const c = this.clients.get(target);
    if (c) { c.room = null; this.sendLobby(c); }
    this.broadcastLobby();
  }

  onStart(client) {
    const room = client.room;
    if (!room || room.hostId !== client.id) return;
    if (room.status === 'playing') return;
    if (room.seats.some((s) => !s)) {
      return this.send(client, { type: 'room:error', message: 'Не все места заняты' });
    }
    this.startGame(room);
  }

  startGame(room) {
    room.status = 'playing';
    room.game = createGame({
      mode: room.settings.mode,
      wallsPerPlayer: room.settings.wallsPerPlayer,
    });
    room.rematch.clear();
    if (room.score.length !== room.seats.length) room.score = new Array(room.seats.length).fill(0);
    this.sysChat(room, 'Партия началась');
    this.armTurnTimer(room);
    this.pushRoom(room, null, { started: true });
    this.broadcast(room, { type: 'game:clock', turnDeadline: room.turnDeadline, turn: room.game.turn });
    this.broadcastLobby();
  }

  /* ---------------- игра ---------------- */

  armTurnTimer(room) {
    if (room.turnTimer) { clearTimeout(room.turnTimer); room.turnTimer = null; }
    const secs = room.settings.turnTimeSec;
    if (!secs || room.status !== 'playing') { room.turnDeadline = 0; return; }
    room.turnDeadline = now() + secs * 1000;
    room.turnTimer = setTimeout(() => this.onTurnTimeout(room), secs * 1000 + 250);
    room.turnTimer.unref?.();
  }

  onTurnTimeout(room) {
    if (room.status !== 'playing' || !room.game) return;
    const p = room.game.turn;
    const mv = advanceMove(room.game, p);
    if (!mv) return this.retire(room, p, 'timeout');
    const res = applyMove(room.game, p, mv);
    if (!res.ok) return this.retire(room, p, 'timeout');
    this.afterMove(room, p, mv, res, true);
  }

  onMove(client, msg) {
    const room = client.room;
    if (!room || room.status !== 'playing' || !room.game) return;
    const m = room.members.get(client.id);
    if (!m || m.seat === null) return;
    if (room.game.turn !== m.seat) {
      return this.send(client, {
        type: 'game:reject', message: 'Сейчас не ваш ход',
        state: serialize(room.game), seq: room.seq,
      });
    }
    const mv = normalizeMove(msg.move);
    if (!mv) return this.send(client, { type: 'game:reject', message: 'Некорректный ход' });

    const res = applyMove(room.game, m.seat, mv);
    if (!res.ok) {
      return this.send(client, {
        type: 'game:reject',
        message: res.message,
        code: res.code,
        state: serialize(room.game),
        seq: room.seq,
      });
    }
    this.afterMove(room, m.seat, mv, res, false);
  }

  afterMove(room, seat, mv, res, auto) {
    room.lastActivity = now();
    const g = room.game;
    room.seq++;
    this.broadcast(room, {
      type: 'game:move',
      by: seat,
      move: mv,
      notation: res.notation,
      auto: !!auto,
      state: serialize(g),
      seq: room.seq,
    });
    if (g.winner !== null) return this.finish(room, g.winner, g.reason || 'goal');
    this.armTurnTimer(room);
    this.broadcast(room, { type: 'game:clock', turnDeadline: room.turnDeadline, turn: g.turn });
  }

  onResign(client) {
    const room = client.room;
    if (!room || room.status !== 'playing') return;
    const m = room.members.get(client.id);
    if (!m || m.seat === null) return;
    this.retire(room, m.seat, 'resign');
  }

  /** Вывести игрока из партии и, если победитель определился, закрыть её. */
  retire(room, seatIdx, reason) {
    if (!room.game || room.status !== 'playing') return;
    retirePlayer(room.game, seatIdx, reason);
    room.seq++;
    this.broadcast(room, {
      type: 'game:move',
      by: seatIdx,
      move: null,
      retired: true,
      reason,
      state: serialize(room.game),
      seq: room.seq,
    });
    if (room.game.winner !== null) {
      this.finish(room, room.game.winner, room.game.reason || reason);
      return;
    }
    this.armTurnTimer(room);
    this.broadcast(room, {
      type: 'game:clock', turnDeadline: room.turnDeadline, turn: room.game.turn,
    });
  }

  finish(room, winnerTeam, reason) {
    if (room.status === 'finished') return;
    if (room.turnTimer) { clearTimeout(room.turnTimer); room.turnTimer = null; }
    room.status = 'finished';
    room.turnDeadline = 0;
    const g = room.game;
    if (g) { g.winner = winnerTeam; g.reason = reason; }

    const mode = getMode(room.settings.mode);
    const winners = [];
    if (g && winnerTeam !== null) {
      g.players.forEach((p, i) => {
        if (p.team !== winnerTeam) return;
        winners.push(i);
        if (room.score[i] !== undefined) room.score[i]++;
      });
    }
    const winnerNames = winners
      .map((i) => room.members.get(room.seats[i])?.name)
      .filter(Boolean);

    room.seq++;
    this.broadcast(room, {
      type: 'game:over',
      winnerTeam,
      winners,
      winnerNames,
      teamName: winnerTeam !== null ? (mode.teamNames[winnerTeam] || '') : '',
      reason,
      score: room.score,
      state: g ? serialize(g) : null,
      seq: room.seq,
    });
    this.sysChat(room, winnerNames.length
      ? `Победа: ${winnerNames.join(' и ')} (${reasonText(reason)})`
      : `Партия окончена (${reasonText(reason)})`);
    this.pushRoom(room);
    this.broadcastLobby();
  }

  onRematch(client) {
    const room = client.room;
    if (!room || room.status !== 'finished') return;
    const m = room.members.get(client.id);
    if (!m || m.seat === null) return;
    room.rematch.add(client.id);
    this.broadcast(room, { type: 'room:rematch', players: [...room.rematch] });
    const all = room.seats.every((id) => id && room.rematch.has(id));
    if (!all) return;

    // сдвигаем всех на одно место, чтобы стороны менялись
    const ids = room.seats.slice();
    const shifted = ids.slice(1).concat(ids.slice(0, 1));
    room.seats = shifted;
    shifted.forEach((id, i) => {
      const mm = room.members.get(id);
      if (mm) mm.seat = i;
    });
    room.score = room.score.slice(1).concat(room.score.slice(0, 1));
    room.status = 'lobby';
    this.startGame(room);
  }

  /* ---------------- чат ---------------- */

  sysChat(room, text) {
    const entry = { id: 'm' + Math.random().toString(36).slice(2, 9), sys: true, text, at: now() };
    room.chat.push(entry);
    if (room.chat.length > MAX_CHAT) room.chat.shift();
    this.broadcast(room, { type: 'chat:msg', message: entry });
  }

  onChat(client, msg) {
    const room = client.room;
    if (!room) return;
    const text = sanitizeText(msg.text, 240);
    if (!text) return;
    const m = room.members.get(client.id);
    const entry = {
      id: 'm' + Math.random().toString(36).slice(2, 9),
      from: m?.name || client.name,
      seat: m?.seat ?? null,
      text,
      at: now(),
    };
    room.chat.push(entry);
    if (room.chat.length > MAX_CHAT) room.chat.shift();
    room.lastActivity = now();
    this.broadcast(room, { type: 'chat:msg', message: entry });
  }

  /* ---------------- рассылка ---------------- */

  roomPayload(room, extra = {}) {
    return {
      type: 'room:state',
      seq: room.seq,
      room: {
        code: room.code,
        name: room.name,
        hostId: room.hostId,
        isPrivate: room.isPrivate,
        hidden: room.hidden,
        settings: room.settings,
        status: room.status,
        seats: room.seats,
        capacity: room.seats.length,
        score: room.score,
        members: [...room.members.values()].map((m) => ({
          id: m.id, name: m.name, look: m.look, seat: m.seat,
          connected: m.connected, disconnectAt: m.disconnectAt,
        })),
        rematch: [...room.rematch],
        chat: room.chat,
        turnDeadline: room.turnDeadline,
      },
      state: room.game ? serialize(room.game) : null,
      ...extra,
    };
  }

  pushRoom(room, only = null, extra = {}) {
    const payload = this.roomPayload(room, extra);
    if (only) return this.send(only, payload);
    for (const id of room.members.keys()) {
      const c = this.clients.get(id);
      if (c) this.send(c, payload);
    }
  }

  broadcast(room, msg) {
    for (const id of room.members.keys()) {
      const c = this.clients.get(id);
      if (c) this.send(c, msg);
    }
  }

  /* ---------------- уборка ---------------- */

  sweep() {
    const t = now();
    for (const room of [...this.rooms.values()]) {
      for (const m of [...room.members.values()]) {
        if (m.connected || !m.disconnectAt) continue;
        const gone = t - m.disconnectAt;
        if (room.status === 'playing' && m.seat !== null) {
          if (gone > RECONNECT_GRACE_MS) {
            this.retire(room, m.seat, 'disconnect');
            this.removeMember(room, m.id, 'disconnect');
          }
        } else if (gone > LOBBY_IDLE_MS) {
          this.removeMember(room, m.id, 'disconnect');
        }
      }
      if (!this.rooms.has(room.code)) continue;
      const anyConnected = [...room.members.values()].some((m) => m.connected);
      if (!anyConnected && t - room.lastActivity > LOBBY_IDLE_MS) this.destroyRoom(room);
      else if (t - room.lastActivity > ROOM_TTL_MS && room.status !== 'playing') this.destroyRoom(room);
    }
  }

  stats() {
    let playing = 0;
    for (const r of this.rooms.values()) if (r.status === 'playing') playing++;
    return {
      online: this.clients.size,
      rooms: this.rooms.size,
      playing,
    };
  }
}

export { distanceToGoal };
