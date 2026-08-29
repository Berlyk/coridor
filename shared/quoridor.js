/**
 * Quoridor / «Коридор» — правило-ядро на любое число игроков.
 * Работает и в браузере (ESM), и в Node (ESM).
 *
 * Доска 9x9. Стены живут в решётке 8x8 «перекрёстков».
 *  - Горизонтальная стена (r,c) перекрывает переходы (r,c)<->(r+1,c) и (r,c+1)<->(r+1,c+1)
 *  - Вертикальная    стена (r,c) перекрывает переходы (r,c)<->(r,c+1) и (r+1,c)<->(r+1,c+1)
 *
 * Места на доске всегда нумеруются одинаково:
 *   0 — снизу (идёт вверх)      2 — слева (идёт вправо)
 *   1 — сверху (идёт вниз)      3 — справа (идёт влево)
 */

export const N = 9;          // размер доски
export const W = N - 1;      // размер решётки стен (8)

export const H = 1;          // горизонтальная
export const V = 2;          // вертикальная

const DIRS = [
  [-1, 0], // вверх
  [1, 0],  // вниз
  [0, -1], // влево
  [0, 1],  // вправо
];

/* ------------------------------------------------------------------ *
 * Места и режимы
 * ------------------------------------------------------------------ */

/** Стартовая клетка и цель для каждого из четырёх мест. */
export const SEATS = [
  { id: 0, side: 'bottom', r: N - 1, c: (N - 1) / 2, goal: { axis: 'row', value: 0 }, label: 'снизу' },
  { id: 1, side: 'top', r: 0, c: (N - 1) / 2, goal: { axis: 'row', value: N - 1 }, label: 'сверху' },
  { id: 2, side: 'left', r: (N - 1) / 2, c: 0, goal: { axis: 'col', value: N - 1 }, label: 'слева' },
  { id: 3, side: 'right', r: (N - 1) / 2, c: N - 1, goal: { axis: 'col', value: 0 }, label: 'справа' },
];

/**
 * Режимы игры.
 *   seats        какие места заняты
 *   teams        номер команды для каждого места (в том же порядке, что seats)
 *   order        порядок хода по местам
 *   walls        сколько стен у каждого места
 *   movesPerTurn сколько действий подряд делает место за один ход
 */
export const MODES = {
  duel: {
    id: 'duel',
    label: '1 на 1',
    short: '1x1',
    hint: 'Классика. Двое идут навстречу друг другу.',
    seats: [0, 1],
    teams: [0, 1],
    order: [0, 1],
    walls: [10, 10],
    movesPerTurn: [1, 1],
    teamNames: ['Красные', 'Белые'],
  },
  trio: {
    id: 'trio',
    label: 'Трое',
    short: '1x1x1',
    hint: 'Трое на доске, каждый сам за себя.',
    seats: [0, 1, 2],
    teams: [0, 1, 2],
    order: [0, 2, 1],
    walls: [7, 7, 7],
    movesPerTurn: [1, 1, 1],
    teamNames: ['Красные', 'Белые', 'Синие'],
  },
  ffa: {
    id: 'ffa',
    label: 'Каждый сам за себя',
    short: '4 игрока',
    hint: 'Четверо на доске, побеждает первый дошедший.',
    seats: [0, 1, 2, 3],
    teams: [0, 1, 2, 3],
    order: [0, 2, 1, 3],
    walls: [5, 5, 5, 5],
    movesPerTurn: [1, 1, 1, 1],
    teamNames: ['Красные', 'Белые', 'Синие', 'Жёлтые'],
  },
  duo: {
    id: 'duo',
    label: '2 на 2',
    short: '2x2',
    hint: 'Пары стоят напротив. Побеждает команда, чей игрок дошёл первым.',
    seats: [0, 1, 2, 3],
    teams: [0, 0, 1, 1],
    order: [0, 2, 1, 3],
    walls: [6, 6, 6, 6],
    movesPerTurn: [1, 1, 1, 1],
    teamNames: ['Вертикаль', 'Горизонталь'],
  },
  siege: {
    id: 'siege',
    label: '2 на 1',
    short: '2x1',
    hint: 'Одиночка снизу ходит дважды за ход и получает вдвое больше стен.',
    seats: [0, 2, 3],
    teams: [0, 1, 1],
    order: [0, 2, 3],
    walls: [14, 7, 7],
    movesPerTurn: [2, 1, 1],
    teamNames: ['Одиночка', 'Пара'],
  },
};

export const MODE_LIST = Object.values(MODES);
export const DEFAULT_MODE = 'duel';

export function getMode(id) { return MODES[id] || MODES[DEFAULT_MODE]; }

/** Сколько мест в режиме. */
export function seatCount(modeId) { return getMode(modeId).seats.length; }

/** Сколько команд в режиме. */
export function teamCount(modeId) { return new Set(getMode(modeId).teams).size; }

/** Командный ли режим (в команде больше одного игрока). */
export function isTeamMode(modeId) {
  const m = getMode(modeId);
  return teamCount(modeId) < m.seats.length;
}

/* ------------------------------------------------------------------ *
 * Создание / клонирование состояния
 * ------------------------------------------------------------------ */

export function createGame(opts = {}) {
  const mode = getMode(opts.mode);
  const scale = opts.wallsPerPlayer ? opts.wallsPerPlayer / mode.walls[0] : 1;

  const players = mode.seats.map((seatId, i) => {
    const seat = SEATS[seatId];
    return {
      seat: seatId,
      r: seat.r,
      c: seat.c,
      goal: { ...seat.goal },
      team: mode.teams[i],
      walls: Math.max(0, Math.round(mode.walls[i] * scale)),
      moves: mode.movesPerTurn[i],
      active: true,
    };
  });

  // order в описании режима задан номерами мест, внутри игры нужны индексы игроков
  const order = mode.order.map((seatId) => mode.seats.indexOf(seatId)).filter((i) => i >= 0);

  return {
    mode: mode.id,
    order,
    turnIndex: 0,
    turn: order[0],
    movesLeft: players[order[0]].moves,
    ply: 0,
    winner: null,        // индекс команды
    winnerSeat: null,    // индекс игрока, который дошёл
    reason: null,
    players,
    h: new Array(W * W).fill(0),
    v: new Array(W * W).fill(0),
    wallList: [],
    history: [],
  };
}

export function cloneGame(g) {
  return {
    mode: g.mode,
    order: g.order.slice(),
    turnIndex: g.turnIndex,
    turn: g.turn,
    movesLeft: g.movesLeft,
    ply: g.ply,
    winner: g.winner,
    winnerSeat: g.winnerSeat,
    reason: g.reason,
    players: g.players.map((p) => ({ ...p, goal: { ...p.goal } })),
    h: g.h.slice(),
    v: g.v.slice(),
    wallList: g.wallList.slice(),
    history: g.history.slice(),
  };
}

/* ------------------------------------------------------------------ *
 * Проходимость
 * ------------------------------------------------------------------ */

const inBoard = (r, c) => r >= 0 && r < N && c >= 0 && c < N;
const inGrid = (r, c) => r >= 0 && r < W && c >= 0 && c < W;

/** Можно ли шагнуть из (r,c) в направлении (dr,dc): только стены и границы. */
export function canStep(g, r, c, dr, dc) {
  const nr = r + dr, nc = c + dc;
  if (!inBoard(nr, nc)) return false;

  if (dr === -1) {
    const gr = r - 1;
    if (inGrid(gr, c) && g.h[gr * W + c]) return false;
    if (inGrid(gr, c - 1) && g.h[gr * W + c - 1]) return false;
    return true;
  }
  if (dr === 1) {
    const gr = r;
    if (inGrid(gr, c) && g.h[gr * W + c]) return false;
    if (inGrid(gr, c - 1) && g.h[gr * W + c - 1]) return false;
    return true;
  }
  if (dc === -1) {
    const gc = c - 1;
    if (inGrid(r, gc) && g.v[r * W + gc]) return false;
    if (inGrid(r - 1, gc) && g.v[(r - 1) * W + gc]) return false;
    return true;
  }
  const gc = c;
  if (inGrid(r, gc) && g.v[r * W + gc]) return false;
  if (inGrid(r - 1, gc) && g.v[(r - 1) * W + gc]) return false;
  return true;
}

/** Индекс игрока на клетке или -1. Выбывшие фишки поле не занимают. */
export function pawnAt(g, r, c) {
  for (let i = 0; i < g.players.length; i++) {
    const p = g.players[i];
    if (p.active && p.r === r && p.c === c) return i;
  }
  return -1;
}

/* ------------------------------------------------------------------ *
 * Ходы фишкой (включая прыжки)
 * ------------------------------------------------------------------ */

/**
 * Все легальные клетки, куда может пойти игрок `p`.
 * @returns {Array<{r:number,c:number,jump:boolean}>}
 */
export function pawnMoves(g, p) {
  const me = g.players[p];
  if (!me || !me.active) return [];
  const out = [];
  const seen = new Set();
  const push = (r, c, jump) => {
    const k = r * N + c;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ r, c, jump: !!jump });
  };

  for (const [dr, dc] of DIRS) {
    if (!canStep(g, me.r, me.c, dr, dc)) continue;
    const nr = me.r + dr, nc = me.c + dc;

    if (pawnAt(g, nr, nc) === -1) { push(nr, nc, false); continue; }

    // на соседней клетке фишка: пробуем перепрыгнуть
    const jr = nr + dr, jc = nc + dc;
    const straightOk = inBoard(jr, jc)
      && canStep(g, nr, nc, dr, dc)
      && pawnAt(g, jr, jc) === -1;
    if (straightOk) { push(jr, jc, true); continue; }

    // прямой прыжок закрыт: разрешены диагонали вокруг соседа
    const perp = dr === 0 ? [[-1, 0], [1, 0]] : [[0, -1], [0, 1]];
    for (const [pr, pc] of perp) {
      if (!canStep(g, nr, nc, pr, pc)) continue;
      const tr = nr + pr, tc = nc + pc;
      if (tr === me.r && tc === me.c) continue;
      if (pawnAt(g, tr, tc) !== -1) continue;
      push(tr, tc, true);
    }
  }
  return out;
}

export function isPawnMoveLegal(g, p, r, c) {
  return pawnMoves(g, p).some((m) => m.r === r && m.c === c);
}

/** Дошёл ли игрок до своей цели. */
export function atGoal(player, r = player.r, c = player.c) {
  return player.goal.axis === 'row' ? r === player.goal.value : c === player.goal.value;
}

/* ------------------------------------------------------------------ *
 * Поиск пути (BFS)
 * ------------------------------------------------------------------ */

const _dist = new Int16Array(N * N);
const _queue = new Int16Array(N * N);

/** Кратчайшее расстояние игрока p до его цели. Infinity: пути нет. */
export function distanceToGoal(g, p) {
  const me = g.players[p];
  if (!me) return Infinity;
  const byRow = me.goal.axis === 'row';
  const goal = me.goal.value;
  _dist.fill(-1);
  let head = 0, tail = 0;
  const start = me.r * N + me.c;
  _dist[start] = 0;
  _queue[tail++] = start;

  while (head < tail) {
    const cur = _queue[head++];
    const r = (cur / N) | 0, c = cur % N;
    if ((byRow ? r : c) === goal) return _dist[cur];
    for (let i = 0; i < 4; i++) {
      const dr = DIRS[i][0], dc = DIRS[i][1];
      const nr = r + dr, nc = c + dc;
      if (!inBoard(nr, nc)) continue;
      const nk = nr * N + nc;
      if (_dist[nk] !== -1) continue;
      if (!canStep(g, r, c, dr, dc)) continue;
      _dist[nk] = _dist[cur] + 1;
      _queue[tail++] = nk;
    }
  }
  return Infinity;
}

/** Кратчайший маршрут игрока p до цели: массив {r,c} включая старт. */
export function shortestPath(g, p) {
  const me = g.players[p];
  if (!me) return null;
  const byRow = me.goal.axis === 'row';
  const goal = me.goal.value;
  const prev = new Int16Array(N * N).fill(-1);
  const seen = new Uint8Array(N * N);
  const q = [me.r * N + me.c];
  seen[q[0]] = 1;
  let end = -1;
  for (let i = 0; i < q.length; i++) {
    const cur = q[i];
    const r = (cur / N) | 0, c = cur % N;
    if ((byRow ? r : c) === goal) { end = cur; break; }
    for (let d = 0; d < 4; d++) {
      const dr = DIRS[d][0], dc = DIRS[d][1];
      const nr = r + dr, nc = c + dc;
      if (!inBoard(nr, nc)) continue;
      const nk = nr * N + nc;
      if (seen[nk]) continue;
      if (!canStep(g, r, c, dr, dc)) continue;
      seen[nk] = 1;
      prev[nk] = cur;
      q.push(nk);
    }
  }
  if (end === -1) return null;
  const path = [];
  let cur = end;
  while (cur !== -1) {
    path.push({ r: (cur / N) | 0, c: cur % N });
    cur = prev[cur];
  }
  return path.reverse();
}

/* ------------------------------------------------------------------ *
 * Стены
 * ------------------------------------------------------------------ */

/**
 * Проверка постановки стены.
 * @returns {{ok:true} | {ok:false, code:string, message:string}}
 */
export function checkWall(g, p, r, c, o) {
  if (!inGrid(r, c)) return err('bounds', 'Стена вне доски');
  if (o !== H && o !== V) return err('orientation', 'Неизвестная ориентация');
  if (!g.players[p] || g.players[p].walls <= 0) return err('empty', 'Стены закончились');

  const i = r * W + c;
  if (g.h[i] || g.v[i]) return err('occupied', 'Здесь уже стоит стена');

  if (o === H) {
    if (c > 0 && g.h[i - 1]) return err('overlap', 'Перекрывает соседнюю стену');
    if (c < W - 1 && g.h[i + 1]) return err('overlap', 'Перекрывает соседнюю стену');
  } else {
    if (r > 0 && g.v[i - W]) return err('overlap', 'Перекрывает соседнюю стену');
    if (r < W - 1 && g.v[i + W]) return err('overlap', 'Перекрывает соседнюю стену');
  }

  // главное правило: ни один игрок не должен остаться без пути
  const arr = o === H ? g.h : g.v;
  arr[i] = 1;
  let blocked = false;
  for (let k = 0; k < g.players.length; k++) {
    if (!g.players[k].active) continue;
    if (distanceToGoal(g, k) === Infinity) { blocked = true; break; }
  }
  arr[i] = 0;
  if (blocked) return err('blocked', 'Нельзя полностью перекрыть путь');

  return { ok: true };
}

function err(code, message) { return { ok: false, code, message }; }

/** Быстрая проверка без сообщений (для ИИ). */
export function wallOk(g, p, r, c, o) {
  return checkWall(g, p, r, c, o).ok;
}

/** Все валидные постановки стен для игрока p. */
export function allWalls(g, p) {
  const out = [];
  if (!g.players[p] || g.players[p].walls <= 0) return out;
  for (let r = 0; r < W; r++) {
    for (let c = 0; c < W; c++) {
      if (wallOk(g, p, r, c, H)) out.push({ type: 'wall', r, c, o: H });
      if (wallOk(g, p, r, c, V)) out.push({ type: 'wall', r, c, o: V });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Очередь хода
 * ------------------------------------------------------------------ */

function aliveTeams(g) {
  const set = new Set();
  for (const p of g.players) if (p.active) set.add(p.team);
  return set;
}

/** Передать ход следующему активному игроку. */
export function advanceTurn(g) {
  if (g.winner !== null) return;
  const teams = aliveTeams(g);
  if (teams.size <= 1) {
    g.winner = teams.size === 1 ? [...teams][0] : null;
    g.reason = 'alone';
    return;
  }
  for (let step = 1; step <= g.order.length; step++) {
    const idx = (g.turnIndex + step) % g.order.length;
    const seat = g.order[idx];
    if (!g.players[seat] || !g.players[seat].active) continue;
    g.turnIndex = idx;
    g.turn = seat;
    g.movesLeft = g.players[seat].moves;
    return;
  }
}

/** Вывести игрока из партии (выход, сдача, обрыв). */
export function retirePlayer(g, p, reason = 'resign') {
  const player = g.players[p];
  if (!player || !player.active) return;
  player.active = false;
  const teams = aliveTeams(g);
  if (teams.size <= 1) {
    g.winner = teams.size === 1 ? [...teams][0] : null;
    g.reason = reason;
    return;
  }
  if (g.turn === p) advanceTurn(g);
}

/* ------------------------------------------------------------------ *
 * Применение хода
 * ------------------------------------------------------------------ */

/**
 * @param {object} g   состояние (мутируется)
 * @param {number} p   индекс игрока
 * @param {object} mv  {type:'move',r,c} | {type:'wall',r,c,o}
 * @returns {{ok:true, notation:string} | {ok:false, code, message}}
 */
export function applyMove(g, p, mv) {
  if (g.winner !== null) return err('finished', 'Партия уже завершена');
  if (g.turn !== p) return err('turn', 'Сейчас не ваш ход');
  if (!g.players[p] || !g.players[p].active) return err('inactive', 'Вы выбыли из партии');

  if (mv.type === 'move') {
    if (!isPawnMoveLegal(g, p, mv.r, mv.c)) return err('illegal', 'Так ходить нельзя');
    const me = g.players[p];
    const from = { r: me.r, c: me.c };
    me.r = mv.r; me.c = mv.c;
    const notation = cellName(mv.r, mv.c);
    g.history.push({ type: 'move', by: p, from, r: mv.r, c: mv.c, notation, ply: g.ply });
    g.ply++;
    if (atGoal(me)) {
      g.winner = me.team;
      g.winnerSeat = p;
      g.reason = 'goal';
    } else {
      g.movesLeft--;
      if (g.movesLeft <= 0) advanceTurn(g);
    }
    return { ok: true, notation };
  }

  if (mv.type === 'wall') {
    const chk = checkWall(g, p, mv.r, mv.c, mv.o);
    if (!chk.ok) return chk;
    const i = mv.r * W + mv.c;
    (mv.o === H ? g.h : g.v)[i] = 1;
    g.players[p].walls--;
    g.wallList.push({ r: mv.r, c: mv.c, o: mv.o, by: p, ply: g.ply });
    const notation = wallName(mv.r, mv.c, mv.o);
    g.history.push({ type: 'wall', by: p, r: mv.r, c: mv.c, o: mv.o, notation, ply: g.ply });
    g.ply++;
    g.movesLeft--;
    if (g.movesLeft <= 0) advanceTurn(g);
    return { ok: true, notation };
  }

  return err('unknown', 'Неизвестный тип хода');
}

/* ------------------------------------------------------------------ *
 * Нотация
 * ------------------------------------------------------------------ */

const FILES = 'abcdefghi';

/** Клетка (r,c) в «e1». Ряд 8 (низ) это 1, ряд 0 (верх) это 9. */
export function cellName(r, c) {
  return FILES[c] + (N - r);
}

/** Стена решётки (r,c,o) в «e3h». */
export function wallName(r, c, o) {
  return FILES[c] + (N - 1 - r) + (o === H ? 'h' : 'v');
}

export function moveName(mv) {
  return mv.type === 'wall' ? wallName(mv.r, mv.c, mv.o) : cellName(mv.r, mv.c);
}

/* ------------------------------------------------------------------ *
 * Сериализация для сети
 * ------------------------------------------------------------------ */

export function serialize(g) {
  return {
    mode: g.mode,
    order: g.order.slice(),
    turnIndex: g.turnIndex,
    turn: g.turn,
    movesLeft: g.movesLeft,
    ply: g.ply,
    winner: g.winner,
    winnerSeat: g.winnerSeat,
    reason: g.reason,
    players: g.players.map((p) => ({
      seat: p.seat, r: p.r, c: p.c, goal: { ...p.goal },
      team: p.team, walls: p.walls, moves: p.moves, active: p.active,
    })),
    wallList: g.wallList.map((w) => ({ r: w.r, c: w.c, o: w.o, by: w.by, ply: w.ply })),
    history: g.history.map((x) => ({ ...x })),
  };
}

export function deserialize(data) {
  const g = createGame({ mode: data.mode });
  g.order = data.order ? data.order.slice() : g.order;
  g.turnIndex = data.turnIndex ?? 0;
  g.turn = data.turn ?? g.order[0];
  g.movesLeft = data.movesLeft ?? 1;
  g.ply = data.ply ?? 0;
  g.winner = data.winner ?? null;
  g.winnerSeat = data.winnerSeat ?? null;
  g.reason = data.reason ?? null;
  g.players = data.players.map((p) => ({ ...p, goal: { ...p.goal } }));
  g.wallList = data.wallList.map((w) => ({ ...w }));
  g.history = (data.history || []).map((x) => ({ ...x }));
  for (const w of g.wallList) {
    (w.o === H ? g.h : g.v)[w.r * W + w.c] = 1;
  }
  return g;
}

export const DIRECTIONS = DIRS;
