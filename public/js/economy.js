/* Игровая валюта: стены. Начисляются за партии, тратятся в магазине. */

export const CURRENCY = { one: 'стена', few: 'стены', many: 'стен' };

const BOT_WIN = { easy: 8, medium: 15, hard: 30, expert: 50 };
const BOT_LOSS = 3;

/** Награда за партию с ботом. */
export function botReward(levelId, won) {
  return won ? (BOT_WIN[levelId] ?? 10) : BOT_LOSS;
}

/**
 * Награда за онлайн-партию.
 * @param {boolean} won
 * @param {number} rivals сколько соперников было на доске
 */
export function onlineReward(won, rivals = 1) {
  const extra = Math.max(0, rivals - 1) * 10;
  return (won ? 40 : 12) + (won ? extra : Math.round(extra / 2));
}

export function plural(n) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return CURRENCY.one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return CURRENCY.few;
  return CURRENCY.many;
}

export function fmt(n) {
  return `${n} ${plural(n)}`;
}
