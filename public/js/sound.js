/* Синтезированные звуки — без единого внешнего файла. */

import { store } from './store.js';

let ctx = null;
let master = null;

function ensure() {
  if (!store.sound) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

/** Разблокировка звука после первого жеста пользователя. */
export function unlockAudio() {
  const once = () => {
    ensure();
    window.removeEventListener('pointerdown', once);
    window.removeEventListener('keydown', once);
  };
  window.addEventListener('pointerdown', once, { once: true });
  window.addEventListener('keydown', once, { once: true });
}

function tone({ freq = 440, to = null, dur = 0.15, type = 'sine', gain = 0.2, delay = 0, curve = 'exp' }) {
  const c = ensure();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) {
    if (curve === 'exp') osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    else osc.frequency.linearRampToValueAtTime(to, t0 + dur);
  }
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.02, dur * 0.25));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

function noise({ dur = 0.2, gain = 0.18, delay = 0, lp = 1200, hp = 60 }) {
  const c = ensure();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const frames = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, frames, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 2;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const low = c.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = lp;
  const high = c.createBiquadFilter();
  high.type = 'highpass';
  high.frequency.value = hp;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(high).connect(low).connect(g).connect(master);
  src.start(t0);
}

export const sfx = {
  /** шаг фишки */
  step() {
    tone({ freq: 520, to: 380, dur: 0.09, type: 'triangle', gain: 0.14 });
    noise({ dur: 0.06, gain: 0.05, lp: 2600 });
  },

  /** прыжок через соперника */
  hop() {
    tone({ freq: 420, to: 780, dur: 0.13, type: 'triangle', gain: 0.16 });
    tone({ freq: 840, to: 1180, dur: 0.1, type: 'sine', gain: 0.07, delay: 0.05 });
  },

  /** постройка стены — глухой удар с металлическим щелчком */
  wall() {
    tone({ freq: 150, to: 52, dur: 0.3, type: 'sine', gain: 0.34 });
    tone({ freq: 96, to: 40, dur: 0.4, type: 'triangle', gain: 0.2, delay: 0.01 });
    noise({ dur: 0.24, gain: 0.24, lp: 900, hp: 90 });
    noise({ dur: 0.08, gain: 0.1, lp: 7000, hp: 2200, delay: 0.005 });
  },

  /** наведение на слот */
  hover() {
    tone({ freq: 1250, dur: 0.035, type: 'sine', gain: 0.035 });
  },

  /** недопустимое действие */
  deny() {
    tone({ freq: 190, to: 120, dur: 0.2, type: 'sawtooth', gain: 0.13 });
  },

  /** уведомление / вход игрока */
  notify() {
    tone({ freq: 660, dur: 0.1, type: 'sine', gain: 0.12 });
    tone({ freq: 990, dur: 0.13, type: 'sine', gain: 0.1, delay: 0.08 });
  },

  /** сообщение в чате */
  chat() {
    tone({ freq: 880, dur: 0.06, type: 'sine', gain: 0.07 });
  },

  /** начало партии */
  start() {
    [392, 523, 659].forEach((f, i) => tone({ freq: f, dur: 0.22, type: 'triangle', gain: 0.13, delay: i * 0.09 }));
  },

  /** победа */
  win() {
    [523, 659, 784, 1046].forEach((f, i) =>
      tone({ freq: f, dur: 0.42, type: 'triangle', gain: 0.17, delay: i * 0.1 }));
    noise({ dur: 0.5, gain: 0.05, lp: 5000, hp: 600, delay: 0.1 });
  },

  /** поражение */
  lose() {
    [440, 370, 294, 220].forEach((f, i) =>
      tone({ freq: f, dur: 0.36, type: 'sine', gain: 0.14, delay: i * 0.12 }));
  },

  /** тиканье на последних секундах */
  tick() {
    tone({ freq: 1500, dur: 0.03, type: 'square', gain: 0.05 });
  },
};
