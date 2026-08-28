/* Скины: набор цветов для фишек и стен обоих игроков. */

export const SKINS = [
  {
    id: 'classic',
    name: 'Классика',
    hint: 'Красные против белых — как на столе',
    unlock: 0,
    p0: { hi: '#f87171', mid: '#dc2626', lo: '#7f1d1d', glow: 'rgba(220,38,38,.5)', fg: '#fff' },
    p1: { hi: '#ffffff', mid: '#d4d4d8', lo: '#71717a', glow: 'rgba(228,228,231,.4)', fg: '#18181b' },
  },
  {
    id: 'neon',
    name: 'Неон',
    hint: 'Кислотная маджента против бирюзы',
    unlock: 1,
    p0: { hi: '#f5d0fe', mid: '#d946ef', lo: '#701a75', glow: 'rgba(217,70,239,.55)', fg: '#fff' },
    p1: { hi: '#cffafe', mid: '#06b6d4', lo: '#164e63', glow: 'rgba(6,182,212,.5)', fg: '#062c33' },
  },
  {
    id: 'emerald',
    name: 'Изумруд',
    hint: 'Зелень против янтаря',
    unlock: 3,
    p0: { hi: '#6ee7b7', mid: '#10b981', lo: '#064e3b', glow: 'rgba(16,185,129,.5)', fg: '#022c22' },
    p1: { hi: '#fde68a', mid: '#f59e0b', lo: '#78350f', glow: 'rgba(245,158,11,.5)', fg: '#3b2006' },
  },
  {
    id: 'ocean',
    name: 'Океан',
    hint: 'Глубокая синь и лёд',
    unlock: 5,
    p0: { hi: '#93c5fd', mid: '#3b82f6', lo: '#1e3a8a', glow: 'rgba(59,130,246,.5)', fg: '#fff' },
    p1: { hi: '#e0f2fe', mid: '#7dd3fc', lo: '#0369a1', glow: 'rgba(125,211,252,.45)', fg: '#082f49' },
  },
  {
    id: 'sunset',
    name: 'Закат',
    hint: 'Оранжевое солнце и розовое небо',
    unlock: 8,
    p0: { hi: '#fdba74', mid: '#f97316', lo: '#7c2d12', glow: 'rgba(249,115,22,.55)', fg: '#431407' },
    p1: { hi: '#fbcfe8', mid: '#ec4899', lo: '#831843', glow: 'rgba(236,72,153,.5)', fg: '#fff' },
  },
  {
    id: 'gold',
    name: 'Золото',
    hint: 'Для тех, кто уже собрал коллекцию побед',
    unlock: 12,
    p0: { hi: '#fef3c7', mid: '#eab308', lo: '#713f12', glow: 'rgba(234,179,8,.55)', fg: '#422006' },
    p1: { hi: '#f4f4f5', mid: '#a1a1aa', lo: '#3f3f46', glow: 'rgba(161,161,170,.45)', fg: '#18181b' },
  },
  {
    id: 'amethyst',
    name: 'Аметист',
    hint: 'Фиолетовый бархат против стали',
    unlock: 18,
    p0: { hi: '#ddd6fe', mid: '#8b5cf6', lo: '#4c1d95', glow: 'rgba(139,92,246,.55)', fg: '#fff' },
    p1: { hi: '#e2e8f0', mid: '#64748b', lo: '#1e293b', glow: 'rgba(100,116,139,.45)', fg: '#f8fafc' },
  },
];

export const SKIN_BY_ID = Object.fromEntries(SKINS.map((s) => [s.id, s]));

/** Сколько побед всего набрал игрок — по этому числу открываются скины. */
export function totalWins(stats) {
  let n = stats?.online?.[0] || 0;
  for (const row of Object.values(stats?.bot || {})) n += row[0] || 0;
  return n;
}

export function isUnlocked(skin, stats) {
  return totalWins(stats) >= (skin.unlock || 0);
}

/** Выставляет переменные скина — их читают доска и превью в магазине. */
export function applySkin(skinId, el = document.documentElement) {
  const skin = SKIN_BY_ID[skinId] || SKINS[0];
  for (const seat of [0, 1]) {
    const c = skin[`p${seat}`];
    el.style.setProperty(`--sk${seat}-hi`, c.hi);
    el.style.setProperty(`--sk${seat}-mid`, c.mid);
    el.style.setProperty(`--sk${seat}-lo`, c.lo);
    el.style.setProperty(`--sk${seat}-glow`, c.glow);
    el.style.setProperty(`--sk${seat}-fg`, c.fg);
  }
  return skin;
}
