/* Точка входа: навигация, профиль, футер, роутер. */

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
import { openDoc } from './views/legal.js';
import { skinFor, skinPreview } from './skins.js';
import { fmt } from './economy.js';

const viewRoot = document.getElementById('view');
const navRoot = document.getElementById('nav');
const footRoot = document.getElementById('foot');

let current = null;
let connDot = null;
let coinChip = null;

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
    }, icon(t.icon), h('span', { class: 'nav__label' }, t.label)));
  }
  navRoot.append(h('div', { class: 'nav__sep' }));

  coinChip = h('a', { class: 'coin-chip', href: '#/shop', title: 'Игровая валюта' },
    h('span', { class: 'coin-icon coin-icon--sm' }),
    h('span', {}, String(store.coins)));

  connDot = h('span', { class: 'conn-dot' });
  navRoot.append(coinChip, h('button', {
    class: 'nav__me',
    title: 'Профиль и настройки',
    onClick: openProfile,
  },
    h('span', { class: 'avatar avatar--sm' }, initials(store.name)),
    h('span', { class: 'nav__label' }, store.name),
    connDot));
  paintStatus();
}

function paintCoins() {
  if (coinChip) coinChip.lastChild.textContent = String(store.coins);
}

function paintStatus() {
  if (!connDot) return;
  const s = net.getStatus();
  connDot.className = 'conn-dot ' + (
    s === 'online' ? 'is-on' : s === 'connecting' ? 'is-wait' : 'is-off');
  connDot.title = s === 'online'
    ? `На связи, задержка ${net.getLatency()} мс`
    : s === 'connecting' ? 'Подключение'
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

/* ---------------- футер ---------------- */

function renderFooter() {
  clear(footRoot);
  const link = (label, key) => h('button', {
    class: 'foot__link',
    onClick: () => openDoc(key),
  }, label);

  footRoot.append(
    h('div', { class: 'foot__links' },
      link('Политика конфиденциальности', 'privacy'),
      link('Пользовательское соглашение', 'terms'),
      link('Публичная оферта', 'offer')),
    h('div', { class: 'foot__legal' },
      h('span', {}, '© 2026 КОРИДОР. Все права защищены.'),
      h('span', { class: 'foot__stats', id: 'server-stats' }, '')));
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
  const skin = skinFor(store.skin);

  const body = h('div', { class: 'stack stack--lg' },
    h('div', { class: 'hstack', style: { gap: '14px' } },
      h('div', { class: 'profile-skin' }, skinPreview(skin, 92)),
      h('div', { class: 'row__main stack stack--sm' },
        h('div', { class: 'field' },
          h('label', { class: 'field__label' }, 'Имя в игре'),
          nameInput),
        h('a', { class: 'btn btn--sm btn--ghost', href: '#/shop' },
          icon('crown', 14), `Скин: ${skin.name}`))),
    h('div', { class: 'stack stack--sm' },
      h('label', { class: 'switch' }, soundSw, h('span', { class: 'switch__track' }),
        h('span', { class: 'switch__label' }, 'Звуки')),
      h('label', { class: 'switch' }, animSw, h('span', { class: 'switch__track' }),
        h('span', { class: 'switch__label' }, 'Анимации постройки и ходов')),
      h('label', { class: 'switch' }, pathSw, h('span', { class: 'switch__track' }),
        h('span', { class: 'switch__label' }, 'Показывать кратчайший маршрут'))),
    h('div', {},
      h('div', { class: 'eyebrow', style: { marginBottom: '8px' } }, 'Статистика'),
      h('div', { class: 'grid-2' },
        h('div', { class: 'tile' },
          h('div', { class: 'tile__k' }, `${totalBot[0]} : ${totalBot[1]}`),
          h('div', { class: 'tile__v' }, 'Победы и поражения с ботами')),
        h('div', { class: 'tile' },
          h('div', { class: 'tile__k' }, `${s.online[0]} : ${s.online[1]}`),
          h('div', { class: 'tile__v' }, 'Победы и поражения онлайн'))),
      h('div', { class: 'tile', style: { marginTop: '12px' } },
        h('div', { class: 'tile__k' }, fmt(store.coins)),
        h('div', { class: 'tile__v' }, 'В кошельке')),
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
  if (nextName && nextName !== store.name) store.name = nextName;
  store.sound = soundSw.checked;
  store.showPath = pathSw.checked;
  store.animations = animSw.checked;
  sendProfile();
  renderNav(activeTab());
  window.dispatchEvent(new CustomEvent('coridor:settings'));
}

function sendProfile() {
  net.send({ type: 'profile', name: store.name, skin: store.skin });
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

function route() {
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

  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

/* ---------------- запуск ---------------- */

let sawRoomState = false;
net.on('room:state', () => { sawRoomState = true; });
net.on('hello:ok', () => {
  sawRoomState = false;
  sendProfile();
  setTimeout(() => {
    if (sawRoomState || !store.lastRoom) return;
    if (parseHash().view === 'room') return;
    store.lastRoom = null;
    window.dispatchEvent(new CustomEvent('coridor:resume'));
  }, 1500);
});

net.on('status', paintStatus);
net.on('error', (m) => toast(m.message || 'Ошибка', 'err'));
net.on('room:error', (m) => toast(m.message || 'Ошибка комнаты', 'err'));
net.on('lobby:rooms', (m) => {
  const el = document.getElementById('server-stats');
  if (el) el.textContent = `онлайн: ${m.online}, комнат: ${m.rooms.length}`;
});

window.addEventListener('coridor:coins', paintCoins);
window.addEventListener('coridor:skin', () => sendProfile());
window.addEventListener('hashchange', route);

renderFooter();
unlockAudio();
net.connect();
route();

document.body.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
