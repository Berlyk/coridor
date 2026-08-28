/* Онлайн-комната: лобби, партия 1 на 1, чат. */

import { deserialize, distanceToGoal } from '/shared/quoridor.js';
import { h, clear, icon, toast, copyText, confirmDialog, plural } from '../ui.js';
import { store } from '../store.js';
import { sfx } from '../sound.js';
import * as net from '../net.js';
import { Board } from '../board.js';
import { PlayerCard, Chat, panel, turnPill, gameLayout } from './game-ui.js';

export function renderRoom(mount, code) {
  const offs = [];
  let room = null;
  let game = null;
  let firstPaint = true;
  let deadline = 0;
  let lowBeep = 0;
  let overlayShown = false;
  let hasLeftRoom = false;

  const board = new Board({
    onMove: (mv) => {
      if (!isMyTurn()) return;
      net.send({ type: 'game:move', move: mv });
      // локально ничего не применяем — ждём подтверждения сервера
    },
    onIllegal: (msg) => toast(msg, 'err', 1800),
    onOrient: () => paintRotate(),
  });

  const pill = turnPill();
  const cards = [new PlayerCard(0), new PlayerCard(1)];
  const chat = new Chat((text) => net.send({ type: 'chat:send', text }));

  /* ---------- шапка ---------- */

  const roomTitle = h('div', { class: 'h3' }, 'Подключение…');
  const codeChip = h('button', {
    class: 'btn btn--sm btn--ghost mono',
    title: 'Скопировать код',
    onClick: async () => {
      if (await copyText(code)) toast('Код скопирован', 'ok');
    },
  }, icon('copy', 14), code);
  const linkBtn = h('button', {
    class: 'btn btn--sm btn--ghost',
    title: 'Скопировать ссылку-приглашение',
    onClick: async () => {
      const url = `${location.origin}/#/room/${code}`;
      if (await copyText(url)) toast('Ссылка скопирована', 'ok');
    },
  }, icon('share', 14), 'Ссылка');
  const statusChip = h('span', { class: 'badge' }, '—');

  const head = h('div', { class: 'hstack hstack--wrap', style: { marginBottom: '18px' } },
    h('a', { class: 'btn btn--sm btn--outline', href: '#/', onClick: () => leaveRoom() },
      icon('back', 14), 'В лобби'),
    h('div', { class: 'row__main' }, roomTitle),
    statusChip, codeChip, linkBtn);

  /* ---------- боковая панель ---------- */

  const seatBox = h('div', { class: 'stack stack--sm' });
  const controlBox = h('div', { class: 'hstack hstack--wrap' });
  const settingsBox = h('div', { class: 'stack stack--sm' });
  const spectatorBox = h('div', { class: 'stack stack--sm' });

  const btnRotate = h('button', {
    class: 'btn btn--sm btn--ghost',
    title: 'Повернуть стену (R)',
    onClick: () => board.toggleOrientation(),
  });

  const boardBar = h('div', { class: 'board-bar' },
    pill.el, btnRotate, h('div', { class: 'spacer' }), controlBox);
  const stage = h('div', { class: 'board-stage' });
  board.mount(stage);
  stage.append(boardBar);

  const settingsPanel = panel('Настройки партии', settingsBox);
  const spectatorPanel = panel('Наблюдатели', spectatorBox);

  const side = [
    seatBox,
    settingsPanel,
    panel('Чат', chat.el),
    spectatorPanel,
  ];

  mount.append(head, gameLayout(stage, side));

  /* ---------- сеть ---------- */

  net.send({ type: 'room:join', code });

  offs.push(net.on('room:state', (m) => {
    if (!m.room || m.room.code !== code) return;
    room = m.room;
    store.lastRoom = room.status === 'finished' ? null : code;
    applyState(m.state, m.started === true);
    chat.update(room.chat);
    for (const c of room.chat) chat.seen.add(c.id);
    deadline = room.turnDeadline || 0;
    paint();
  }));

  offs.push(net.on('game:move', (m) => {
    if (!room) return;
    applyState(m.state, false);
    if (m.auto) toast('Ход сделан автоматически: время вышло');
    deadline = 0;
    paint();
  }));

  offs.push(net.on('game:clock', (m) => {
    deadline = m.turnDeadline || 0;
    lowBeep = 0;
  }));

  offs.push(net.on('game:over', (m) => {
    if (!room) return;
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
    if (m.state) applyState(m.state, true);
    paint();
  }));

  offs.push(net.on('chat:msg', (m) => {
    if (chat.push(m.message) && !m.message.sys) sfx.chat();
  }));

  offs.push(net.on('room:notice', (m) => {
    const map = {
      disconnect: `${m.name} потерял связь — ждём ${Math.round((m.graceMs || 45000) / 1000)} с`,
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
    if (!room) {
      toast(m.message || 'Не удалось войти', 'err');
      hasLeftRoom = true;
      if (store.lastRoom === code) store.lastRoom = null;
      setTimeout(() => { location.hash = '#/'; }, 900);
    }
  }));

  const timer = setInterval(tickClock, 250);
  const onSettings = () => paint();
  window.addEventListener('coridor:settings', onSettings);

  /* ---------- вспомогательное ---------- */

  function me() { return room?.members.find((x) => x.id === store.clientId) || null; }
  function mySeat() { const m = me(); return m ? m.seat : null; }
  function isHost() { return room?.hostId === store.clientId; }
  function isMyTurn() {
    return room?.status === 'playing' && game && game.winner === null && game.turn === mySeat();
  }

  function applyState(raw, silent) {
    if (!raw) { game = null; return; }
    game = deserialize(raw);
    board.update(game, {
      mySeat: mySeat() ?? 0,
      flip: mySeat() === 1,
      interactive: isMyTurn(),
      lastMove: game.history[game.history.length - 1] || null,
      silent: silent || firstPaint,
    });
    firstPaint = false;
  }

  function tickClock() {
    if (!room || room.status !== 'playing' || !game || !deadline) {
      updateClocks(null);
      return;
    }
    const left = deadline - net.serverNow();
    updateClocks(Math.max(0, left));
    if (left < 10000 && left > 0 && game.turn === mySeat()) {
      const sec = Math.ceil(left / 1000);
      if (sec !== lowBeep) { lowBeep = sec; sfx.tick(); }
    }
  }

  function updateClocks(left) {
    if (!room || !game) return;
    for (const seat of [0, 1]) {
      const turn = game.winner === null && game.turn === seat;
      cards[seat].clock.textContent = (left !== null && turn)
        ? `${Math.ceil(left / 1000)}с` : '';
      cards[seat].clock.classList.toggle('is-low', !!(left !== null && turn && left < 10000));
    }
  }

  /* ---------- отрисовка ---------- */

  function paint() {
    if (!room) return;

    roomTitle.textContent = room.name;
    statusChip.className = 'badge ' + (
      room.status === 'playing' ? 'badge--warn' : room.status === 'finished' ? '' : 'badge--ok');
    statusChip.textContent = room.status === 'playing' ? 'идёт партия'
      : room.status === 'finished' ? 'партия окончена' : 'ожидание';

    paintSeats();
    paintControls();
    paintSettings();
    paintSpectators();
    paintRotate();

    if (game) {
      board.update(game, {
        mySeat: mySeat() ?? 0,
        flip: mySeat() === 1,
        interactive: isMyTurn(),
        lastMove: game.history[game.history.length - 1] || null,
        silent: true,
      });
    }

    if (room.status === 'lobby') {
      pill.set(room.seats.filter(Boolean).length < 2 ? 'Ждём соперника' : 'Готовность', '');
      if (!overlayShown) showLobbyOverlay();
    } else if (room.status === 'playing') {
      board.hideOverlay();
      overlayShown = false;
      if (isMyTurn()) pill.set('Ваш ход', 'me');
      else if (mySeat() === null) pill.set('Вы наблюдаете', '');
      else pill.set('Ход соперника', '');
    }
  }

  function paintRotate() {
    clear(btnRotate);
    const horizontal = board.orientation === 1;
    btnRotate.append(
      h('span', { class: `wall-icon ${horizontal ? 'is-h' : 'is-v'}` }),
      h('span', {}, horizontal ? 'Стена: горизонтально' : 'Стена: вертикально'),
      h('span', { class: 'kbd' }, 'R'));
  }

  function paintSeats() {
    clear(seatBox);
    for (const seat of [0, 1]) {
      const id = room.seats[seat];
      const m = id ? room.members.find((x) => x.id === id) : null;
      const card = cards[seat];
      const dist = game ? distanceToGoal(game, seat) : null;
      card.update({
        name: m ? m.name : 'Свободное место',
        isMe: m?.id === store.clientId,
        isHost: m?.id === room.hostId,
        connected: m ? m.connected : undefined,
        isTurn: room.status === 'playing' && game?.winner === null && game?.turn === seat,
        walls: game ? game.players[seat].walls : room.settings.wallsPerPlayer,
        wallsMax: room.settings.wallsPerPlayer,
        sub: room.status === 'lobby'
          ? (m ? (m.ready ? 'готов' : 'не готов') : 'нажмите, чтобы занять')
          : (dist === null || dist === Infinity ? '' : `до цели ${dist} ${plural(dist, 'шаг', 'шага', 'шагов')}`),
        clockMs: null,
      });

      const wrap = h('div', { class: 'stack stack--sm' }, card.el);

      if (room.status === 'lobby') {
        const row = h('div', { class: 'hstack' });
        if (!m) {
          row.append(h('button', {
            class: 'btn btn--sm btn--primary',
            onClick: () => net.send({ type: 'room:sit', seat }),
          }, icon('login', 14), 'Занять место'));
        } else if (m.id === store.clientId) {
          row.append(h('button', {
            class: `btn btn--sm ${m.ready ? 'btn--ghost' : 'btn--primary'}`,
            onClick: () => net.send({ type: 'room:ready', ready: !m.ready }),
          }, icon(m.ready ? 'x' : 'check', 14), m.ready ? 'Не готов' : 'Готов'));
          row.append(h('button', {
            class: 'btn btn--sm btn--outline',
            onClick: () => net.send({ type: 'room:sit', seat: null }),
          }, 'Встать'));
        } else if (isHost()) {
          row.append(h('span', { class: `badge ${m.ready ? 'badge--ok' : ''}` }, m.ready ? 'готов' : 'ждём'));
          row.append(h('div', { class: 'spacer' }));
          row.append(h('button', {
            class: 'btn btn--sm btn--danger',
            onClick: () => net.send({ type: 'room:kick', playerId: m.id }),
          }, icon('x', 14), 'Убрать'));
        } else {
          row.append(h('span', { class: `badge ${m.ready ? 'badge--ok' : ''}` }, m.ready ? 'готов' : 'ждём'));
        }
        if (row.children.length) wrap.append(row);
      }

      if (room.status === 'finished' && room.rematch?.includes(id)) {
        wrap.append(h('span', { class: 'badge badge--ok' }, 'хочет реванш'));
      }
      seatBox.append(wrap);
    }

    if (room.score && (room.score[0] || room.score[1])) {
      seatBox.append(h('div', { class: 'hstack', style: { justifyContent: 'center' } },
        h('span', { class: 'dim-2' }, 'счёт матча'),
        h('span', { class: 'mono', style: { fontWeight: '800' } }, `${room.score[0]} : ${room.score[1]}`)));
    }
  }

  function paintControls() {
    clear(controlBox);
    if (room.status === 'lobby') {
      if (isHost()) {
        const ready = room.seats.every(Boolean);
        controlBox.append(h('button', {
          class: 'btn btn--sm btn--primary', disabled: !ready,
          onClick: () => net.send({ type: 'room:start' }),
        }, icon('play', 14), 'Начать партию'));
      }
      return;
    }
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

  function paintSettings() {
    settingsPanel.style.display = room.status === 'lobby' ? '' : 'none';
    if (room.status !== 'lobby') return;
    clear(settingsBox);

    if (!isHost()) {
      settingsBox.append(
        kv('Стен у каждого', String(room.settings.wallsPerPlayer)),
        kv('Время на ход', room.settings.turnTimeSec ? `${room.settings.turnTimeSec} c` : 'без таймера'),
        kv('Доступ', room.isPrivate ? 'по паролю' : 'открытая'));
      return;
    }

    const wallsSeg = h('div', { class: 'seg seg--block' });
    for (const n of [6, 8, 10, 12]) {
      wallsSeg.append(h('button', {
        class: `seg__btn ${room.settings.wallsPerPlayer === n ? 'is-active' : ''}`,
        onClick: () => net.send({ type: 'room:settings', wallsPerPlayer: n }),
      }, String(n)));
    }
    const timeSeg = h('div', { class: 'seg seg--block' });
    for (const [v, label] of [[0, '∞'], [15, '15с'], [30, '30с'], [60, '60с'], [120, '2м']]) {
      timeSeg.append(h('button', {
        class: `seg__btn ${room.settings.turnTimeSec === v ? 'is-active' : ''}`,
        onClick: () => net.send({ type: 'room:settings', turnTimeSec: v }),
      }, label));
    }
    settingsBox.append(
      h('div', { class: 'field' }, h('label', { class: 'field__label' }, 'Стен у каждого'), wallsSeg),
      h('div', { class: 'field' }, h('label', { class: 'field__label' }, 'Время на ход'), timeSeg));
  }

  function paintSpectators() {
    const list = room.members.filter((m) => m.seat === null);
    spectatorPanel.style.display = list.length ? '' : 'none';
    clear(spectatorBox);
    for (const m of list) {
      spectatorBox.append(h('div', { class: 'hstack' },
        icon('eye', 14),
        h('span', {}, m.name),
        m.id === store.clientId ? h('span', { class: 'badge' }, 'вы') : null,
        h('div', { class: 'spacer' }),
        room.status === 'lobby' && m.id === store.clientId
          ? h('button', {
              class: 'btn btn--sm btn--ghost',
              onClick: () => {
                const free = room.seats.indexOf(null);
                if (free === -1) return toast('Мест нет', 'err');
                net.send({ type: 'room:sit', seat: free });
              },
            }, 'Сесть за стол')
          : null));
    }
  }

  function showLobbyOverlay() {
    overlayShown = true;
    const seated = room.seats.filter(Boolean).length;
    board.showOverlay(h('div', {},
      h('div', { class: 'overlay__title' }, seated < 2 ? 'Ждём' : 'Почти'),
      h('div', { class: 'overlay__sub' },
        seated < 2
          ? 'Отправьте сопернику код комнаты — партия начнётся сразу после готовности'
          : 'Оба игрока за столом. Нажмите «Готов», и партия стартует.'),
      h('div', { class: 'overlay__actions' },
        h('button', {
          class: 'btn btn--primary',
          onClick: async () => {
            if (await copyText(`${location.origin}/#/room/${code}`)) toast('Ссылка скопирована', 'ok');
          },
        }, icon('share'), 'Скопировать приглашение'))));
  }

  function showResult(m) {
    const seat = mySeat();
    const iWon = seat !== null && m.winner === seat;
    const spectator = seat === null;
    if (spectator) sfx.notify();
    else if (iWon) { sfx.win(); board.celebrate(seat); store.recordOnline(true); }
    else { sfx.lose(); store.recordOnline(false); }

    const reason = {
      goal: 'фишка дошла до противоположного края',
      resign: 'соперник сдался',
      timeout: 'закончилось время',
      disconnect: 'соперник не вернулся в игру',
    }[m.reason] || m.reason;

    overlayShown = true;
    board.showOverlay(h('div', {},
      h('div', { class: `overlay__title ${iWon ? 'is-win' : spectator ? '' : 'is-lose'}` },
        spectator ? 'Финал' : iWon ? 'Победа' : 'Поражение'),
      h('div', { class: 'overlay__sub' }, `${m.winnerName} — ${reason}`),
      h('div', { class: 'overlay__actions' },
        seat !== null
          ? h('button', {
              class: 'btn btn--primary',
              onClick: (e) => { e.target.disabled = true; net.send({ type: 'game:rematch' }); },
            }, icon('rotate'), 'Реванш')
          : null,
        h('a', { class: 'btn btn--ghost', href: '#/', onClick: () => leaveRoom() },
          icon('back'), 'В лобби'))));
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
      window.removeEventListener('coridor:settings', onSettings);
      board.destroy();
      if (hasLeftRoom) return;
      // Уходим со страницы, не нажав «В лобби». Если партия идёт и мы за столом —
      // место сохраняем: игрок сможет вернуться по кнопке «Продолжить партию».
      const playingSeated = room?.status === 'playing' && mySeat() !== null;
      if (!playingSeated) {
        store.lastRoom = null;
        net.send({ type: 'room:leave' });
      }
    },
  };
}

function kv(k, v) {
  return h('div', { class: 'hstack' },
    h('span', { class: 'dim-2' }, k),
    h('div', { class: 'spacer' }),
    h('span', { style: { fontSize: '13px', fontWeight: '600' } }, v));
}
