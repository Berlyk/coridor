/* Расчёт хода бота в отдельном потоке, чтобы интерфейс не подтормаживал. */

import { deserialize } from '/shared/quoridor.js';
import { chooseMove } from '/shared/ai.js';

self.onmessage = (e) => {
  const { id, state, seat, level } = e.data || {};
  try {
    const g = deserialize(state);
    const t0 = performance.now();
    const move = chooseMove(g, seat, level);
    self.postMessage({ id, move, ms: Math.round(performance.now() - t0) });
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message ? err.message : err) });
  }
};
