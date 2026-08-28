/* Главный экран: быстрый вход и список открытых комнат (переключатель как в CourtGame). */

import { h, clear, icon, toast, modal, plural, timeAgo } from '../ui.js';
import { store } from '../store.js';
import { sfx } from '../sound.js';
import * as net from '../net.js';

export function renderHome(mount, startTab) {
  const offs = [];
  let rooms = [];
  let inQueue = false;
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

  /* ---------- «Быстрый вход» ---------- */

  const hero = h('div', { class: 'card card--hero', style: { padding: '26px' } },
    h('div', { class: 'badge badge--red', style: { marginBottom: '16px' } }, 'Made By Berly'),
    h('h1', { class: 'h1' }, 'КОРИДОР'),
    h('p', { class: 'lead', style: { marginTop: '14px' } },
      'Настольная стратегия Quoridor: доведите фишку до другого края,'),
    h('p', { class: 'lead' }, 'пока соперник строит стены у вас на пути.'),
    h('div', { class: 'grid-2', style: { marginTop: '22px' } },
      tile('Доска 9 × 9', 'Классические правила Quoridor'),
      tile('10 стен', 'Каждая перекрывает два прохода'),
      tile('Прыжки', 'Через фишку соперника — и по диагонали'),
      tile('Никаких тупиков', 'Полностью замуровать соперника нельзя')));

  const codeInput = h('input', {
    class: 'input input--code', maxlength: 5, placeholder: 'КОД',
    onInput: (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); },
    onKeydown: (e) => { if (e.key === 'Enter') joinByCode(); },
  });

  const queueBtn = h('button', { class: 'btn btn--ghost btn--block', onClick: toggleQueue },
    icon('zap'), h('span', {}, 'Быстрый подбор'));

  const resumeBox = h('div', {});

  const actions = h('div', { class: 'card card--pad', style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
    resumeBox,
    h('button', { class: 'btn btn--primary btn--lg btn--block', onClick: openCreate },
      icon('plus', 20), 'Создать игру'),
    h('div', { class: 'hstack' },
      codeInput,
      h('button', { class: 'btn btn--ghost', onClick: joinByCode }, icon('login'), 'Войти')),
    queueBtn,
    h('a', { class: 'btn btn--outline btn--block', href: '#/bot' }, icon('bot'), 'Играть с ботом'),
    h('div', { class: 'divider' }),
    h('div', { class: 'eyebrow' }, 'Как это работает'),
    h('ul', { class: 'stack stack--sm dim-2' },
      li('создайте комнату и поделитесь кодом из 5 символов'),
      li('приватные комнаты защищаются паролем'),
      li('в комнате есть чат, готовность и настройки партии'),
      li('обрыв связи не засчитывается сразу — есть 45 секунд на возврат')));

  const quickPane = h('div', { class: 'home-grid' }, hero, actions);

  /* ---------- «Открытые комнаты» ---------- */

  const listBox = h('div', { class: 'stack' });
  const roomsPane = h('div', { class: 'wrap wrap--narrow' },
    h('div', { class: 'hstack hstack--wrap', style: { marginBottom: '14px' } },
      h('div', { class: 'row__main' },
        h('div', { class: 'h3' }, 'Кто сейчас играет'),
        h('div', { class: 'dim-2' }, 'Свободные комнаты можно занять, идущие партии — посмотреть')),
      h('button', {
        class: 'btn btn--sm btn--outline',
        onClick: () => { net.send({ type: 'lobby:subscribe', on: true }); toast('Обновляю…'); },
      }, icon('refresh', 14), 'Обновить'),
      h('button', { class: 'btn btn--sm btn--primary', onClick: openCreate },
        icon('plus', 14), 'Создать')),
    listBox);
  roomsPane.style.display = 'none';

  mount.append(
    h('div', { class: 'subnav' }, subnav),
    quickPane,
    roomsPane);

  paintSubnav();
  if (tab === 'rooms') { quickPane.style.display = 'none'; roomsPane.style.display = ''; }

  // адаптив главной сетки
  const mq = window.matchMedia('(max-width: 900px)');
  const applyMq = () => {
    quickPane.style.gridTemplateColumns =
      mq.matches ? 'minmax(0, 1fr)' : 'minmax(0, 1.15fr) minmax(0, .85fr)';
  };
  applyMq();
  mq.addEventListener('change', applyMq);

  const onResume = () => paintResume();
  window.addEventListener('coridor:resume', onResume);

  /* ---------- сеть ---------- */

  net.send({ type: 'lobby:subscribe', on: true });

  offs.push(net.on('lobby:rooms', (m) => {
    rooms = m.rooms || [];
    paintRooms();
  }));
  offs.push(net.on('room:error', () => { pendingJoin = false; }));
  offs.push(net.on('queue:status', (m) => {
    inQueue = !!m.inQueue;
    paintQueue(m.size || 0);
  }));
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
      style: { borderColor: 'rgba(220,38,38,.45)', color: '#fca5a5' },
    }, icon('rotate'), `Продолжить партию · ${code}`));
  }

  function paintQueue(size) {
    clear(queueBtn);
    if (inQueue) {
      queueBtn.className = 'btn btn--danger btn--block';
      queueBtn.append(icon('x'), h('span', {}, `Отменить подбор · в очереди ${size}`));
    } else {
      queueBtn.className = 'btn btn--ghost btn--block';
      queueBtn.append(icon('zap'), h('span', {}, 'Быстрый подбор'));
    }
  }

  function toggleQueue() {
    pendingJoin = !inQueue;
    net.send({ type: inQueue ? 'queue:leave' : 'queue:join' });
    if (!inQueue) toast('Ищем соперника…');
  }

  function joinByCode() {
    const code = codeInput.value.trim().toUpperCase();
    if (code.length < 4) return toast('Введите код комнаты', 'err');
    tryJoin(code);
  }

  function tryJoin(code, password) {
    pendingJoin = true;
    net.send({ type: 'room:join', code, password: password || '' });
  }

  function paintRooms() {
    roomsBadge.textContent = String(rooms.length);
    roomsBadge.style.display = rooms.length ? '' : 'none';
    clear(listBox);
    if (!rooms.length) {
      listBox.append(h('div', { class: 'empty' },
        'Пока нет открытых комнат. Создайте свою — код появится сразу.'));
      return;
    }
    for (const r of rooms) listBox.append(roomRow(r));
  }

  function roomRow(r) {
    const full = r.players >= 2;
    const playing = r.status === 'playing';
    return h('div', { class: 'row row--click' },
      h('div', {
        class: 'avatar',
        style: playing ? { background: 'linear-gradient(140deg,#3f3f46,#18181b)' } : null,
      }, icon(playing ? 'eye' : 'gamepad')),
      h('div', { class: 'row__main' },
        h('div', { class: 'row__title' },
          r.name,
          r.isPrivate ? h('span', { class: 'badge', style: { marginLeft: '8px' } }, icon('lock', 11), 'приват') : null),
        h('div', { class: 'row__sub' },
          `${r.host} · ${r.wallsPerPlayer} ${plural(r.wallsPerPlayer, 'стена', 'стены', 'стен')}`
          + (r.turnTimeSec ? ` · ${r.turnTimeSec} c на ход` : ' · без таймера')
          + ` · ${timeAgo(r.createdAt)}`)),
      h('div', { class: 'hstack' },
        h('span', { class: `badge ${playing ? 'badge--warn' : full ? '' : 'badge--ok'}` },
          playing ? 'идёт партия' : `${r.players}/2`),
        h('span', { class: 'mono dim-2' }, r.code),
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

  async function openCreate() {
    const nameInput = h('input', { class: 'input', maxlength: 28, value: `Партия ${store.name}`, placeholder: 'Название' });
    const wallsSel = h('select', { class: 'input' },
      ...[6, 8, 10, 12].map((n) => h('option', { value: n, selected: n === 10 }, `${n} ${plural(n, 'стена', 'стены', 'стен')} на игрока`)));
    const timeSel = h('select', { class: 'input' },
      h('option', { value: 0 }, 'Без таймера'),
      h('option', { value: 15 }, '15 секунд на ход'),
      h('option', { value: 30 }, '30 секунд на ход'),
      h('option', { value: 60, selected: true }, '60 секунд на ход'),
      h('option', { value: 120 }, '2 минуты на ход'));
    const privSw = h('input', { type: 'checkbox' });
    const passInput = h('input', { class: 'input', placeholder: 'Пароль', disabled: true });
    privSw.addEventListener('change', () => { passInput.disabled = !privSw.checked; });

    const res = await modal({
      title: 'Новая комната',
      sub: 'Код появится сразу — отправьте его сопернику',
      body: h('div', { class: 'stack stack--lg' },
        h('div', { class: 'field' }, h('label', { class: 'field__label' }, 'Название'), nameInput),
        h('div', { class: 'grid-2' },
          h('div', { class: 'field' }, h('label', { class: 'field__label' }, 'Стены'), wallsSel),
          h('div', { class: 'field' }, h('label', { class: 'field__label' }, 'Время на ход'), timeSel)),
        h('div', { class: 'stack stack--sm' },
          h('label', { class: 'switch' }, privSw, h('span', { class: 'switch__track' }),
            h('span', { class: 'switch__label' }, 'Приватная комната')),
          passInput)),
      actions: [
        { label: 'Отмена', class: 'btn--ghost', value: false },
        { label: 'Создать', class: 'btn--primary', value: true },
      ],
    });
    if (res !== true) return;
    sfx.notify();
    pendingJoin = true;
    net.send({
      type: 'room:create',
      name: nameInput.value.trim(),
      wallsPerPlayer: Number(wallsSel.value),
      turnTimeSec: Number(timeSel.value),
      isPrivate: privSw.checked,
      password: privSw.checked ? passInput.value : '',
    });
  }

  return {
    destroy() {
      for (const off of offs) off();
      net.send({ type: 'lobby:subscribe', on: false });
      window.removeEventListener('coridor:resume', onResume);
      mq.removeEventListener('change', applyMq);
    },
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
