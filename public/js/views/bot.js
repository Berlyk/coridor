/* Игра против бота — полностью на клиенте, сервер не нужен. */

import {
  createGame, applyMove, serialize, deserialize, cloneGame, moveName, distanceToGoal,
} from '/shared/quoridor.js';
import { LEVELS, LEVEL_BY_ID, thinkDelay, chooseMove } from '/shared/ai.js';

import { h, clear, icon, toast, plural } from '../ui.js';
import { store } from '../store.js';
import { sfx } from '../sound.js';
import { Board } from '../board.js';
import { PlayerCard, panel, turnPill, gameLayout } from './game-ui.js';

export function renderBot(mount) {
  let view = null;
  const state = {
    level: store.botLevel,
    mySeat: store.botSide,
    walls: 10,
  };

  function setup() {
    view?.destroy?.();
    clear(mount);
    view = renderSetup(mount, state, start);
  }

  function start() {
    view?.destroy?.();
    clear(mount);
    view = renderGame(mount, { ...state }, setup);
  }

  setup();

  return { destroy() { view?.destroy?.(); } };
}

/* ================================================================== *
 * Экран настройки
 * ================================================================== */

function renderSetup(mount, state, onStart) {
  const levelCards = h('div', { class: 'level-row' });

  const repaint = () => {
    clear(levelCards);
    for (const lv of LEVELS) {
      const active = lv.id === state.level;
      const stats = store.stats.bot[lv.id] || [0, 0];
      levelCards.append(h('button', {
        class: 'tile',
        style: {
          textAlign: 'left',
          borderColor: active ? 'var(--red)' : 'var(--border)',
          background: active ? 'linear-gradient(140deg, rgba(220,38,38,.14), var(--card-2))' : 'var(--card-2)',
          transform: active ? 'translateY(-2px)' : 'none',
        },
        onClick: () => { state.level = lv.id; store.botLevel = lv.id; repaint(); },
      },
        h('div', { class: 'hstack' },
          h('div', { class: 'tile__k' }, lv.label),
          h('div', { class: 'spacer' }),
          h('span', { class: 'badge' }, `${stats[0]}:${stats[1]}`)),
        h('div', { class: 'tile__v' }, lv.hint),
        h('div', { class: 'hstack', style: { marginTop: '10px', gap: '4px' } },
          ...[0, 1, 2, 3].map((i) => h('i', {
            style: {
              width: '18px', height: '4px', borderRadius: '2px',
              background: i <= LEVELS.indexOf(lv) ? 'var(--red)' : 'var(--card-3)',
            },
          })))));
    }
  };
  repaint();

  const sideSeg = h('div', { class: 'seg seg--block' });
  const paintSide = () => {
    clear(sideSeg);
    for (const [seat, label, sub] of [[0, 'Снизу (красные)', 'ходите первым'], [1, 'Сверху (белые)', 'ходит бот']]) {
      sideSeg.append(h('button', {
        class: `seg__btn ${state.mySeat === seat ? 'is-active' : ''}`,
        onClick: () => { state.mySeat = seat; store.botSide = seat; paintSide(); },
        title: sub,
      }, label));
    }
  };
  paintSide();

  const wallsSeg = h('div', { class: 'seg seg--block' });
  const paintWalls = () => {
    clear(wallsSeg);
    for (const n of [6, 8, 10, 12]) {
      wallsSeg.append(h('button', {
        class: `seg__btn ${state.walls === n ? 'is-active' : ''}`,
        onClick: () => { state.walls = n; paintWalls(); },
      }, String(n)));
    }
  };
  paintWalls();

  mount.append(h('div', { class: 'wrap wrap--narrow stack stack--lg' },
    h('div', {},
      h('div', { class: 'eyebrow' }, 'Одиночная игра'),
      h('h2', { class: 'h1', style: { fontSize: 'clamp(30px,5vw,48px)', marginTop: '6px' } }, 'ПАРТИЯ С БОТОМ')),
    panel('Уровень соперника', levelCards),
    h('div', { class: 'grid-2' },
      panel('Ваша сторона', sideSeg),
      panel('Стен у каждого', wallsSeg)),
    h('button', { class: 'btn btn--primary btn--lg btn--block', onClick: onStart },
      icon('play', 20), 'Начать партию')));

  return { destroy() {} };
}

/* ================================================================== *
 * Игровой экран
 * ================================================================== */

function renderGame(mount, cfg, onBack) {
  const botSeat = 1 - cfg.mySeat;
  const level = LEVEL_BY_ID[cfg.level];

  let game = createGame({ wallsPerPlayer: cfg.walls });
  let busy = false;
  let finished = false;
  const undoStack = [];

  /* ---------- воркер ---------- */

  let worker = null;
  let reqId = 0;
  const pending = new Map();
  try {
    worker = new Worker('/js/bot-worker.js', { type: 'module' });
    worker.onmessage = (e) => {
      const { id, move, error } = e.data || {};
      const res = pending.get(id);
      if (!res) return;
      pending.delete(id);
      if (error) res.reject(new Error(error));
      else res.resolve(move);
    };
    worker.onerror = () => { worker = null; };
  } catch {
    worker = null;
  }

  function askBot(seat, lvl) {
    if (!worker) {
      return new Promise((resolve) => {
        setTimeout(() => resolve(chooseMove(cloneGame(game), seat, lvl)), 10);
      });
    }
    const id = ++reqId;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, state: serialize(game), seat, level: lvl });
      setTimeout(() => {
        if (!pending.has(id)) return;
        pending.delete(id);
        resolve(chooseMove(cloneGame(game), seat, lvl));
      }, 8000);
    });
  }

  /* ---------- доска ---------- */

  const board = new Board({
    onMove: (mv) => humanMove(mv),
    onIllegal: (msg) => toast(msg, 'err', 1800),
    onOrient: () => paintRotate(),
  });

  const pill = turnPill();
  const cards = [new PlayerCard(0), new PlayerCard(1)];

  const btnUndo = h('button', { class: 'btn btn--sm btn--ghost', onClick: undo }, icon('undo', 14), 'Отменить');
  const btnHint = h('button', { class: 'btn btn--sm btn--ghost', onClick: hint }, icon('route', 14), 'Подсказка');
  const btnNew = h('button', { class: 'btn btn--sm btn--ghost', onClick: restart }, icon('rotate', 14), 'Заново');
  const btnQuit = h('button', { class: 'btn btn--sm btn--outline', onClick: onBack }, icon('back', 14), 'Уровень');

  const btnRotate = h('button', {
    class: 'btn btn--sm btn--ghost',
    title: 'Повернуть стену (R)',
    onClick: () => board.toggleOrientation(),
  });

  const boardBar = h('div', { class: 'board-bar' },
    pill.el,
    btnRotate,
    h('div', { class: 'spacer' }),
    btnHint, btnUndo, btnNew, btnQuit);

  const stage = h('div', { class: 'board-stage' });
  board.mount(stage);
  stage.append(boardBar);

  const side = [
    h('div', { class: 'stack stack--sm' }, cards[0].el, cards[1].el),
    panel('Управление', h('div', { class: 'stack stack--sm' },
      tipRow('Клик по клетке', 'ход фишкой'),
      tipRow('Наведение на паз', 'призрак стены'),
      tipRow('R', 'повернуть стену'),
      tipRow('Esc', 'снять прицел'))),
  ];

  mount.append(gameLayout(stage, side));

  /* ---------- логика ---------- */

  function paint(opts = {}) {
    const myTurn = !finished && game.winner === null && game.turn === cfg.mySeat && !busy;
    board.update(game, {
      mySeat: cfg.mySeat,
      flip: cfg.mySeat === 1,
      interactive: myTurn,
      lastMove: game.history[game.history.length - 1] || null,
      silent: opts.silent,
    });

    for (const seat of [0, 1]) {
      const isBot = seat === botSeat;
      cards[seat].update({
        name: isBot ? `Бот · ${level.label}` : store.name,
        isBot,
        isMe: !isBot,
        isTurn: game.winner === null && game.turn === seat,
        walls: game.players[seat].walls,
        wallsMax: cfg.walls,
        sub: `до цели ${distToText(seat)}`,
        clockMs: null,
      });
    }

    paintRotate();
    btnUndo.disabled = busy || finished || undoStack.length === 0;
    btnHint.disabled = busy || finished || game.turn !== cfg.mySeat;

    if (finished) return;
    if (game.winner !== null) return;
    if (busy) pill.thinking('Бот думает');
    else if (game.turn === cfg.mySeat) pill.set('Ваш ход', 'me');
    else pill.set('Ход бота', '');
  }

  function paintRotate() {
    clear(btnRotate);
    const horizontal = board.orientation === 1;
    btnRotate.append(
      h('span', { class: `wall-icon ${horizontal ? 'is-h' : 'is-v'}` }),
      h('span', {}, horizontal ? 'Стена: горизонтально' : 'Стена: вертикально'),
      h('span', { class: 'kbd' }, 'R'));
  }

  function distToText(seat) {
    const d = distanceToGoal(game, seat);
    return d === Infinity ? '—' : `${d} ${plural(d, 'шаг', 'шага', 'шагов')}`;
  }

  function humanMove(mv) {
    if (busy || finished || game.turn !== cfg.mySeat) return;
    undoStack.push(serialize(game));
    const res = applyMove(game, cfg.mySeat, mv);
    if (!res.ok) { toast(res.message, 'err'); undoStack.pop(); return; }
    paint();
    if (game.winner !== null) return finish();
    setTimeout(botTurn, 120);
  }

  async function botTurn() {
    if (finished || game.winner !== null) return;
    busy = true;
    paint();
    const t0 = performance.now();
    let mv = null;
    try {
      mv = await askBot(botSeat, cfg.level);
    } catch {
      mv = chooseMove(cloneGame(game), botSeat, 'medium');
    }
    if (finished) return;
    const wait = Math.max(0, thinkDelay(cfg.level) - (performance.now() - t0));
    await sleep(wait);
    if (finished) return;

    busy = false;
    if (!mv) return finish(cfg.mySeat, 'stuck');
    const res = applyMove(game, botSeat, mv);
    if (!res.ok) {
      const fallback = chooseMove(cloneGame(game), botSeat, 'easy');
      if (!fallback || !applyMove(game, botSeat, fallback).ok) return finish(cfg.mySeat, 'stuck');
    }
    paint();
    if (game.winner !== null) finish();
  }

  function finish(forced, reason) {
    finished = true;
    const winner = forced !== undefined ? forced : game.winner;
    const iWon = winner === cfg.mySeat;
    store.recordBot(cfg.level, iWon);
    paint();
    board.update(game, { interactive: false, silent: true });
    if (iWon) { sfx.win(); board.celebrate(cfg.mySeat); }
    else sfx.lose();

    board.showOverlay(h('div', {},
      h('div', { class: `overlay__title ${iWon ? 'is-win' : 'is-lose'}` }, iWon ? 'Победа' : 'Поражение'),
      h('div', { class: 'overlay__sub' },
        reason === 'stuck' ? 'Бот не нашёл ход'
          : iWon ? `Вы обыграли уровень «${level.label}» за ${game.history.length} ходов`
            : `Бот «${level.label}» дошёл первым`),
      h('div', { class: 'overlay__actions' },
        h('button', { class: 'btn btn--primary', onClick: restart }, icon('rotate'), 'Ещё партия'),
        h('button', { class: 'btn btn--ghost', onClick: onBack }, icon('back'), 'Сменить уровень'))));
    pill.set(iWon ? 'Вы победили' : 'Победил бот', iWon ? 'me' : '');
  }

  function restart() {
    board.hideOverlay();
    game = createGame({ wallsPerPlayer: cfg.walls });
    undoStack.length = 0;
    finished = false;
    busy = false;
    board.update(game, { silent: true, interactive: false });
    // синхронизируем стены: старые снимаем
    paint({ silent: true });
    sfx.start();
    if (game.turn === botSeat) setTimeout(botTurn, 400);
  }

  function undo() {
    if (!undoStack.length || busy || finished) return;
    const snap = undoStack.pop();
    game = deserialize(snap);
    board.update(game, { silent: true, interactive: false });
    paint({ silent: true });
    toast('Ход отменён');
  }

  async function hint() {
    if (busy || finished || game.turn !== cfg.mySeat) return;
    btnHint.disabled = true;
    const mv = await askBot(cfg.mySeat, 'hard').catch(() => null);
    btnHint.disabled = false;
    if (!mv) return;
    if (mv.type === 'move') {
      toast(`Совет: пойти на ${moveName(mv)}`, 'ok', 4000);
    } else {
      toast(`Совет: поставить стену ${moveName(mv)}`, 'ok', 4000);
    }
    flashHint(mv);
  }

  function flashHint(mv) {
    const layer = board.layers.fx;
    const step = board.cell + board.gap;
    const flip = cfg.mySeat === 1;
    const vr = (r, c) => (flip ? { r: 8 - r, c: 8 - c } : { r, c });
    if (mv.type === 'move') {
      const v = vr(mv.r, mv.c);
      const el = h('div', {
        style: {
          position: 'absolute',
          left: (v.c * step) + 'px', top: (v.r * step) + 'px',
          width: board.cell + 'px', height: board.cell + 'px',
          borderRadius: (board.cell * 0.16) + 'px',
          border: '2px solid #22c55e', boxShadow: '0 0 24px rgba(34,197,94,.6)',
        },
      });
      layer.append(el);
      el.animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], { duration: 1600, iterations: 2 });
      setTimeout(() => el.remove(), 3300);
    } else {
      const v = flip ? { r: 7 - mv.r, c: 7 - mv.c } : { r: mv.r, c: mv.c };
      const el = h('div', {
        class: `wall wall--${mv.o === 1 ? 'h' : 'v'}`,
        style: {
          '--r': v.r, '--c': v.c,
          background: 'rgba(34,197,94,.35)',
          boxShadow: '0 0 24px rgba(34,197,94,.6)',
          border: '1px solid #22c55e',
        },
      });
      layer.append(el);
      el.animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], { duration: 1600, iterations: 2 });
      setTimeout(() => el.remove(), 3300);
    }
  }

  const onSettings = () => paint({ silent: true });
  window.addEventListener('coridor:settings', onSettings);

  // старт
  paint({ silent: true });
  sfx.start();
  if (game.turn === botSeat) setTimeout(botTurn, 500);

  return {
    destroy() {
      finished = true;
      window.removeEventListener('coridor:settings', onSettings);
      worker?.terminate();
      board.destroy();
      window.removeEventListener('keydown', board._onKey);
    },
  };
}

function tipRow(k, v) {
  return h('div', { class: 'tip' },
    h('span', { class: 'badge' }, k),
    h('span', { class: 'tip__text' }, v));
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
