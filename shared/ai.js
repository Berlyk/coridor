/**
 * Бот для «Коридора».
 *
 * Четыре уровня:
 *   easy   «Новичок»: жадный шаг вперёд, много случайности и ошибок
 *   medium «Любитель»: жадность плюс простая тактика стен
 *   hard   «Профи»: negamax с alpha-beta, глубина 4, редкие зевки
 *   expert «Мастер»: итеративное углубление до 6 полуходов
 *
 * Перебор включается только в дуэли. В режимах на трёх и четырёх игроков
 * бот играет по эвристике: там минимакс на двоих неприменим.
 */

import {
  W, H, V,
  pawnMoves, distanceToGoal, shortestPath, wallOk, allWalls, atGoal, advanceTurn,
} from './quoridor.js';

const MATE = 1e6;

export const LEVELS = [
  {
    id: 'easy',
    label: 'Новичок',
    hint: 'Ходит вперёд, часто ошибается и почти не строит стены',
    depth: 0, wallCandidates: 6, budgetMs: 0, thinkMs: [420, 780],
  },
  {
    id: 'medium',
    label: 'Любитель',
    hint: 'Идёт кратчайшим путём и умеет ставить стены поперёк',
    depth: 0, wallCandidates: 10, budgetMs: 0, thinkMs: [520, 900],
  },
  {
    id: 'hard',
    label: 'Профи',
    hint: 'Считает на четыре полухода вперёд, разменивает стены с выгодой',
    depth: 4, wallCandidates: 12, budgetMs: 800, thinkMs: [520, 900],
  },
  {
    id: 'expert',
    label: 'Мастер',
    hint: 'Глубокий перебор, ловит на темпах и строит длинные обходы',
    depth: 6, wallCandidates: 16, budgetMs: 2500, thinkMs: [600, 1000],
  },
];

export const LEVEL_BY_ID = Object.fromEntries(LEVELS.map((l) => [l.id, l]));

/* ------------------------------------------------------------------ *
 * Помощники по составу игроков
 * ------------------------------------------------------------------ */

function activeCount(g) {
  let n = 0;
  for (const p of g.players) if (p.active) n++;
  return n;
}

/** Ближайший к своей цели соперник (не из моей команды). */
function bestFoe(g, p) {
  const me = g.players[p];
  let best = -1, bestD = Infinity;
  for (let i = 0; i < g.players.length; i++) {
    const q = g.players[i];
    if (!q.active || q.team === me.team) continue;
    const d = distanceToGoal(g, i);
    if (d < bestD) { bestD = d; best = i; }
  }
  return { index: best, dist: bestD };
}

/** Лучшая (наименьшая) дистанция моей команды. */
function teamDist(g, team) {
  let best = Infinity;
  for (let i = 0; i < g.players.length; i++) {
    const q = g.players[i];
    if (!q.active || q.team !== team) continue;
    const d = distanceToGoal(g, i);
    if (d < best) best = d;
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * do / undo без клонирования
 * ------------------------------------------------------------------ */

function doMove(g, p, mv) {
  if (mv.type === 'move') {
    const me = g.players[p];
    const undo = { type: 'move', r: me.r, c: me.c, winner: g.winner };
    me.r = mv.r; me.c = mv.c;
    if (atGoal(me)) g.winner = me.team;
    return undo;
  }
  const arr = mv.o === H ? g.h : g.v;
  arr[mv.r * W + mv.c] = 1;
  g.players[p].walls--;
  return { type: 'wall' };
}

function undoMove(g, p, mv, undo) {
  if (mv.type === 'move') {
    const me = g.players[p];
    me.r = undo.r; me.c = undo.c;
    g.winner = undo.winner;
    return;
  }
  const arr = mv.o === H ? g.h : g.v;
  arr[mv.r * W + mv.c] = 0;
  g.players[p].walls++;
}

/* ------------------------------------------------------------------ *
 * Оценка позиции
 * ------------------------------------------------------------------ */

function evaluate(g, p) {
  const me = g.players[p];
  const dMe = distanceToGoal(g, p);
  const foe = bestFoe(g, p);
  if (dMe === Infinity) return -MATE;
  if (foe.index === -1) return MATE;
  if (foe.dist === Infinity) return MATE;
  if (dMe === 0) return MATE - 1;
  if (foe.dist === 0) return -(MATE - 1);
  const wMe = me.walls;
  const wOp = g.players[foe.index].walls;
  return (foe.dist - dMe) * 100 + (wMe - wOp) * 12 - dMe * 4;
}

/* ------------------------------------------------------------------ *
 * Генерация ходов
 * ------------------------------------------------------------------ */

/** Ходы фишкой, отсортированные по получаемому расстоянию до цели. */
function pawnCandidates(g, p) {
  const me = g.players[p];
  const raw = pawnMoves(g, p);
  const out = [];
  const or = me.r, oc = me.c;
  for (const m of raw) {
    me.r = m.r; me.c = m.c;
    const d = atGoal(me) ? -1 : distanceToGoal(g, p);
    out.push({ mv: { type: 'move', r: m.r, c: m.c }, score: -d, dist: d });
  }
  me.r = or; me.c = oc;
  out.sort((a, b) => b.score - a.score);
  return out;
}

/** Стены, перекрывающие переход между двумя соседними клетками. */
function blockersFor(a, b) {
  const out = [];
  if (a.r === b.r) {
    const gc = Math.min(a.c, b.c);
    if (a.r < W) out.push({ r: a.r, c: gc, o: V });
    if (a.r > 0) out.push({ r: a.r - 1, c: gc, o: V });
  } else {
    const gr = Math.min(a.r, b.r);
    if (a.c < W) out.push({ r: gr, c: a.c, o: H });
    if (a.c > 0) out.push({ r: gr, c: a.c - 1, o: H });
  }
  return out;
}

/**
 * Кандидаты-стены: на кратчайшем маршруте ближайшего соперника,
 * рядом с фишками и как продолжение уже построенных барьеров.
 */
function wallCandidates(g, p, limit) {
  const me = g.players[p];
  if (!me || me.walls <= 0) return [];
  const foe = bestFoe(g, p);
  if (foe.index === -1) return [];

  const baseMe = teamDist(g, me.team);
  const baseOp = foe.dist;

  const seen = new Set();
  const raw = [];
  const add = (r, c, o) => {
    if (r < 0 || c < 0 || r >= W || c >= W) return;
    const k = (r * W + c) * 3 + o;
    if (seen.has(k)) return;
    seen.add(k);
    raw.push({ r, c, o });
  };

  const path = shortestPath(g, foe.index);
  if (path) {
    for (let i = 0; i < path.length - 1 && i < 7; i++) {
      for (const b of blockersFor(path[i], path[i + 1])) add(b.r, b.c, b.o);
    }
  }
  for (const q of [g.players[foe.index], me]) {
    for (let dr = -1; dr <= 0; dr++) {
      for (let dc = -1; dc <= 0; dc++) {
        add(q.r + dr, q.c + dc, H);
        add(q.r + dr, q.c + dc, V);
      }
    }
  }
  for (const w of g.wallList) {
    add(w.r, w.c + 2, w.o);
    add(w.r, w.c - 2, w.o);
    add(w.r + 2, w.c, w.o);
    add(w.r - 2, w.c, w.o);
    add(w.r + 1, w.c + 1, w.o === H ? V : H);
    add(w.r - 1, w.c - 1, w.o === H ? V : H);
  }

  const scored = [];
  for (const cand of raw) {
    if (!wallOk(g, p, cand.r, cand.c, cand.o)) continue;
    const arr = cand.o === H ? g.h : g.v;
    const i = cand.r * W + cand.c;
    arr[i] = 1;
    const dMe = teamDist(g, me.team);
    const dOp = distanceToGoal(g, foe.index);
    arr[i] = 0;
    const gain = (dOp - baseOp) - (dMe - baseMe);
    if (gain <= 0) continue;
    scored.push({ mv: { type: 'wall', r: cand.r, c: cand.c, o: cand.o }, score: gain });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/* ------------------------------------------------------------------ *
 * Negamax + alpha-beta (только для дуэли)
 * ------------------------------------------------------------------ */

class Timeout extends Error {}

function negamax(g, p, depth, alpha, beta, ctx) {
  if ((++ctx.nodes & 511) === 0 && ctx.deadline && Date.now() > ctx.deadline) {
    throw new Timeout();
  }
  if (depth <= 0) return evaluate(g, p);

  const moves = [];
  for (const x of pawnCandidates(g, p)) moves.push(x.mv);
  for (const x of wallCandidates(g, p, ctx.wallLimit)) moves.push(x.mv);
  if (moves.length === 0) return evaluate(g, p);

  const foeIndex = bestFoe(g, p).index;
  if (foeIndex === -1) return MATE;

  let best = -Infinity;
  for (const mv of moves) {
    const undo = doMove(g, p, mv);
    let score;
    try {
      if (g.winner === g.players[p].team) {
        score = MATE - (ctx.rootDepth - depth);
      } else {
        score = -negamax(g, foeIndex, depth - 1, -beta, -alpha, ctx);
      }
    } finally {
      undoMove(g, p, mv, undo);
    }

    if (score > best) {
      best = score;
      if (depth === ctx.rootDepth) {
        ctx.bestMove = mv;
        ctx.bestScore = score;
      }
    }
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

function searchBest(g, p, level) {
  const ctx = {
    nodes: 0,
    wallLimit: level.wallCandidates,
    deadline: level.budgetMs ? Date.now() + level.budgetMs : 0,
    bestMove: null,
    bestScore: 0,
    rootDepth: 1,
  };
  let best = null;
  for (let d = 1; d <= level.depth; d++) {
    ctx.rootDepth = d;
    ctx.bestMove = null;
    try {
      negamax(g, p, d, -Infinity, Infinity, ctx);
      if (ctx.bestMove) best = ctx.bestMove;
      if (ctx.bestScore > MATE / 2) break;
    } catch (e) {
      if (!(e instanceof Timeout)) throw e;
      break;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * Простые уровни
 * ------------------------------------------------------------------ */

function pick(arr, rnd) { return arr[Math.floor(rnd() * arr.length)]; }

function playEasy(g, p, rnd) {
  const pawns = pawnCandidates(g, p);
  if (!pawns.length) return null;
  const roll = rnd();

  if (roll < 0.10 && g.players[p].walls > 0) {
    const pool = wallCandidates(g, p, 6);
    if (pool.length) return pick(pool, rnd).mv;
    const any = allWalls(g, p);
    if (any.length) return pick(any, rnd);
  }
  if (roll < 0.38 && pawns.length > 1) return pick(pawns.slice(1), rnd).mv;
  const bestScore = pawns[0].score;
  const ties = pawns.filter((x) => x.score === bestScore);
  return pick(ties, rnd).mv;
}

function playMedium(g, p, rnd) {
  const pawns = pawnCandidates(g, p);
  if (!pawns.length) return null;
  const dMe = distanceToGoal(g, p);
  const foe = bestFoe(g, p);

  if (g.players[p].walls > 0 && foe.index !== -1 && foe.dist <= dMe && rnd() < 0.75) {
    const pool = wallCandidates(g, p, 10);
    if (pool.length && pool[0].score >= (foe.dist < dMe ? 1 : 2)) {
      const top = pool.filter((x) => x.score === pool[0].score);
      return pick(top, rnd).mv;
    }
  }
  if (rnd() < 0.12 && pawns.length > 1) return pawns[1].mv;
  const bestScore = pawns[0].score;
  const ties = pawns.filter((x) => x.score === bestScore);
  return pick(ties, rnd).mv;
}

/* ------------------------------------------------------------------ *
 * Публичный API
 * ------------------------------------------------------------------ */

/**
 * Выбрать ход за игрока p.
 * @param {object} g       состояние (не изменяется по итогу вызова)
 * @param {number} p       индекс игрока
 * @param {string} levelId easy|medium|hard|expert
 * @param {function} rnd   генератор случайных чисел
 */
export function chooseMove(g, p, levelId = 'medium', rnd = Math.random) {
  const level = LEVEL_BY_ID[levelId] || LEVEL_BY_ID.medium;
  let mv = null;

  // перебор корректен только когда на доске ровно двое
  const canSearch = level.depth > 0 && activeCount(g) === 2;

  if (level.id === 'easy') mv = playEasy(g, p, rnd);
  else if (level.id === 'medium' || !canSearch) mv = playMedium(g, p, rnd);
  else {
    mv = searchBest(g, p, level);
    if (level.id === 'hard' && rnd() < 0.07) {
      const pawns = pawnCandidates(g, p);
      if (pawns.length > 1) mv = pawns[1].mv;
    }
  }

  // страховка: возвращаем только заведомо легальный ход
  if (mv && mv.type === 'wall' && !wallOk(g, p, mv.r, mv.c, mv.o)) mv = null;
  if (mv && mv.type === 'move'
      && !pawnMoves(g, p).some((m) => m.r === mv.r && m.c === mv.c)) mv = null;
  if (!mv) {
    const pawns = pawnCandidates(g, p);
    mv = pawns.length ? pawns[0].mv : null;
  }
  return mv;
}

/** Простейший разумный ход: используется сервером при истечении времени. */
export function advanceMove(g, p) {
  const pawns = pawnCandidates(g, p);
  return pawns.length ? pawns[0].mv : null;
}

/** Пауза «на подумать», чтобы бот не отвечал мгновенно. */
export function thinkDelay(levelId, rnd = Math.random) {
  const level = LEVEL_BY_ID[levelId] || LEVEL_BY_ID.medium;
  const [a, b] = level.thinkMs;
  return Math.round(a + rnd() * (b - a));
}

export { advanceTurn };
