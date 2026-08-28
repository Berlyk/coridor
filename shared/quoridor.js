/**
 * Quoridor / «Коридор» — чистое правило-ядро.
 * Работает и в браузере (ESM), и в Node (ESM).
 *
 * Доска 9x9. Стены живут в решётке 8x8 «перекрёстков».
 *  - Горизонтальная стена (r,c) перекрывает переходы (r,c)<->(r+1,c) и (r,c+1)<->(r+1,c+1)
 *  - Вертикальная    стена (r,c) перекрывает переходы (r,c)<->(r,c+1) и (r+1,c)<->(r+1,c+1)
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
 * Создание / клонирование состояния
 * ------------------------------------------------------------------ */

export function createGame(opts = {}) {
  const wallsPerPlayer = opts.wallsPerPlayer ?? 10;
  return {
    turn: 0,
    ply: 0,
    winner: null,
    reason: null,
    wallsPerPlayer,
    players: [
      // seat 0 — снизу, идёт наверх (к ряду 0)
      { r: N - 1, c: (N - 1) / 2, goalRow: 0, walls: wallsPerPlayer },
      // seat 1 — сверху, идёт вниз (к ряду 8)
      { r: 0, c: (N - 1) / 2, goalRow: N - 1, walls: wallsPerPlayer },
    ],
    // плоские маски стен, индекс = r * W + c
    h: new Array(W * W).fill(0),
    v: new Array(W * W).fill(0),
    wallList: [],   // [{r,c,o,by,ply}] — для отрисовки и истории
    history: [],    // [{type,...,by,notation}]
  };
}

export function cloneGame(g) {
  return {
    turn: g.turn,
    ply: g.ply,
    winner: g.winner,
    reason: g.reason,
    wallsPerPlayer: g.wallsPerPlayer,
    players: [{ ...g.players[0] }, { ...g.players[1] }],
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

/** Можно ли шагнуть из (r,c) в направлении (dr,dc) — только стены и границы. */
export function canStep(g, r, c, dr, dc) {
  const nr = r + dr, nc = c + dc;
  if (!inBoard(nr, nc)) return false;

  if (dr === -1) {                       // вверх: граница между nr и r
    const gr = r - 1;
    if (inGrid(gr, c) && g.h[gr * W + c]) return false;
    if (inGrid(gr, c - 1) && g.h[gr * W + c - 1]) return false;
    return true;
  }
  if (dr === 1) {                        // вниз: граница между r и nr
    const gr = r;
    if (inGrid(gr, c) && g.h[gr * W + c]) return false;
    if (inGrid(gr, c - 1) && g.h[gr * W + c - 1]) return false;
    return true;
  }
  if (dc === -1) {                       // влево
    const gc = c - 1;
    if (inGrid(r, gc) && g.v[r * W + gc]) return false;
    if (inGrid(r - 1, gc) && g.v[(r - 1) * W + gc]) return false;
    return true;
  }
  // вправо
  const gc = c;
  if (inGrid(r, gc) && g.v[r * W + gc]) return false;
  if (inGrid(r - 1, gc) && g.v[(r - 1) * W + gc]) return false;
  return true;
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
  const foe = g.players[1 - p];
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

    if (!(foe.r === nr && foe.c === nc)) {
      push(nr, nc, false);
      continue;
    }

    // на соседней клетке стоит соперник — пробуем перепрыгнуть
    const jr = nr + dr, jc = nc + dc;
    const straightOk = inBoard(jr, jc) && canStep(g, nr, nc, dr, dc);
    if (straightOk) {
      push(jr, jc, true);
      continue;
    }
    // прямой прыжок закрыт (стена или край) → разрешены диагонали
    const perp = dr === 0 ? [[-1, 0], [1, 0]] : [[0, -1], [0, 1]];
    for (const [pr, pc] of perp) {
      if (!canStep(g, nr, nc, pr, pc)) continue;
      const tr = nr + pr, tc = nc + pc;
      if (tr === me.r && tc === me.c) continue;
      push(tr, tc, true);
    }
  }
  return out;
}

export function isPawnMoveLegal(g, p, r, c) {
  return pawnMoves(g, p).some((m) => m.r === r && m.c === c);
}

/* ------------------------------------------------------------------ *
 * Поиск пути (BFS)
 * ------------------------------------------------------------------ */

const _dist = new Int16Array(N * N);
const _queue = new Int16Array(N * N);

/** Кратчайшее расстояние игрока p до его целевого ряда. Infinity — пути нет. */
export function distanceToGoal(g, p) {
  const me = g.players[p];
  const goal = me.goalRow;
  _dist.fill(-1);
  let head = 0, tail = 0;
  const start = me.r * N + me.c;
  _dist[start] = 0;
  _queue[tail++] = start;

  while (head < tail) {
    const cur = _queue[head++];
    const r = (cur / N) | 0, c = cur % N;
    if (r === goal) return _dist[cur];
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
  const goal = me.goalRow;
  const prev = new Int16Array(N * N).fill(-1);
  const seen = new Uint8Array(N * N);
  const q = [me.r * N + me.c];
  seen[q[0]] = 1;
  let end = -1;
  for (let i = 0; i < q.length; i++) {
    const cur = q[i];
    const r = (cur / N) | 0, c = cur % N;
    if (r === goal) { end = cur; break; }
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
  if (g.players[p].walls <= 0) return err('empty', 'Стены закончились');

  const i = r * W + c;
  if (g.h[i] || g.v[i]) return err('occupied', 'Здесь уже стоит стена');

  if (o === H) {
    if (c > 0 && g.h[i - 1]) return err('overlap', 'Перекрывает соседнюю стену');
    if (c < W - 1 && g.h[i + 1]) return err('overlap', 'Перекрывает соседнюю стену');
  } else {
    if (r > 0 && g.v[i - W]) return err('overlap', 'Перекрывает соседнюю стену');
    if (r < W - 1 && g.v[i + W]) return err('overlap', 'Перекрывает соседнюю стену');
  }

  // главное правило: нельзя полностью замуровать любого игрока
  const arr = o === H ? g.h : g.v;
  arr[i] = 1;
  const ok0 = distanceToGoal(g, 0) !== Infinity;
  const ok1 = ok0 && distanceToGoal(g, 1) !== Infinity;
  arr[i] = 0;
  if (!ok0 || !ok1) return err('blocked', 'Нельзя полностью перекрыть путь');

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
  if (g.players[p].walls <= 0) return out;
  for (let r = 0; r < W; r++) {
    for (let c = 0; c < W; c++) {
      if (wallOk(g, p, r, c, H)) out.push({ type: 'wall', r, c, o: H });
      if (wallOk(g, p, r, c, V)) out.push({ type: 'wall', r, c, o: V });
    }
  }
  return out;
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

  if (mv.type === 'move') {
    if (!isPawnMoveLegal(g, p, mv.r, mv.c)) return err('illegal', 'Так ходить нельзя');
    const me = g.players[p];
    const from = { r: me.r, c: me.c };
    me.r = mv.r; me.c = mv.c;
    const notation = cellName(mv.r, mv.c);
    g.history.push({ type: 'move', by: p, from, r: mv.r, c: mv.c, notation, ply: g.ply });
    g.ply++;
    if (me.r === me.goalRow) {
      g.winner = p;
      g.reason = 'goal';
    } else {
      g.turn = 1 - p;
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
    g.turn = 1 - p;
    return { ok: true, notation };
  }

  return err('unknown', 'Неизвестный тип хода');
}

/* ------------------------------------------------------------------ *
 * Нотация
 * ------------------------------------------------------------------ */

const FILES = 'abcdefghi';

/** Клетка (r,c) → «e1». Ряд 8 (низ) = 1, ряд 0 (верх) = 9. */
export function cellName(r, c) {
  return FILES[c] + (N - r);
}

/** Стена решётки (r,c,o) → «e3h». */
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
    turn: g.turn,
    ply: g.ply,
    winner: g.winner,
    reason: g.reason,
    wallsPerPlayer: g.wallsPerPlayer,
    players: g.players.map((p) => ({ r: p.r, c: p.c, goalRow: p.goalRow, walls: p.walls })),
    wallList: g.wallList.map((w) => ({ r: w.r, c: w.c, o: w.o, by: w.by, ply: w.ply })),
    history: g.history.map((h) => ({ ...h })),
  };
}

export function deserialize(data) {
  const g = createGame({ wallsPerPlayer: data.wallsPerPlayer });
  g.turn = data.turn;
  g.ply = data.ply;
  g.winner = data.winner;
  g.reason = data.reason;
  g.players = data.players.map((p) => ({ ...p }));
  g.wallList = data.wallList.map((w) => ({ ...w }));
  g.history = (data.history || []).map((h) => ({ ...h }));
  for (const w of g.wallList) {
    (w.o === H ? g.h : g.v)[w.r * W + w.c] = 1;
  }
  return g;
}

export const DIRECTIONS = DIRS;
