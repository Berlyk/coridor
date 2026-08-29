/*
 * Звук целиком синтезируется в браузере: ни одного файла в проекте.
 * Чтобы это не звучало как пищалка, сигнал идёт через компрессор и
 * небольшую комнату (свёртка с синтезированным импульсом), а у каждого
 * звука своя огибающая и фильтр.
 */

import { store } from './store.js';

let ctx = null;
let bus = null;      // сухой сигнал
let sendFx = null;   // отправка в реверб
let ready = false;

function makeImpulse(c, seconds = 1.1, decay = 3.2) {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      data[i] = (Math.random() * 2 - 1) * (1 - t) ** decay;
    }
  }
  return buf;
}

function ensure() {
  if (!store.sound) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 24;
    comp.ratio.value = 8;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;

    const master = ctx.createGain();
    master.gain.value = 0.55;

    const verb = ctx.createConvolver();
    verb.buffer = makeImpulse(ctx);
    const verbGain = ctx.createGain();
    verbGain.gain.value = 0.85;
    const verbLow = ctx.createBiquadFilter();
    verbLow.type = 'lowpass';
    verbLow.frequency.value = 3200;

    bus = ctx.createGain();
    bus.gain.value = 1;
    sendFx = ctx.createGain();
    sendFx.gain.value = 0.24;

    bus.connect(comp);
    sendFx.connect(verb).connect(verbLow).connect(verbGain).connect(comp);
    comp.connect(master).connect(ctx.destination);
    ready = true;
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ready ? ctx : null;
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

/* ------------------------------------------------------------------ *
 * Кирпичики
 * ------------------------------------------------------------------ */

function chain(nodes, wet = 0.3) {
  const last = nodes[nodes.length - 1];
  last.connect(bus);
  if (wet > 0) {
    const s = ctx.createGain();
    s.gain.value = wet;
    last.connect(s).connect(sendFx);
  }
}

/** Огибающая ADSR на GainNode. */
function env(g, t0, { a = 0.005, d = 0.08, s = 0, r = 0.08, peak = 0.3, hold = 0 }) {
  const p = Math.max(0.0002, peak);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(p, t0 + a);
  if (s > 0) {
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, p * s), t0 + a + d);
    g.gain.setValueAtTime(Math.max(0.0002, p * s), t0 + a + d + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d + hold + r);
    return t0 + a + d + hold + r;
  }
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  return t0 + a + d;
}

function osc({
  type = 'sine', freq = 440, to = null, glide = 0.12, delay = 0,
  gain = 0.25, a = 0.004, d = 0.14, s = 0, r = 0.1, hold = 0,
  filter = null, wet = 0.3, detune = 0,
}) {
  const c = ensure();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const o = c.createOscillator();
  o.type = type;
  o.detune.value = detune;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + glide);

  const g = c.createGain();
  const end = env(g, t0, { a, d, s, r, peak: gain, hold });

  let node = o.connect(g);
  const parts = [o, g];
  if (filter) {
    const f = c.createBiquadFilter();
    f.type = filter.type || 'lowpass';
    f.frequency.setValueAtTime(filter.freq ?? 1200, t0);
    if (filter.to) f.frequency.exponentialRampToValueAtTime(Math.max(40, filter.to), t0 + (filter.glide ?? 0.2));
    f.Q.value = filter.q ?? 1;
    g.connect(f);
    parts.push(f);
  }
  chain(parts, wet);
  o.start(t0);
  o.stop(end + 0.08);
  return node;
}

function noise({
  dur = 0.2, gain = 0.2, delay = 0, lp = 1800, lpTo = null, hp = 60,
  a = 0.002, curve = 2, wet = 0.3, q = 0.8,
}) {
  const c = ensure();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const frames = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, frames, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** curve;
  }
  const src = c.createBufferSource();
  src.buffer = buf;

  const high = c.createBiquadFilter();
  high.type = 'highpass';
  high.frequency.value = hp;

  const low = c.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.setValueAtTime(lp, t0);
  if (lpTo) low.frequency.exponentialRampToValueAtTime(Math.max(60, lpTo), t0 + dur);
  low.Q.value = q;

  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  src.connect(high).connect(low).connect(g);
  chain([src, high, low, g], wet);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

/* ------------------------------------------------------------------ *
 * Звуки
 * ------------------------------------------------------------------ */

export const sfx = {
  /** шаг фишки: короткий деревянный тук */
  step() {
    osc({ type: 'sine', freq: 320, to: 150, glide: 0.06, gain: 0.24, a: 0.002, d: 0.09, wet: 0.18 });
    osc({ type: 'triangle', freq: 900, to: 620, glide: 0.04, gain: 0.08, a: 0.001, d: 0.05, wet: 0.12 });
    noise({ dur: 0.045, gain: 0.09, lp: 4200, hp: 900, wet: 0.15 });
  },

  /** прыжок через фишку: тук с подъёмом */
  hop() {
    osc({ type: 'triangle', freq: 380, to: 760, glide: 0.13, gain: 0.2, a: 0.003, d: 0.16, wet: 0.3 });
    osc({ type: 'sine', freq: 760, to: 1180, glide: 0.1, gain: 0.09, a: 0.002, d: 0.12, delay: 0.05, wet: 0.35 });
    noise({ dur: 0.06, gain: 0.06, lp: 5200, hp: 1400, delay: 0.02, wet: 0.25 });
  },

  /** постройка стены: удар плиты о плиту с гулом и щелчком замка */
  wall() {
    // низ: тело удара
    osc({ type: 'sine', freq: 165, to: 44, glide: 0.26, gain: 0.5, a: 0.001, d: 0.34, wet: 0.22 });
    osc({ type: 'triangle', freq: 82, to: 38, glide: 0.3, gain: 0.28, a: 0.002, d: 0.42, wet: 0.2 });
    // середина: каменный призвук
    osc({
      type: 'square', freq: 240, to: 120, glide: 0.09, gain: 0.07, a: 0.001, d: 0.1,
      filter: { type: 'lowpass', freq: 1400, to: 400, glide: 0.12 }, wet: 0.25,
    });
    // верх: щелчок фиксации
    noise({ dur: 0.05, gain: 0.16, lp: 9000, hp: 2600, wet: 0.2 });
    // хвост: осыпающаяся крошка
    noise({ dur: 0.3, gain: 0.16, lp: 1500, lpTo: 300, hp: 120, delay: 0.01, curve: 3, wet: 0.45 });
  },

  /** наведение на слот */
  hover() {
    osc({ type: 'sine', freq: 1320, gain: 0.03, a: 0.001, d: 0.035, wet: 0.2 });
  },

  /** недопустимое действие */
  deny() {
    osc({
      type: 'sawtooth', freq: 200, to: 110, glide: 0.16, gain: 0.12, a: 0.003, d: 0.2,
      filter: { type: 'lowpass', freq: 900, to: 300, glide: 0.2 }, wet: 0.15,
    });
  },

  /** кто-то вошёл или вышел */
  notify() {
    osc({ type: 'sine', freq: 587, gain: 0.12, a: 0.006, d: 0.14, wet: 0.4 });
    osc({ type: 'sine', freq: 880, gain: 0.1, a: 0.006, d: 0.18, delay: 0.09, wet: 0.45 });
  },

  /** сообщение в чате */
  chat() {
    osc({ type: 'sine', freq: 1046, gain: 0.06, a: 0.003, d: 0.07, wet: 0.35 });
    osc({ type: 'sine', freq: 1568, gain: 0.03, a: 0.003, d: 0.05, delay: 0.04, wet: 0.35 });
  },

  /** покупка в магазине */
  coin() {
    osc({ type: 'triangle', freq: 988, gain: 0.12, a: 0.002, d: 0.09, wet: 0.4 });
    osc({ type: 'triangle', freq: 1318, gain: 0.1, a: 0.002, d: 0.16, delay: 0.07, wet: 0.45 });
    noise({ dur: 0.12, gain: 0.04, lp: 8000, hp: 3000, delay: 0.02, wet: 0.4 });
  },

  /** старт партии */
  start() {
    [294, 392, 523].forEach((f, i) => osc({
      type: 'triangle', freq: f, gain: 0.14, a: 0.006, d: 0.3, delay: i * 0.09, wet: 0.45,
    }));
    noise({ dur: 0.4, gain: 0.05, lp: 2200, hp: 200, delay: 0.02, wet: 0.5 });
  },

  /** победа */
  win() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, i) => {
      osc({ type: 'triangle', freq: f, gain: 0.17, a: 0.006, d: 0.16, s: 0.5, r: 0.5, hold: 0.05, delay: i * 0.1, wet: 0.5 });
      osc({ type: 'sine', freq: f * 2, gain: 0.05, a: 0.006, d: 0.3, delay: i * 0.1, wet: 0.55 });
    });
    osc({ type: 'sine', freq: 131, to: 262, glide: 0.5, gain: 0.14, a: 0.02, d: 0.6, wet: 0.3 });
  },

  /** поражение */
  lose() {
    [440, 349, 277, 220].forEach((f, i) => osc({
      type: 'sine', freq: f, gain: 0.14, a: 0.01, d: 0.34, delay: i * 0.13, wet: 0.45,
    }));
    osc({ type: 'triangle', freq: 110, to: 65, glide: 0.7, gain: 0.1, a: 0.03, d: 0.8, delay: 0.1, wet: 0.3 });
  },

  /** тиканье на последних секундах */
  tick() {
    osc({ type: 'square', freq: 1760, gain: 0.04, a: 0.001, d: 0.025, wet: 0.1 });
  },
};
