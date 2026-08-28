/* Локальный профиль, настройки и статистика. */

const KEY = 'coridor.v1';

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
  stats: {
    bot: { easy: [0, 0], medium: [0, 0], hard: [0, 0], expert: [0, 0] },
    online: [0, 0],
  },
};

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS, stats: structuredClone(DEFAULTS.stats) };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULTS,
      ...parsed,
      stats: {
        bot: { ...DEFAULTS.stats.bot, ...(parsed.stats?.bot || {}) },
        online: parsed.stats?.online || [0, 0],
      },
    };
  } catch {
    return { ...DEFAULTS, stats: structuredClone(DEFAULTS.stats) };
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
