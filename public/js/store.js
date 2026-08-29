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
  pawn: 'classic',
  wall: 'classic',
  owned: { pawns: ['classic'], walls: ['classic'], bundles: [] },
  coins: 120,
  stats: {
    bot: { easy: [0, 0], medium: [0, 0], hard: [0, 0], expert: [0, 0] },
    online: [0, 0],
  },
};

function blank() {
  return { ...DEFAULTS, owned: structuredClone(DEFAULTS.owned), stats: structuredClone(DEFAULTS.stats) };
}

function read() {
  try {
    const raw = localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY);
    if (!raw) return blank();
    const parsed = JSON.parse(raw);
    const src = (parsed.owned && !Array.isArray(parsed.owned)) ? parsed.owned : {};
    const owned = {
      pawns: Array.isArray(src.pawns) ? src.pawns.slice() : ['classic'],
      walls: Array.isArray(src.walls) ? src.walls.slice() : ['classic'],
      bundles: Array.isArray(src.bundles) ? src.bundles.slice() : [],
    };
    if (!owned.pawns.includes('classic')) owned.pawns.push('classic');
    if (!owned.walls.includes('classic')) owned.walls.push('classic');
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

  get pawn() { return state.pawn || 'classic'; },
  set pawn(v) { state.pawn = String(v || 'classic'); write(); },

  get wall() { return state.wall || 'classic'; },
  set wall(v) { state.wall = String(v || 'classic'); write(); },

  get owned() { return state.owned; },
  hasPawn(id) { return state.owned.pawns.includes(id); },
  hasWall(id) { return state.owned.walls.includes(id); },
  hasBundle(id) { return state.owned.bundles.includes(id); },

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

  /**
   * Купить предмет. kind: pawn | wall | bundle.
   * Комплект открывает и фишку, и стену.
   */
  buy(kind, id, price, parts = null) {
    const list = kind === 'wall' ? state.owned.walls
      : kind === 'bundle' ? state.owned.bundles : state.owned.pawns;
    if (list.includes(id)) return true;
    if (state.coins < price) return false;
    state.coins -= price;
    list.push(id);
    if (kind === 'bundle' && parts) {
      if (!state.owned.pawns.includes(parts.pawn)) state.owned.pawns.push(parts.pawn);
      if (!state.owned.walls.includes(parts.wall)) state.owned.walls.push(parts.wall);
    }
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
