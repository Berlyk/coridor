/**
 * Проверка правил «Коридора» и ботов.
 * Запуск:  node tests/engine.test.js
 */

import * as Q from '../shared/quoridor.js';
import * as AI from '../shared/ai.js';

let failures = 0;
function ok(cond, label) {
  console.log(`${cond ? '  ok  ' : ' FAIL '} ${label}`);
  if (!cond) failures++;
}
function eq(a, b, label) { ok(JSON.stringify(a) === JSON.stringify(b), `${label} (${JSON.stringify(a)})`); }

function group(name) { console.log(`\n— ${name} —`); }

/* ------------------------------------------------------------------ */

group('стартовая позиция');
{
  const g = Q.createGame();
  ok(g.players[0].r === 8 && g.players[0].c === 4 && g.players[0].walls === 10, 'нижний игрок');
  ok(g.players[1].r === 0 && g.players[1].c === 4 && g.players[1].walls === 10, 'верхний игрок');
  ok(Q.distanceToGoal(g, 0) === 8 && Q.distanceToGoal(g, 1) === 8, 'обоим по 8 шагов до цели');
  ok(Q.pawnMoves(g, 0).length === 3, 'у края доски три хода');
  ok(Q.allWalls(g, 0).length === 128, 'на пустой доске 128 вариантов стен');
}

group('стены блокируют переходы');
{
  const g = Q.createGame();
  Q.applyMove(g, 0, { type: 'wall', r: 7, c: 4, o: Q.H });
  ok(!Q.canStep(g, 8, 4, -1, 0), 'горизонтальная стена перекрыла ход вверх слева');
  ok(!Q.canStep(g, 8, 5, -1, 0), 'та же стена перекрыла соседнюю колонку');
  ok(Q.canStep(g, 8, 3, -1, 0), 'соседняя слева колонка свободна');
  ok(Q.canStep(g, 8, 4, 0, 1), 'горизонтальная стена не мешает движению вбок');

  const g2 = Q.createGame();
  Q.applyMove(g2, 0, { type: 'wall', r: 4, c: 4, o: Q.V });
  ok(!Q.canStep(g2, 4, 4, 0, 1), 'вертикальная стена перекрыла ход вправо');
  ok(!Q.canStep(g2, 5, 4, 0, 1), 'и в следующем ряду тоже');
  ok(Q.canStep(g2, 3, 4, 0, 1), 'а рядом — нет');
}

group('пересечения стен');
{
  const g = Q.createGame();
  g.h[3 * 8 + 3] = 1;
  ok(!Q.checkWall(g, 0, 3, 3, Q.V).ok, 'вертикальная в занятом перекрестье запрещена');
  ok(!Q.checkWall(g, 0, 3, 4, Q.H).ok, 'горизонтальная внахлёст справа запрещена');
  ok(!Q.checkWall(g, 0, 3, 2, Q.H).ok, 'горизонтальная внахлёст слева запрещена');
  ok(Q.checkWall(g, 0, 3, 5, Q.H).ok, 'через одну — можно');
  ok(Q.checkWall(g, 0, 4, 3, Q.V).ok, 'вертикальная рядом — можно');
}

group('нельзя замуровать');
{
  const g = Q.createGame();
  g.players[1].r = 0; g.players[1].c = 0;
  g.v[0 * 8 + 0] = 1;                       // отрезали угол справа
  const res = Q.checkWall(g, 0, 1, 0, Q.H); // а этой стеной закрыли бы и низ
  ok(!res.ok && res.code === 'blocked', 'запирание угла отклонено с кодом blocked');
  ok(Q.distanceToGoal(g, 1) !== Infinity, 'после отката путь снова есть');
  ok(Q.checkWall(g, 0, 2, 0, Q.H).ok, 'стена, оставляющая выход, разрешена');
}

group('прыжки через соперника');
{
  const g = Q.createGame();
  g.players[0].r = 4; g.players[0].c = 4;
  g.players[1].r = 3; g.players[1].c = 4;
  const straight = Q.pawnMoves(g, 0);
  ok(straight.some((m) => m.r === 2 && m.c === 4 && m.jump), 'прямой прыжок доступен');
  ok(!straight.some((m) => m.r === 3 && m.c === 3), 'диагонали пока нет');

  g.h[2 * 8 + 4] = 1;       // стена за соперником
  const diag = Q.pawnMoves(g, 0);
  ok(!diag.some((m) => m.r === 2 && m.c === 4), 'прямой прыжок закрыт стеной');
  ok(diag.some((m) => m.r === 3 && m.c === 3) && diag.some((m) => m.r === 3 && m.c === 5),
    'вместо него две диагонали');

  const g2 = Q.createGame();
  g2.players[0].r = 1; g2.players[0].c = 4;
  g2.players[1].r = 0; g2.players[1].c = 4;
  const edge = Q.pawnMoves(g2, 0);
  ok(edge.some((m) => m.r === 0 && m.c === 3) && edge.some((m) => m.r === 0 && m.c === 5),
    'у края доски прыжок заменяется диагоналями');
}

group('победа и очередь хода');
{
  const g = Q.createGame();
  g.players[0].r = 1; g.players[0].c = 4;
  g.players[1].r = 0; g.players[1].c = 0;
  const res = Q.applyMove(g, 0, { type: 'move', r: 0, c: 4 });
  ok(res.ok && g.winner === 0 && g.reason === 'goal', 'достижение целевого ряда — победа');
  ok(!Q.applyMove(g, 1, { type: 'move', r: 1, c: 0 }).ok, 'после победы ходить нельзя');

  const g2 = Q.createGame();
  ok(!Q.applyMove(g2, 1, { type: 'move', r: 1, c: 4 }).ok, 'нельзя ходить вне очереди');
  ok(Q.applyMove(g2, 0, { type: 'move', r: 7, c: 4 }).ok && g2.turn === 1, 'очередь передаётся');
}

group('расход стен');
{
  const g = Q.createGame({ wallsPerPlayer: 1 });
  ok(Q.applyMove(g, 0, { type: 'wall', r: 0, c: 0, o: Q.H }).ok, 'первая стена ставится');
  ok(g.players[0].walls === 0, 'счётчик уменьшился');
  Q.applyMove(g, 1, { type: 'move', r: 1, c: 4 });
  const res = Q.applyMove(g, 0, { type: 'wall', r: 4, c: 4, o: Q.H });
  ok(!res.ok && res.code === 'empty', 'без стен поставить нельзя');
}

group('нотация');
{
  eq(Q.cellName(8, 4), 'e1', 'нижняя стартовая клетка');
  eq(Q.cellName(0, 0), 'a9', 'левый верхний угол');
  eq(Q.wallName(7, 4, Q.H), 'e1h', 'горизонтальная стена');
  eq(Q.wallName(0, 0, Q.V), 'a8v', 'вертикальная стена');
}

group('сериализация');
{
  const g = Q.createGame();
  Q.applyMove(g, 0, { type: 'move', r: 7, c: 4 });
  Q.applyMove(g, 1, { type: 'wall', r: 6, c: 3, o: Q.H });
  const back = Q.deserialize(Q.serialize(g));
  ok(back.players[0].r === g.players[0].r && back.players[1].walls === g.players[1].walls,
    'фишки восстановлены');
  eq(back.h, g.h, 'маска горизонтальных стен восстановлена');
  ok(back.turn === g.turn && back.ply === g.ply, 'очередь и счётчик ходов совпадают');
  ok(Q.distanceToGoal(back, 0) === Q.distanceToGoal(g, 0), 'дистанции совпадают');
}

group('маршрут');
{
  const g = Q.createGame();
  const path = Q.shortestPath(g, 0);
  ok(path.length === 9 && path[0].r === 8 && path[8].r === 0, 'маршрут из 9 клеток снизу вверх');
  Q.applyMove(g, 0, { type: 'wall', r: 7, c: 4, o: Q.H });
  ok(Q.shortestPath(g, 0).length === 10, 'стена удлинила маршрут на один шаг');
}

group('режимы');
{
  const expect = { duel: 2, trio: 3, ffa: 4, duo: 4, siege: 3 };
  for (const [id, n] of Object.entries(expect)) {
    const g = Q.createGame({ mode: id });
    ok(g.players.length === n, `${id}: мест ${g.players.length}`);
    ok(g.order.length === n && new Set(g.order).size === n, `${id}: каждый получает ход`);
    ok(g.players.every((p, i) => Q.distanceToGoal(g, i) === 8), `${id}: всем по 8 шагов до цели`);
  }

  const siege = Q.createGame({ mode: 'siege' });
  ok(siege.players[0].moves === 2 && siege.players[1].moves === 1, 'одиночка ходит дважды');
  ok(siege.players[0].walls === siege.players[1].walls * 2, 'у одиночки вдвое больше стен');
  Q.applyMove(siege, 0, { type: 'move', r: 7, c: 4 });
  ok(siege.turn === 0 && siege.movesLeft === 1, 'после первого действия ход остаётся у одиночки');
  Q.applyMove(siege, 0, { type: 'move', r: 6, c: 4 });
  ok(siege.turn !== 0, 'после второго действия ход уходит дальше');

  const duo = Q.createGame({ mode: 'duo' });
  ok(duo.players[0].team === duo.players[1].team && duo.players[2].team === duo.players[3].team,
    '2 на 2: партнёры стоят напротив');
  const teamsInOrder = duo.order.map((i) => duo.players[i].team);
  ok(teamsInOrder[0] !== teamsInOrder[1] && teamsInOrder[1] !== teamsInOrder[2],
    '2 на 2: очередь чередует команды');

  // выбывание игрока не ломает очередь
  const ffa = Q.createGame({ mode: 'ffa' });
  Q.retirePlayer(ffa, ffa.turn, 'resign');
  ok(ffa.players.filter((p) => p.active).length === 3 && ffa.winner === null,
    'выбывший убран, партия продолжается');
  ok(ffa.players[ffa.turn].active, 'ход перешёл активному игроку');
}

group('боты');
{
  for (const lv of AI.LEVELS) {
    const g = Q.createGame();
    let n = 0;
    let bad = null;
    const t0 = Date.now();
    while (g.winner === null && n < 220) {
      const mv = AI.chooseMove(g, g.turn, lv.id);
      if (!mv) { bad = 'нет хода'; break; }
      const r = Q.applyMove(g, g.turn, mv);
      if (!r.ok) { bad = r.message; break; }
      n++;
    }
    ok(!bad && g.winner !== null,
      `${lv.label}: сам с собой доигрывает до конца (${n} полуходов, ${Date.now() - t0} мс)` + (bad ? ', ' + bad : ''));
  }

  // лестница силы
  const play = (a, b, seed) => {
    let s = seed;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const g = Q.createGame();
    let n = 0;
    while (g.winner === null && n < 250) {
      const mv = AI.chooseMove(g, g.turn, g.turn === 0 ? a : b, rnd);
      if (!mv || !Q.applyMove(g, g.turn, mv).ok) return 1 - g.turn;
      n++;
    }
    return g.winner;
  };
  for (const id of Object.keys(Q.MODES)) {
    let s = 4242;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const g = Q.createGame({ mode: id });
    let n = 0, bad = null;
    while (g.winner === null && n < 400) {
      const mv = AI.chooseMove(g, g.turn, 'medium', rnd);
      if (!mv) { bad = 'нет хода'; break; }
      const r = Q.applyMove(g, g.turn, mv);
      if (!r.ok) { bad = r.message; break; }
      n++;
    }
    ok(!bad && g.winner !== null, `режим ${id}: партия ботов доигрывается (${n} ходов)`);
  }

  for (const [weak, strong] of [['easy', 'medium'], ['medium', 'hard']]) {
    let wins = 0;
    for (let i = 0; i < 4; i++) if (play(weak, strong, 77 + i * 911) === 1) wins++;
    ok(wins >= 3, `${strong} обыгрывает ${weak} (${wins}/4)`);
  }
}

console.log(`\n${failures ? failures + ' ПРОВАЛОВ' : 'ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ'}\n`);
process.exit(failures ? 1 : 0);
