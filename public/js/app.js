/* Точка входа: навигация, профиль, роутер. */

import { h, clear, icon, toast, modal, initials } from './ui.js';
import { store } from './store.js';
import { unlockAudio } from './sound.js';
import * as net from './net.js';

import { renderHome } from './views/home.js';
import { renderBot } from './views/bot.js';
import { renderRoom } from './views/room.js';
import { renderRules } from './views/rules.js';
import { renderShop } from './views/shop.js';
import { renderDev } from './views/dev.js';
import { applySkin } from './skins.js';

const viewRoot = document.getElementById('view');
const navRoot = document.getElementById('nav');
const statsRoot = document.getElementById('server-stats');

let current = null;         // {destroy()}
let connDot = null;

/* ---------------- навигация ---------------- */

const TABS = [
  { id: 'home', label: 'Играть', icon: 'gamepad', hash: '#/' },
  { id: 'shop', label: 'Магазин', icon: 'crown', hash: '#/shop' },
  { id: 'dev', label: 'Разработка', icon: 'settings', hash: '#/dev' },
  { id: 'rules', label: 'Правила', icon: 'help', hash: '#/rules' },
];

function renderNav(active) {
  clear(navRoot);
  for (const t of TABS) {
    navRoot.append(h('a', {
      class: `nav__btn ${active === t.id ? 'is-active' : ''}`,
      href: t.hash,
    }, icon(t.icon), t.label));
  }
  navRoot.append(h('div', { class: 'nav__sep' }));

  connDot = h('span', { class: 'conn-dot' });
  navRoot.append(h('button', {
    class: 'nav__me',
    title: 'Профиль и настройки',
    onClick: openProfile,
  },
    h('span', { class: 'avatar avatar--sm' }, initials(store.name)),
    h('span', {}, store.name),
    connDot));
  paintStatus();
}

function paintStatus() {
  if (!connDot) return;
  const s = net.getStatus();
  connDot.className = 'conn-dot ' + (
    s === 'online' ? 'is-on' : s === 'connecting' ? 'is-wait' : 'is-off');
  connDot.title = s === 'online'
    ? `На связи · ${net.getLatency()} мс`
    : s === 'connecting' ? 'Подключение…'
      : s === 'replaced' ? 'Игра открыта в другой вкладке'
        : 'Нет связи с сервером';
  if (s === 'replaced') showTakeoverBanner();
}

let takeoverBanner = null;
function showTakeoverBanner() {
  if (takeoverBanner) return;
  takeoverBanner = h('div', { class: 'toast toast--err', style: { pointerEvents: 'auto' } },
    h('span', { class: 'toast__dot' }),
    h('span', { class: 'row__main' }, 'Игра открыта в другой вкладке'),
    h('button', {
      class: 'btn btn--sm btn--primary',
      onClick: () => {
        takeoverBanner?.remove();
        takeoverBanner = null;
        net.reconnect();
      },
    }, 'Играть здесь'));
  document.getElementById('toasts')?.append(takeoverBanner);
}

/* ---------------- профиль ---------------- */

async function openProfile() {
  const nameInput = h('input', {
    class: 'input', maxlength: 18, value: store.name, placeholder: 'Ваше имя',
  });
  const soundSw = h('input', { type: 'checkbox', checked: store.sound });
  const pathSw = h('input', { type: 'checkbox', checked: store.showPath });
  const animSw = h('input', { type: 'checkbox', checked: store.animations });

  const s = store.stats;
  const totalBot = Object.values(s.bot).reduce((a, r) => [a[0] + r[0], a[1] + r[1]], [0, 0]);

  const body = h('div', { class: 'stack stack--lg' },
    h('div', { class: 'field' },
      h('label', { class: 'field__label' }, 'Имя в игре'),
      nameInput),
    h('div', { class: 'stack stack--sm' },
      h('label', { class: 'switch' }, soundSw, h('span', { class: 'switch__track' }),
        h('span', { class: 'switch__label' }, 'Звуки')),
      h('label', { class: 'switch' }, animSw, h('span', { class: 'switch__track' }),
        h('span', { class: 'switch__label' }, 'Анимации постройки и ходов')),
      h('label', { class: 'switch' }, pathSw, h('span', { class: 'switch__track' }),
        h('span', { class: 'switch__label' }, 'Показывать кратчайший маршрут')),
    ),
    h('div', {},
      h('div', { class: 'eyebrow', style: { marginBottom: '8px' } }, 'Статистика'),
      h('div', { class: 'grid-2' },
        h('div', { class: 'tile' },
          h('div', { class: 'tile__k' }, `${totalBot[0]} : ${totalBot[1]}`),
          h('div', { class: 'tile__v' }, 'Победы : поражения с ботами')),
        h('div', { class: 'tile' },
          h('div', { class: 'tile__k' }, `${s.online[0]} : ${s.online[1]}`),
          h('div', { class: 'tile__v' }, 'Победы : поражения онлайн'))),
      h('button', {
        class: 'btn btn--sm btn--outline', style: { marginTop: '10px' },
        onClick: (e) => { store.resetStats(); e.target.textContent = 'Сброшено'; },
      }, 'Сбросить статистику')));

  await modal({
    title: 'Профиль',
    sub: 'Настройки хранятся только в этом браузере',
    body,
    actions: [{ label: 'Готово', class: 'btn--primary', value: true }],
  });

  const nextName = nameInput.value.trim().slice(0, 18);
  if (nextName && nextName !== store.name) {
    store.name = nextName;
    net.send({ type: 'profile', name: nextName });
  }
  store.sound = soundSw.checked;
  store.showPath = pathSw.checked;
  store.animations = animSw.checked;
  renderNav(activeTab());
  window.dispatchEvent(new CustomEvent('coridor:settings'));
}

/* ---------------- роутер ---------------- */

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const parts = raw.split('/').filter(Boolean);
  if (!parts.length) return { view: 'home' };
  if (parts[0] === 'bot') return { view: 'bot' };
  if (parts[0] === 'rules') return { view: 'rules' };
  if (parts[0] === 'shop') return { view: 'shop' };
  if (parts[0] === 'dev') return { view: 'dev' };
  if (parts[0] === 'rooms') return { view: 'home', tab: 'rooms' };
  if (parts[0] === 'room' && parts[1]) return { view: 'room', code: parts[1].toUpperCase() };
  return { view: 'home' };
}

function activeTab() {
  const r = parseHash();
  if (r.view === 'room' || r.view === 'bot') return 'home';
  return r.view;
}

async function route() {
  const r = parseHash();
  current?.destroy?.();
  current = null;
  clear(viewRoot);
  renderNav(activeTab());

  const mount = h('div', { class: 'view' });
  viewRoot.append(mount);

  if (r.view === 'bot') current = renderBot(mount);
  else if (r.view === 'rules') current = renderRules(mount);
  else if (r.view === 'shop') current = renderShop(mount);
  else if (r.view === 'dev') current = renderDev(mount);
  else if (r.view === 'room') current = renderRoom(mount, r.code);
  else current = renderHome(mount, r.tab);
}

/* ---------------- запуск ---------------- */

// «Продолжить партию» показываем только если сервер действительно помнит нас
// в комнате: после hello он сам присылает room:state восстановленному клиенту.
let sawRoomState = false;
net.on('room:state', () => { sawRoomState = true; });
net.on('hello:ok', () => {
  sawRoomState = false;
  setTimeout(() => {
    if (sawRoomState || !store.lastRoom) return;
    if (parseHash().view === 'room') return;   // мы и так открываем комнату
    store.lastRoom = null;
    window.dispatchEvent(new CustomEvent('coridor:resume'));
  }, 1500);
});

net.on('status', paintStatus);
net.on('error', (m) => toast(m.message || 'Ошибка', 'err'));
net.on('room:error', (m) => toast(m.message || 'Ошибка комнаты', 'err'));
net.on('lobby:rooms', (m) => {
  if (!statsRoot) return;
  statsRoot.textContent = `онлайн: ${m.online} · комнат: ${m.rooms.length}`
    + (m.queue ? ` · в подборе: ${m.queue}` : '');
});

window.addEventListener('hashchange', route);
window.addEventListener('DOMContentLoaded', () => {});

applySkin(store.skin);
window.addEventListener('coridor:skin', () => applySkin(store.skin));

unlockAudio();
net.connect();
route();

// красивый вход
document.body.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
