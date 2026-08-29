/* Главный экран: быстрый вход и список открытых комнат. */

import { MODE_LIST, getMode, seatCount } from '/shared/quoridor.js';
import { h, clear, icon, toast, modal, plural, timeAgo } from '../ui.js';
import { store } from '../store.js';
import { sfx } from '../sound.js';
import * as net from '../net.js';

const TURN_TIMES = [
  [0, 'Без таймера'], [5, '5 секунд'], [10, '10 секунд'], [15, '15 секунд'],
  [30, '30 секунд'], [60, '60 секунд'], [120, '2 минуты'],
];

export function renderHome(mount, startTab) {
  const offs = [];
  let rooms = [];
  let pendingJoin = false;
  let tab = startTab === 'rooms' ? 'rooms' : 'quick';

  /* ---------- переключатель разделов ---------- */

  const subnav = h('div', { class: 'seg' });
  const roomsBadge = h('span', { class: 'badge badge--red-soft', style: { marginLeft: '2px' } }, '0');

  function paintSubnav() {
    clear(subnav);
    subnav.append(
      h('button', {
        class: `seg__btn ${tab === 'quick' ? 'is-active' : ''}`,
        onClick: () => setTab('quick'),
      }, icon('zap', 14), 'Быстрый вход'),
      h('button', {
        class: `seg__btn ${tab === 'rooms' ? 'is-active' : ''}`,
        onClick: () => setTab('rooms'),
      }, icon('users', 14), 'Открытые комнаты', roomsBadge));
  }

  function setTab(next) {
    if (tab === next) return;
    tab = next;
    paintSubnav();
    quickPane.style.display = tab === 'quick' ? '' : 'none';
    roomsPane.style.display = tab === 'rooms' ? '' : 'none';
    if (tab === 'rooms') net.send({ type: 'lobby:subscribe', on: true });
  }

  /* ---------- левая плашка ---------- */

  const hero = h('div', { class: 'card card--hero panel' },
    h('div', { class: 'badge badge--red', style: { alignSelf: 'flex-start' } }, 'Made By Berly'),
    h('h1', { class: 'h1', style: { marginTop: '16px' } }, 'КОРИДОР'),
    h('p', { class: 'lead', style: { marginTop: '14px' } },
      'Настольная стратегия Quoridor для двух, трёх и четырёх игроков.'),
    h('p', { class: 'dim', style: { marginTop: '6px', fontSize: '14px' } },
      'Доведите фишку до другого края доски, пока соперник строит стены у вас на пути.'),
    h('div', { class: 'grid-2', style: { marginTop: 'auto', paddingTop: '22px' } },
      tile('Доска 9 на 9', 'Классические правила Quoridor'),
      tile('Пять режимов', 'От дуэли до боя двое против одного'),
      tile('Прыжки', 'Через фишку соперника и по диагонали'),
      tile('Никаких тупиков', 'Полностью замуровать соперника нельзя')));

  /* ---------- правая плашка ---------- */

  const resumeBox = h('div', {});

  const actions = h('div', { class: 'card card--pad panel' },
    resumeBox,
    h('button', { class: 'btn btn--primary btn--lg btn--block', onClick: quickCreate },
      icon('plus', 20), 'Создать игру'),
    h('button', { class: 'btn btn--ghost btn--block', onClick: () => setTab('rooms') },
      icon('users'), 'Открытые комнаты'),
    h('a', { class: 'btn btn--outline btn--block', href: '#/bot' }, icon('bot'), 'Играть с ботом'),
    h('div', { class: 'divider', style: { marginTop: 'auto' } }),
    h('div', { class: 'eyebrow' }, 'Функционал'),
    h('ul', { class: 'stack stack--sm dim-2' },
      li('создайте комнату и поделитесь ссылкой с игроками'),
      li('выберите режим и настройки в окне управления'),
      li('приватные комнаты защищаются паролем'),
      li('в лобби доступен общий чат и управление партией')));

  const quickPane = h('div', { class: 'home-grid' }, hero, actions);

  /* ---------- список комнат ---------- */

  const listBox = h('div', { class: 'stack' });
  const roomsPane = h('div', { class: 'wrap wrap--narrow' },
    h('div', { class: 'hstack hstack--wrap', style: { marginBottom: '14px' } },
      h('div', { class: 'row__main' },
        h('div', { class: 'h3' }, 'Кто сейчас играет'),
        h('div', { class: 'dim-2' }, 'Свободные комнаты можно занять, идущие партии посмотреть')),
      h('button', {
        class: 'btn btn--sm btn--outline',
        onClick: () => { net.send({ type: 'lobby:subscribe', on: true }); toast('Обновляю'); },
      }, icon('refresh', 14), 'Обновить'),
      h('button', { class: 'btn btn--sm btn--primary', onClick: openCreate },
        icon('plus', 14), 'Создать')),
    listBox);
  roomsPane.style.display = 'none';

  mount.append(h('div', { class: 'subnav' }, subnav), quickPane, roomsPane);

  paintSubnav();
  if (tab === 'rooms') { quickPane.style.display = 'none'; roomsPane.style.display = ''; }

  const onResume = () => paintResume();
  window.addEventListener('coridor:resume', onResume);

  /* ---------- сеть ---------- */

  net.send({ type: 'lobby:subscribe', on: true });

  offs.push(net.on('lobby:rooms', (m) => { rooms = m.rooms || []; paintRooms(); }));
  offs.push(net.on('room:error', () => { pendingJoin = false; }));
  offs.push(net.on('room:state', (m) => {
    if (!pendingJoin || !m.room?.code) return;
    pendingJoin = false;
    store.lastRoom = m.room.code;
    location.hash = `#/room/${m.room.code}`;
  }));

  paintRooms();
  paintResume();

  /* ---------- функции ---------- */

  function paintResume() {
    clear(resumeBox);
    const code = store.lastRoom;
    if (!code) return;
    resumeBox.append(h('a', {
      class: 'btn btn--ghost btn--block',
      href: `#/room/${code}`,
      style: { borderColor: 'rgba(220,38,38,.45)', color: '#fca5a5', marginBottom: '4px' },
    }, icon('rotate'), `Продолжить партию ${code}`));
  }

  function tryJoin(code, password) {
    pendingJoin = true;
    net.send({ type: 'room:join', code, password: password || '' });
  }

  /** С главной создаём сразу: настройки меняются в лобби кнопкой «Управление». */
  function quickCreate() {
    sfx.notify();
    pendingJoin = true;
    net.send({
      type: 'room:create',
      name: `Партия ${store.name}`,
      mode: 'duel',
      turnTimeSec: 60,
    });
  }

  function paintRooms() {
    roomsBadge.textContent = String(rooms.length);
    roomsBadge.style.display = rooms.length ? '' : 'none';
    clear(listBox);
    if (!rooms.length) {
      listBox.append(h('div', { class: 'empty' },
        'Пока нет открытых комнат. Создайте свою, ссылка появится сразу.'));
      return;
    }
    for (const r of rooms) listBox.append(roomRow(r));
  }

  function roomRow(r) {
    const cap = r.capacity || 2;
    const full = r.players >= cap;
    const playing = r.status === 'playing';
    const mode = getMode(r.mode);
    return h('div', { class: 'row row--click' },
      h('div', {
        class: 'avatar',
        style: playing ? { background: 'linear-gradient(140deg,#3f3f46,#18181b)' } : null,
      }, icon(playing ? 'eye' : 'gamepad')),
      h('div', { class: 'row__main' },
        h('div', { class: 'row__title' },
          r.name,
          h('span', { class: 'badge', style: { marginLeft: '8px' } }, mode.short),
          r.isPrivate ? h('span', { class: 'badge', style: { marginLeft: '6px' } }, icon('lock', 11), 'приват') : null),
        h('div', { class: 'row__sub' },
          `${r.host}, ${r.wallsPerPlayer} ${plural(r.wallsPerPlayer, 'стена', 'стены', 'стен')}`
          + (r.turnTimeSec ? `, ${r.turnTimeSec} c на ход` : ', без таймера')
          + `, ${timeAgo(r.createdAt)}`)),
      h('div', { class: 'hstack' },
        h('span', { class: `badge ${playing ? 'badge--warn' : full ? '' : 'badge--ok'}` },
          playing ? 'идёт партия' : `${r.players}/${cap}`),
        h('button', {
          class: playing || full ? 'btn btn--sm btn--outline' : 'btn btn--sm btn--primary',
          onClick: () => askJoin(r),
        }, playing || full ? 'Смотреть' : 'Войти')));
  }

  async function askJoin(r) {
    if (!r.isPrivate) return tryJoin(r.code);
    const input = h('input', { class: 'input', type: 'password', placeholder: 'Пароль комнаты' });
    const ok = await modal({
      title: 'Приватная комната',
      sub: r.name,
      body: h('div', { class: 'field' }, input),
      actions: [
        { label: 'Отмена', class: 'btn--ghost', value: false },
        { label: 'Войти', class: 'btn--primary', value: true },
      ],
    });
    if (ok === true) tryJoin(r.code, input.value);
  }

  /** Из списка комнат создаём через окно с настройками. */
  async function openCreate() {
    const cfg = await createDialog();
    if (!cfg) return;
    sfx.notify();
    pendingJoin = true;
    net.send({ type: 'room:create', ...cfg });
  }

  return {
    destroy() {
      for (const off of offs) off();
      net.send({ type: 'lobby:subscribe', on: false });
      window.removeEventListener('coridor:resume', onResume);
    },
  };
}

/* ------------------------------------------------------------------ *
 * Окно создания и настроек партии
 * ------------------------------------------------------------------ */

/**
 * @param {object} preset текущие настройки, если окно открыто из лобби
 * @returns {Promise<object|null>}
 */
export async function createDialog(preset = null) {
  const state = {
    name: preset?.name ?? `Партия ${store.name}`,
    mode: preset?.mode ?? 'duel',
    wallsPerPlayer: preset?.wallsPerPlayer ?? getMode(preset?.mode ?? 'duel').walls[0],
    turnTimeSec: preset?.turnTimeSec ?? 60,
    isPrivate: preset?.isPrivate ?? false,
    password: preset?.password ?? '',
  };

  const nameInput = h('input', { class: 'input', maxlength: 28, value: state.name, placeholder: 'Название' });
  const modeBox = h('div', { class: 'mode-grid' });
  const wallsSeg = h('div', { class: 'seg seg--block seg--wrap' });
  const timeSeg = h('div', { class: 'seg seg--block seg--wrap' });
  const privSw = h('input', { type: 'checkbox', checked: state.isPrivate });
  const passInput = h('input', {
    class: 'input', placeholder: 'Пароль', value: state.password, disabled: !state.isPrivate,
  });
  privSw.addEventListener('change', () => { passInput.disabled = !privSw.checked; });

  function paintModes() {
    clear(modeBox);
    for (const m of MODE_LIST) {
      const active = m.id === state.mode;
      modeBox.append(h('button', {
        class: `mode-card ${active ? 'is-active' : ''}`,
        onClick: () => {
          state.mode = m.id;
          state.wallsPerPlayer = m.walls[0];
          paintModes();
          paintWalls();
        },
      },
        h('div', { class: 'hstack' },
          h('div', { class: 'mode-card__title' }, m.label),
          h('div', { class: 'spacer' }),
          h('span', { class: 'badge' }, `${seatCount(m.id)} игрока`.replace('4 игрока', '4 игроков'))),
        h('div', { class: 'mode-card__hint' }, m.hint)));
    }
  }

  function paintWalls() {
    clear(wallsSeg);
    const base = getMode(state.mode).walls[0];
    const opts = [...new Set([Math.max(3, base - 4), Math.max(3, base - 2), base, base + 2, base + 4])];
    for (const n of opts) {
      wallsSeg.append(h('button', {
        class: `seg__btn ${state.wallsPerPlayer === n ? 'is-active' : ''}`,
        onClick: () => { state.wallsPerPlayer = n; paintWalls(); },
      }, String(n)));
    }
  }

  function paintTime() {
    clear(timeSeg);
    for (const [v, label] of TURN_TIMES) {
      timeSeg.append(h('button', {
        class: `seg__btn ${state.turnTimeSec === v ? 'is-active' : ''}`,
        onClick: () => { state.turnTimeSec = v; paintTime(); },
      }, v === 0 ? '∞' : (v >= 60 ? `${v / 60} мин` : `${v} с`), h('span', { class: 'sr' }, label)));
    }
  }

  paintModes(); paintWalls(); paintTime();

  const res = await modal({
    title: preset ? 'Управление партией' : 'Новая комната',
    sub: preset ? 'Настройки применяются сразу' : 'Ссылку на комнату можно скопировать в лобби',
    wide: true,
    body: h('div', { class: 'stack stack--lg' },
      h('div', { class: 'field' }, h('label', { class: 'field__label' }, 'Название'), nameInput),
      h('div', { class: 'field' }, h('label', { class: 'field__label' }, 'Режим'), modeBox),
      h('div', { class: 'grid-2' },
        h('div', { class: 'field' }, h('label', { class: 'field__label' }, 'Стен у каждого'), wallsSeg),
        h('div', { class: 'field' }, h('label', { class: 'field__label' }, 'Время на ход'), timeSeg)),
      h('div', { class: 'stack stack--sm' },
        h('label', { class: 'switch' }, privSw, h('span', { class: 'switch__track' }),
          h('span', { class: 'switch__label' }, 'Приватная комната')),
        passInput)),
    actions: [
      { label: 'Отмена', class: 'btn--ghost', value: false },
      { label: preset ? 'Применить' : 'Создать', class: 'btn--primary', value: true },
    ],
  });
  if (res !== true) return null;

  return {
    name: nameInput.value.trim(),
    mode: state.mode,
    wallsPerPlayer: state.wallsPerPlayer,
    turnTimeSec: state.turnTimeSec,
    isPrivate: privSw.checked,
    password: privSw.checked ? passInput.value : '',
  };
}

function tile(k, v) {
  return h('div', { class: 'tile' },
    h('div', { class: 'tile__k' }, k),
    h('div', { class: 'tile__v' }, v));
}

function li(text) {
  return h('li', { style: { display: 'flex', gap: '8px' } },
    h('span', { style: { color: 'var(--red)' } }, '•'), h('span', {}, text));
}
