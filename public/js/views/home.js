/* Главный экран: быстрый вход и список открытых комнат. */

import { MODE_LIST, MODES, getMode, seatCount } from '/shared/quoridor.js';
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
    h('div', { class: 'grid-2', style: { gap: '10px' } },
      h('button', { class: 'btn btn--ghost', onClick: () => setTab('rooms') },
        icon('users'), 'Комнаты'),
      h('a', { class: 'btn btn--ghost', href: '#/bot' }, icon('bot'), 'С ботом')),
    h('div', { class: 'divider' }),
    h('div', { class: 'eyebrow' }, 'Режимы'),
    h('div', { class: 'mode-strip' },
      MODE_LIST.map((m) => h('div', { class: 'mode-chip', title: MODE_TEXTS[m.id] || m.hint },
        modeGlyph(m.id, 30),
        h('div', { class: 'mode-chip__text' },
          h('b', {}, MODE_TITLES[m.id] || m.label),
          h('span', {}, seatCount(m.id) + ' ' + plural(seatCount(m.id), 'игрок', 'игрока', 'игроков')))))),
    h('div', { class: 'divider' }),
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
      turnTimeSec: 0,
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
    turnTimeSec: preset?.turnTimeSec ?? 0,
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
      const n = seatCount(m.id);
      modeBox.append(h('button', {
        class: `mode-card ${active ? 'is-active' : ''}`,
        onClick: () => {
          state.mode = m.id;
          state.wallsPerPlayer = m.walls[0];
          paintModes();
          paintWalls();
        },
      },
        h('div', { class: 'mode-card__glyph' }, modeGlyph(m.id, 52)),
        h('div', { class: 'mode-card__body' },
          h('div', { class: 'mode-card__title' }, MODE_TITLES[m.id] || m.label),
          h('div', { class: 'mode-card__hint' }, MODE_TEXTS[m.id] || m.hint)),
        h('div', { class: 'mode-card__meta' },
          h('span', { class: 'badge' }, n + ' ' + plural(n, 'игрок', 'игрока', 'игроков')),
          h('span', { class: 'badge' }, m.walls[0] + ' ' + plural(m.walls[0], 'стена', 'стены', 'стен')))));
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
      }, label));
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

/* ------------------------------------------------------------------ *
 * Названия и схемы режимов
 * ------------------------------------------------------------------ */

const MODE_TITLES = {
  duel: 'Один на один',
  trio: 'Трое, каждый за себя',
  ffa: 'Четверо, каждый за себя',
  duo: 'Команды, два на два',
  siege: 'Двое против одного',
};

const MODE_TEXTS = {
  duel: 'Классика. Вы снизу, соперник сверху, идёте навстречу.',
  trio: 'Три фишки с трёх сторон, союзов нет.',
  ffa: 'Четыре фишки со всех сторон, стен мало, доска тесная.',
  duo: 'Партнёры стоят напротив. Побеждает команда, чей игрок дошёл первым.',
  siege: 'Одиночка снизу ходит дважды за ход и получает вдвое больше стен.',
};

const TEAM_COLORS = ['#dc2626', '#e4e4e7', '#3b82f6', '#f59e0b'];
const GLYPH_SPOT = { 0: [20, 33], 1: [20, 7], 2: [7, 20], 3: [33, 20] };

/** Мини-схема доски: кто где стоит и кто с кем в команде. */
function modeGlyph(modeId, size = 52) {
  const mode = MODES[modeId];
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 40 40');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.classList.add('mode-glyph');

  const node = (tag, attrs) => {
    const el = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };

  svg.append(node('rect', {
    x: 2, y: 2, width: 36, height: 36, rx: 7,
    fill: '#141418', stroke: 'rgba(255,255,255,.08)',
  }));

  mode.seats.forEach((seatId, i) => {
    const [cx, cy] = GLYPH_SPOT[seatId];
    const team = mode.teams[i];
    const color = TEAM_COLORS[team % TEAM_COLORS.length];
    const mate = mode.teams.findIndex((t, j) => t === team && j !== i);
    if (mate > i) {
      const [mx, my] = GLYPH_SPOT[mode.seats[mate]];
      svg.append(node('line', {
        x1: cx, y1: cy, x2: mx, y2: my,
        stroke: color, 'stroke-width': 1.4, 'stroke-dasharray': '2 2', opacity: .55,
      }));
    }
    svg.append(node('circle', {
      cx, cy, r: mode.movesPerTurn[i] > 1 ? 5.6 : 4.2, fill: color,
    }));
    if (mode.movesPerTurn[i] > 1) {
      svg.append(node('circle', {
        cx, cy, r: 8, fill: 'none', stroke: color, 'stroke-width': 1, opacity: .5,
      }));
    }
  });
  return svg;
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
