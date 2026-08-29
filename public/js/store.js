/* Локальный профиль, настройки, валюта и статистика. */

const KEY = 'coridor.v2';
const OLD_KEY = 'coridor.v1';

const DEFAULTS = {
  clientId: null,
  name: '',
  sound: true,
  showPath: false,
  animations: true,
  lastRoom: null,
  botLevel: 'medium',
  botSide: 0,
  skin: 'classic',
  owned: ['classic', 'chalk'],
  coins: 120,
  stats: {
    bot: { easy: [0, 0], medium: [0, 0], hard: [0, 0], expert: [0, 0] },
    online: [0, 0],
  },
};

function blank() {
  return { ...DEFAULTS, owned: DEFAULTS.owned.slice(), stats: structuredClone(DEFAULTS.stats) };
}

function read() {
  try {
    const raw = localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY);
    if (!raw) return blank();
    const parsed = JSON.parse(raw);
    const owned = Array.isArray(parsed.owned) ? parsed.owned.slice() : DEFAULTS.owned.slice();
    for (const id of DEFAULTS.owned) if (!owned.includes(id)) owned.push(id);
    return {
      ...DEFAULTS,
      ...parsed,
      owned,
      coins: Number.isFinite(parsed.coins) ? parsed.coins : DEFAULTS.coins,
      stats: {
        bot: { ...DEFAULTS.stats.bot, ...(parsed.stats?.bot || {}) },
        online: parsed.stats?.online || [0, 0],
      },
    };
  } catch {
    return blank();
  }
}

let state = read();

function write() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* приватный режим */ }
}

const RU_NAMES = [
  'Лабиринт', 'Пешка', 'Стена', 'Тупик', 'Проход', 'Обход',
  'Барьер', 'Маршрут', 'Клетка', 'Финиш', 'Развилка', 'Коридор',
];

export const store = {
  get all() { return state; },

  get clientId() {
    if (!state.clientId) {
      state.clientId = 'c' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
      write();
    }
    return state.clientId;
  },

  get name() {
    if (!state.name) {
      state.name = RU_NAMES[Math.floor(Math.random() * RU_NAMES.length)] + Math.floor(10 + Math.random() * 89);
      write();
    }
    return state.name;
  },
  set name(v) { state.name = String(v || '').slice(0, 18); write(); },

  get sound() { return state.sound; },
  set sound(v) { state.sound = !!v; write(); },

  get showPath() { return state.showPath; },
  set showPath(v) { state.showPath = !!v; write(); },

  get animations() { return state.animations; },
  set animations(v) { state.animations = !!v; write(); },

  get botLevel() { return state.botLevel; },
  set botLevel(v) { state.botLevel = v; write(); },

  get botSide() { return state.botSide; },
  set botSide(v) { state.botSide = v === 1 ? 1 : 0; write(); },

  get skin() { return state.skin || 'classic'; },
  set skin(v) { state.skin = String(v || 'classic'); write(); },

  get owned() { return state.owned; },
  has(id) { return state.owned.includes(id); },

  get coins() { return state.coins; },

  /** Начислить валюту. */
  earn(amount) {
    const n = Math.max(0, Math.round(amount || 0));
    if (!n) return 0;
    state.coins += n;
    write();
    window.dispatchEvent(new CustomEvent('coridor:coins', { detail: { coins: state.coins, gained: n } }));
    return n;
  },

  /** Купить скин. Возвращает true, если хватило валюты. */
  buy(id, price) {
    if (state.owned.includes(id)) return true;
    if (state.coins < price) return false;
    state.coins -= price;
    state.owned.push(id);
    write();
    window.dispatchEvent(new CustomEvent('coridor:coins', { detail: { coins: state.coins, gained: -price } }));
    return true;
  },

  get lastRoom() { return state.lastRoom; },
  set lastRoom(v) { state.lastRoom = v; write(); },

  get stats() { return state.stats; },

  recordBot(level, won) {
    const row = state.stats.bot[level] || (state.stats.bot[level] = [0, 0]);
    row[won ? 0 : 1]++;
    write();
  },

  recordOnline(won) {
    state.stats.online[won ? 0 : 1]++;
    write();
  },

  resetStats() {
    state.stats = structuredClone(DEFAULTS.stats);
    write();
  },
};
