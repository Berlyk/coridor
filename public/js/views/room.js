/* Онлайн-комната: лобби, партия, чат. */

import {
  deserialize, cloneGame, applyMove, distanceToGoal, getMode, isTeamMode,
} from '/shared/quoridor.js';
import { h, clear, icon, toast, copyText, confirmDialog, plural, coinReward } from '../ui.js';
import { store } from '../store.js';
import { sfx } from '../sound.js';
import { onlineReward } from '../economy.js';
import * as net from '../net.js';
import { Board } from '../board.js';
import { PlayerCard, Chat, panel, turnPill, gameLayout, rotateButton } from './game-ui.js';
import { createDialog } from './home.js';

export function renderRoom(mount, code) {
  const offs = [];
  let room = null;
  let game = null;
  let firstPaint = true;
  let deadline = 0;
  let lowBeep = 0;
  let overlayShown = false;
  let hasLeftRoom = false;
  let lastSeq = 0;
  let resyncAt = 0;
  let pendingPly = -1;      // ход, который мы применили у себя и ждём подтверждения
  let pendingAt = 0;
  let wasOnline = true;

  const board = new Board({
    onMove: (mv) => sendMove(mv),
    onIllegal: (msg) => toast(msg, 'err', 1800),
    onOrient: () => rotate.paint(),
    onBlocked: () => explainBlock(),
  });

  const rotate = rotateButton(() => board);
  const pill = turnPill();
  const cards = [];
  const chat = new Chat((text) => net.send({ type: 'chat:send', text }));

  /* ---------- шапка ---------- */

  const roomTitle = h('div', { class: 'h3' }, 'Подключение');
  const modeBadge = h('span', { class: 'badge' }, '');
  const linkBtn = h('button', {
    class: 'iconbtn', title: 'Скопировать ссылку-приглашение',
    onClick: async () => {
      if (await copyText(`${location.origin}/#/room/${code}`)) toast('Ссылка скопирована', 'ok');
    },
  }, icon('share', 16));
  const manageBtn = h('button', {
    class: 'iconbtn', title: 'Управление партией', onClick: openManage,
  }, icon('settings', 16));
  const exitBtn = h('a', {
    class: 'iconbtn iconbtn--danger', title: 'Выйти из комнаты',
    href: '#/', onClick: () => leaveRoom(),
  }, icon('door', 16));
  const startBtn = h('button', {
    class: 'btn btn--sm btn--primary',
    onClick: () => net.send({ type: 'room:start' }),
  }, icon('play', 14), 'Начать партию');

  const headActions = h('div', { class: 'hstack hstack--wrap room-head__actions' });

  const head = h('div', { class: 'room-head' },
    h('div', { class: 'row__main' },
      h('div', { class: 'hstack' }, roomTitle, modeBadge)),
    headActions);

  /* ---------- боковая панель ---------- */

  const seatBox = h('div', { class: 'stack stack--sm' });
  const controlBox = h('div', { class: 'hstack hstack--wrap' });
  const spectatorBox = h('div', { class: 'stack stack--sm' });

  const clockPill = h('div', { class: 'clock-pill', style: { display: 'none' } });

  const boardBar = h('div', { class: 'board-bar' },
    pill.el, clockPill, rotate.el, h('div', { class: 'spacer' }), controlBox);
  const stage = h('div', { class: 'board-stage' });
  board.mount(stage);
  stage.append(boardBar);

  const spectatorPanel = panel('Наблюдатели', spectatorBox);
  const chatPanel = panel('Чат', chat.el);
  chatPanel.classList.add('panel--grow');

  const side = [seatBox, chatPanel, spectatorPanel];

  mount.append(head, gameLayout(stage, side));
  rotate.paint();

  /* ---------- сеть ---------- */

  net.send({ type: 'room:join', code });

  function requestResync(force = false) {
    const t = Date.now();
    if (!force && t - resyncAt < 1500) return;
    resyncAt = t;
    net.send({ type: 'room:resync' });
  }

  function nameOfSeat(i) {
    const id = room?.seats?.[i];
    return (id && room.members.find((m) => m.id === id)?.name) || 'игрока';
  }

  /** Пропуск в нумерации значит, что мы потеряли сообщение. Просим полный слепок. */
  function checkSeq(m) {
    if (typeof m.seq !== 'number') return true;
    if (m.seq === lastSeq + 1 || m.seq === lastSeq) { lastSeq = m.seq; return true; }
    if (m.seq > lastSeq + 1) {
      lastSeq = m.seq;
      requestResync();
    }
    return true;
  }

  offs.push(net.on('room:state', (m) => {
    if (!m.room || m.room.code !== code) return;
    room = m.room;
    if (typeof m.seq === 'number') lastSeq = m.seq;
    if (m.started) pendingPly = -1;
    store.lastRoom = room.status === 'finished' ? null : code;
    applyState(m.state, m.started === true);
    chat.update(room.chat);
    deadline = room.turnDeadline || 0;
    paint();
  }));

  offs.push(net.on('game:move', (m) => {
    if (!room) return;
    checkSeq(m);
    // если между нашим состоянием и пришедшим есть дыра, просим полный слепок
    if (game && m.state && m.state.ply > game.ply + 1) requestResync();
    applyState(m.state, false);
    if (m.auto) {
      toast(`Время вышло, сервер походил за ${nameOfSeat(m.by)}`, 'err', 5000);
      sfx.deny();
    }
    if (m.retired) toast('Игрок выбыл из партии');
    deadline = 0;
    paint();
  }));

  offs.push(net.on('game:clock', (m) => { deadline = m.turnDeadline || 0; lowBeep = 0; }));

  offs.push(net.on('game:over', (m) => {
    if (!room) return;
    checkSeq(m);
    if (m.state) applyState(m.state, true);
    room.status = 'finished';
    if (m.score) room.score = m.score;
    deadline = 0;
    showResult(m);
    paint();
  }));

  offs.push(net.on('game:reject', (m) => {
    toast(m.message || 'Ход отклонён', 'err');
    sfx.deny();
    pendingPly = -1;
    if (m.state) applyState(m.state, true);
    else requestResync();
    paint();
  }));

  offs.push(net.on('chat:msg', (m) => {
    if (chat.push(m.message) && !m.message.sys) sfx.chat();
  }));

  offs.push(net.on('room:notice', (m) => {
    const map = {
      disconnect: `${m.name} потерял связь, ждём ${Math.round((m.graceMs || 45000) / 1000)} с`,
      reconnect: `${m.name} снова в игре`,
      leave: `${m.name} вышел`,
      kick: `${m.name} исключён`,
    };
    toast(map[m.kind] || m.kind);
    sfx.notify();
  }));

  offs.push(net.on('room:rematch', (m) => {
    if (!room) return;
    room.rematch = m.players || [];
    paint();
  }));

  offs.push(net.on('room:kicked', () => {
    toast('Вас исключили из комнаты', 'err');
    hasLeftRoom = true;
    store.lastRoom = null;
    location.hash = '#/';
  }));

  offs.push(net.on('room:error', (m) => {
    if (room) return;
    toast(m.message || 'Не удалось войти', 'err');
    hasLeftRoom = true;
    if (store.lastRoom === code) store.lastRoom = null;
    setTimeout(() => { location.hash = '#/'; }, 900);
  }));

  // слепок просим только когда связь реально восстановилась
  offs.push(net.on('status', ({ status }) => {
    const online = status === 'online';
    if (online && !wasOnline && room) requestResync(true);
    wasOnline = online;
  }));

  // вкладку сворачивали: браузер тормозит таймеры, состояние могло устареть
  const onVisible = () => {
    if (document.visibilityState === 'visible' && room) requestResync();
  };
  document.addEventListener('visibilitychange', onVisible);

  const timer = setInterval(tickClock, 250);
  // страховка: если подтверждение хода не пришло, разблокируем доску
  const stuckTimer = setInterval(() => {
    if (pendingPly >= 0 && Date.now() - pendingAt > 4000) {
      pendingPly = -1;
      requestResync(true);
      paint();
    }
  }, 1000);
  const onSettings = () => paint();
  window.addEventListener('coridor:settings', onSettings);

  /* ---------- вспомогательное ---------- */

  /** Почему сейчас нельзя ходить: клик по доске не должен проваливаться молча. */
  function explainBlock() {
    if (!room) return;
    if (room.status === 'lobby') return toast('Партия ещё не началась', 'err', 1600);
    if (room.status === 'finished') return toast('Партия уже закончилась', 'err', 1600);
    if (mySeat() === null) return toast('Вы наблюдаете за партией', 'err', 1600);
    if (pendingPly >= 0) return toast('Ход отправляется', '', 1200);
    if (game && game.turn !== mySeat()) {
      sfx.deny();
      return toast(`Сейчас ходит ${nameOfSeat(game.turn)}`, 'err', 1600);
    }
  }

  /**
   * Ход применяется сразу локально и только потом уходит на сервер.
   * Так фишка двигается мгновенно, а не через круг по сети.
   * Если сервер не согласится, он пришлёт game:reject с настоящим состоянием.
   */
  function sendMove(mv) {
    if (!room || !game) return;
    if (room.status !== 'playing') {
      toast('Партия ещё не началась', 'err', 1600);
      return sfx.deny();
    }
    if (mySeat() === null) {
      toast('Вы наблюдаете за партией', 'err', 1600);
      return sfx.deny();
    }
    if (game.winner !== null) {
      toast('Партия уже закончилась', 'err', 1600);
      return sfx.deny();
    }
    if (game.turn !== mySeat()) {
      toast('Сейчас ходит соперник', 'err', 1600);
      return sfx.deny();
    }
    if (pendingPly >= 0) return;      // предыдущий ход ещё не подтверждён

    const next = cloneGame(game);
    const res = applyMove(next, mySeat(), mv);
    if (!res.ok) { toast(res.message, 'err', 1800); return sfx.deny(); }

    pendingPly = next.ply;
    pendingAt = Date.now();
    game = next;
    render(false);
    paint();
    net.send({ type: 'game:move', move: mv });
  }

  /** Перерисовать доску по текущему состоянию. */
  function render(silent) {
    if (!game) return;
    board.update(game, {
      me: mySeat() ?? 0,
      interactive: isMyTurn(),
      lastMove: game.history[game.history.length - 1] || null,
      skins: skinList(),
      silent,
    });
  }

  function me() { return room?.members.find((x) => x.id === store.clientId) || null; }
  function mySeat() { const m = me(); return m ? m.seat : null; }
  function isHost() { return room?.hostId === store.clientId; }
  function isMyTurn() {
    if (pendingPly >= 0) return false;
    return room?.status === 'playing' && game && game.winner === null && game.turn === mySeat();
  }

  function skinList() {
    if (!room) return [];
    return room.seats.map((id) => {
      const m = id ? room.members.find((x) => x.id === id) : null;
      return m?.look || {};
    });
  }

  function applyState(raw, silent) {
    if (!raw) { game = null; return; }
    const next = deserialize(raw);
    // свой уже показанный ход не анимируем второй раз
    const confirmsPending = pendingPly >= 0 && next.ply >= pendingPly;
    if (confirmsPending) pendingPly = -1;
    game = next;
    render(silent || firstPaint || confirmsPending);
    firstPaint = false;
  }

  function tickClock() {
    if (!room || room.status !== 'playing' || !game || !deadline) { updateClocks(null); return; }
    const left = deadline - net.serverNow();
    updateClocks(Math.max(0, left));
    if (left < 10000 && left > 0 && game.turn === mySeat()) {
      const sec = Math.ceil(left / 1000);
      if (sec !== lowBeep) { lowBeep = sec; sfx.tick(); }
    }
  }

  function updateClocks(left) {
    if (!room || !game) return;
    cards.forEach((card, i) => {
      const turn = game.winner === null && game.turn === i;
      card.clock.textContent = (left !== null && turn) ? `${Math.ceil(left / 1000)}с` : '';
      card.clock.classList.toggle('is-low', !!(left !== null && turn && left < 10000));
    });

    if (left === null || room.status !== 'playing') {
      clockPill.style.display = 'none';
      return;
    }
    const sec = Math.ceil(left / 1000);
    const mine = game.turn === mySeat();
    clockPill.style.display = '';
    clockPill.className = 'clock-pill' + (left < 10000 ? ' is-low' : '');
    clockPill.textContent = mine
      ? `Ваш ход: ${sec} с`
      : `Ход соперника: ${sec} с`;
  }

  /* ---------- отрисовка ---------- */

  function paint() {
    if (!room) return;
    const mode = getMode(room.settings.mode);

    roomTitle.textContent = room.name;
    modeBadge.textContent = mode.label;

    clear(headActions);
    if (isHost() && room.status !== 'playing') headActions.append(startBtn);
    const tools = h('div', { class: 'iconbar' }, linkBtn);
    if (isHost() && room.status !== 'playing') tools.append(manageBtn);
    tools.append(exitBtn);
    headActions.append(tools);
    startBtn.disabled = room.seats.some((s) => !s);

    paintSeats(mode);
    paintControls();
    paintSpectators();

    if (game) {
      board.update(game, {
        me: mySeat() ?? 0,
        interactive: isMyTurn(),
        lastMove: game.history[game.history.length - 1] || null,
        skins: skinList(),
        silent: true,
      });
    }

    if (room.status === 'lobby') {
      const free = room.seats.filter((s) => !s).length;
      pill.set(free ? `Ждём игроков: ${free}` : 'Все в сборе', '');
      if (!overlayShown) showLobbyOverlay();
    } else if (room.status === 'playing') {
      board.hideOverlay();
      overlayShown = false;
      if (isMyTurn()) {
        const left = game?.movesLeft ?? 1;
        pill.set(left > 1 ? `Ваш ход, осталось действий: ${left}` : 'Ваш ход', 'me');
      } else if (mySeat() === null) pill.set('Вы наблюдаете', '');
      else pill.set('Ход соперника', '');
    }
  }

  function paintSeats(mode) {
    clear(seatBox);
    const teams = isTeamMode(room.settings.mode);
    while (cards.length < room.seats.length) cards.push(new PlayerCard());
    cards.length = room.seats.length;

    room.seats.forEach((id, i) => {
      const m = id ? room.members.find((x) => x.id === id) : null;
      const card = cards[i];
      const p = game?.players[i];
      const dist = game && p ? distanceToGoal(game, i) : null;
      const skin = board.skins[i];

      card.update({
        name: m ? m.name : null,
        skin,
        isMe: m?.id === store.clientId,
        isHost: m?.id === room.hostId,
        connected: m ? m.connected : undefined,
        out: p ? !p.active : false,
        teamLabel: teams && mode.teamNames[mode.teams[i]] ? mode.teamNames[mode.teams[i]] : null,
        isTurn: room.status === 'playing' && game?.winner === null && game?.turn === i,
        walls: p ? p.walls : room.settings.wallsPerPlayer,
        wallsMax: p ? Math.max(p.walls, room.settings.wallsPerPlayer) : room.settings.wallsPerPlayer,
        sub: room.status === 'lobby'
          ? (m ? 'в комнате' : 'ждём игрока')
          : (dist === null || dist === Infinity ? '' : `до цели ${dist} ${plural(dist, 'шаг', 'шага', 'шагов')}`),
        clockMs: null,
      });

      const wrap = h('div', { class: 'stack stack--sm' }, card.el);
      if (isHost() && m && m.id !== store.clientId && room.status === 'lobby') {
        wrap.append(h('button', {
          class: 'btn btn--sm btn--outline',
          onClick: () => net.send({ type: 'room:kick', playerId: m.id }),
        }, icon('x', 14), `Убрать ${m.name}`));
      }
      if (room.status === 'finished' && room.rematch?.includes(id)) {
        wrap.append(h('span', { class: 'badge badge--ok' }, 'хочет реванш'));
      }
      seatBox.append(wrap);
    });

    if (room.score?.some((n) => n)) {
      seatBox.append(h('div', { class: 'hstack', style: { justifyContent: 'center' } },
        h('span', { class: 'dim-2' }, 'счёт матча'),
        h('span', { class: 'mono', style: { fontWeight: '800' } }, room.score.join(' : '))));
    }
  }

  function paintControls() {
    clear(controlBox);
    if (room.status === 'playing' && mySeat() !== null) {
      controlBox.append(h('button', {
        class: 'btn btn--sm btn--danger',
        onClick: async () => {
          if (await confirmDialog('Сдаться?', 'Партия будет засчитана сопернику', 'Сдаюсь')) {
            net.send({ type: 'game:resign' });
          }
        },
      }, icon('flag', 14), 'Сдаться'));
    }
    if (room.status === 'finished' && mySeat() !== null) {
      const asked = room.rematch?.includes(store.clientId);
      controlBox.append(h('button', {
        class: `btn btn--sm ${asked ? 'btn--ghost' : 'btn--primary'}`,
        disabled: asked,
        onClick: () => net.send({ type: 'game:rematch' }),
      }, icon('rotate', 14), asked ? 'Ждём соперника' : 'Реванш'));
    }
  }

  function paintSpectators() {
    const list = room.members.filter((m) => m.seat === null);
    spectatorPanel.style.display = list.length ? '' : 'none';
    clear(spectatorBox);
    for (const m of list) {
      spectatorBox.append(h('div', { class: 'hstack' },
        icon('eye', 14),
        h('span', {}, m.name),
        m.id === store.clientId ? h('span', { class: 'badge' }, 'вы') : null));
    }
  }

  async function openManage() {
    const cfg = await createDialog({
      name: room.name,
      mode: room.settings.mode,
      wallsPerPlayer: room.settings.wallsPerPlayer,
      turnTimeSec: room.settings.turnTimeSec,
      isPrivate: room.isPrivate,
      password: '',
    });
    if (!cfg) return;
    net.send({ type: 'room:settings', ...cfg });
  }

  function showLobbyOverlay() {
    overlayShown = true;
    const free = room.seats.filter((s) => !s).length;
    board.showOverlay(h('div', {},
      h('div', { class: 'overlay__title' }, free ? 'Ждём' : 'Готовы'),
      h('div', { class: 'overlay__sub' },
        free
          ? `Отправьте ссылку игрокам. Свободных мест: ${free}`
          : 'Все места заняты. Хост может начинать партию.'),
      h('div', { class: 'overlay__actions' },
        h('button', {
          class: 'btn btn--primary',
          onClick: async () => {
            if (await copyText(`${location.origin}/#/room/${code}`)) toast('Ссылка скопирована', 'ok');
          },
        }, icon('share'), 'Скопировать ссылку'))));
  }

  function showResult(m) {
    const seat = mySeat();
    const spectator = seat === null;
    const iWon = !spectator && Array.isArray(m.winners) && m.winners.includes(seat);

    let gain = 0;
    if (!spectator) {
      const rivals = Math.max(1, (room.seats.length || 2) - 1);
      gain = store.earn(onlineReward(iWon, rivals));
      store.recordOnline(iWon);
      if (iWon) { sfx.win(); board.celebrate(seat); } else sfx.lose();
    } else sfx.notify();

    const reason = {
      goal: 'фишка дошла до противоположного края',
      resign: 'соперник сдался',
      timeout: 'закончилось время',
      disconnect: 'соперник не вернулся в игру',
      alone: 'остальные вышли из партии',
    }[m.reason] || m.reason;

    overlayShown = true;
    board.showOverlay(h('div', {},
      h('div', { class: `overlay__title ${iWon ? 'is-win' : spectator ? '' : 'is-lose'}` },
        spectator ? 'Финал' : iWon ? 'Победа' : 'Поражение'),
      h('div', { class: 'overlay__sub' },
        `${(m.winnerNames || []).join(' и ') || m.teamName || 'Никто'}: ${reason}`),
      gain ? coinReward(gain) : null,
      h('div', { class: 'overlay__actions' },
        seat !== null
          ? h('button', {
              class: 'btn btn--primary',
              onClick: (e) => { e.target.disabled = true; net.send({ type: 'game:rematch' }); },
            }, icon('rotate'), 'Реванш')
          : null,
        h('a', { class: 'btn btn--ghost', href: '#/', onClick: () => leaveRoom() },
          icon('door'), 'Выйти'))));
    pill.set(spectator ? 'Партия окончена' : iWon ? 'Вы победили' : 'Вы проиграли', iWon ? 'me' : '');
  }

  function leaveRoom() {
    hasLeftRoom = true;
    store.lastRoom = null;
    net.send({ type: 'room:leave' });
  }

  return {
    destroy() {
      for (const off of offs) off();
      clearInterval(timer);
      clearInterval(stuckTimer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('coridor:settings', onSettings);
      board.destroy();
      if (hasLeftRoom) return;
      const playingSeated = room?.status === 'playing' && mySeat() !== null;
      if (!playingSeated) {
        store.lastRoom = null;
        net.send({ type: 'room:leave' });
      }
    },
  };
}
