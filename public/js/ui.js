/* Мелкие UI-утилиты: гиперскрипт, иконки, тосты, модалки. */

/* ---------------- гиперскрипт ---------------- */

export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') setStyle(el, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = !!v;
    else el.setAttribute(k, v);
  }
  add(el, kids);
  return el;
}

function setStyle(el, style) {
  for (const [k, v] of Object.entries(style)) {
    if (v === null || v === undefined) continue;
    // кастомные свойства (--foo) не выставляются присваиванием
    if (k.startsWith('--')) el.style.setProperty(k, String(v));
    else el.style[k] = v;
  }
}

function add(el, kids) {
  for (const kid of kids) {
    if (kid === null || kid === undefined || kid === false) continue;
    if (Array.isArray(kid)) { add(el, kid); continue; }
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ---------------- иконки (lucide) ---------------- */

const ICONS = {
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  gamepad: '<line x1="6" x2="10" y1="11" y2="11"/><line x1="8" x2="8" y1="9" y2="13"/><line x1="15" x2="15.01" y1="12" y2="12"/><line x1="18" x2="18.01" y1="10" y2="10"/><path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"/>',
  bot: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
  book: '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  login: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" x2="3" y1="12" y2="12"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>',
  rotate: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  crown: '<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/>',
  zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>',
  wall: '<rect width="18" height="5" x="3" y="4" rx="1"/><rect width="18" height="5" x="3" y="10.5" rx="1"/><rect width="18" height="5" x="3" y="17" rx="1"/>',
  step: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3"/><path d="M12 19v3"/><path d="M2 12h3"/><path d="M19 12h3"/>',
  trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
  volume: '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/>',
  mute: '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>',
  door: '<path d="M13 4h3a2 2 0 0 1 2 2v14"/><path d="M2 20h3"/><path d="M13 20h9"/><path d="M10 12v.01"/><path d="M13 4.562v16.157a1 1 0 0 1-1.242.97L5.742 20.20A2 2 0 0 1 4 18.220V5.78a2 2 0 0 1 1.742-1.98l6.016-1.49A1 1 0 0 1 13 4.56Z"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
};

export function icon(name, size = 16) {
  const span = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  span.setAttribute('viewBox', '0 0 24 24');
  span.setAttribute('width', size);
  span.setAttribute('height', size);
  span.setAttribute('fill', 'none');
  span.setAttribute('stroke', 'currentColor');
  span.setAttribute('stroke-width', '2');
  span.setAttribute('stroke-linecap', 'round');
  span.setAttribute('stroke-linejoin', 'round');
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = ICONS[name] || ICONS.info;
  return span;
}

/* ---------------- тосты ---------------- */

let toastRoot = null;
export function toast(text, kind = '', ms = 3200) {
  toastRoot = toastRoot || document.getElementById('toasts');
  if (!toastRoot) return;
  const el = h('div', { class: `toast ${kind ? 'toast--' + kind : ''}` },
    h('span', { class: 'toast__dot' }),
    h('span', {}, text));
  toastRoot.append(el);
  const kill = () => {
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 240);
  };
  const timer = setTimeout(kill, ms);
  el.addEventListener('click', () => { clearTimeout(timer); kill(); });
  return el;
}

/* ---------------- модалки ---------------- */

let modalRoot = null;

export function modal({ title, sub, body, actions = [], wide = false, dismissable = true }) {
  modalRoot = modalRoot || document.getElementById('modal-root');
  return new Promise((resolve) => {
    const close = (value) => {
      back.style.animation = 'fade-in .16s reverse';
      setTimeout(() => back.remove(), 150);
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === 'Escape' && dismissable) close(null);
    };
    const box = h('div', { class: `modal ${wide ? 'modal--wide' : ''}` },
      h('div', { class: 'modal__head' },
        h('div', { class: 'row__main' },
          h('div', { class: 'modal__title' }, title),
          sub ? h('div', { class: 'modal__sub' }, sub) : null),
        dismissable ? h('button', { class: 'btn btn--icon btn--outline', onClick: () => close(null) }, icon('x')) : null),
      body || null,
      actions.length
        ? h('div', { class: 'modal__foot' },
            actions.map((a) => h('button', {
              class: `btn ${a.class || 'btn--ghost'}`,
              onClick: () => { if (a.onClick) { const r = a.onClick(box); if (r === false) return; } close(a.value ?? true); },
            }, a.icon ? icon(a.icon) : null, a.label)))
        : null);
    const back = h('div', {
      class: 'modal-back',
      onClick: (e) => { if (e.target === back && dismissable) close(null); },
    }, box);
    modalRoot.append(back);
    document.addEventListener('keydown', onKey);
    setTimeout(() => box.querySelector('input, button')?.focus(), 60);
  });
}

export function confirmDialog(title, sub, okLabel = 'Да', danger = true) {
  return modal({
    title, sub,
    actions: [
      { label: 'Отмена', class: 'btn--ghost', value: false },
      { label: okLabel, class: danger ? 'btn--danger' : 'btn--primary', value: true },
    ],
  }).then((v) => v === true);
}

/* ---------------- разное ---------------- */

export function fmtClock(ms) {
  if (ms <= 0) return '0:00';
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function initials(name) {
  const s = String(name || '?').trim();
  const parts = s.split(/\s+/);
  if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
  return s.slice(0, 2).toUpperCase();
}

export function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

export function timeAgo(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'только что';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} ${plural(m, 'минуту', 'минуты', 'минут')} назад`;
  const hr = Math.round(m / 60);
  return `${hr} ${plural(hr, 'час', 'часа', 'часов')} назад`;
}

/* ---------------- значок валюты ---------------- */

/**
 * Валюта это стены, поэтому и значок выглядит как кладка:
 * три ряда кирпичей со смещением.
 */
export function wallCoin(size = 16) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('wall-coin');
  svg.innerHTML = `
    <rect x="1" y="2.5" width="18" height="15" rx="3" fill="var(--coin-bg, #a16207)"/>
    <g fill="var(--coin-fg, #fde047)">
      <rect x="2.6" y="4.1" width="6.6" height="3.4" rx="1"/>
      <rect x="10.4" y="4.1" width="6.6" height="3.4" rx="1"/>
      <rect x="2.6" y="8.3" width="4.4" height="3.4" rx="1"/>
      <rect x="8.2" y="8.3" width="6.6" height="3.4" rx="1"/>
      <rect x="16" y="8.3" width="1" height="3.4" rx=".5"/>
      <rect x="2.6" y="12.5" width="6.6" height="3.4" rx="1"/>
      <rect x="10.4" y="12.5" width="6.6" height="3.4" rx="1"/>
    </g>`;
  return svg;
}

/**
 * Блок начисления валюты с анимацией: значок подпрыгивает,
 * число набегает от нуля.
 */
export function coinReward(amount, label = 'Начислено') {
  const num = h('b', { class: 'reward__num' }, '0');
  const el = h('div', { class: 'reward' },
    wallCoin(22),
    h('span', { class: 'reward__label' }, label),
    num,
    h('span', { class: 'reward__unit' }, 'стен'));

  const start = performance.now();
  const dur = 900;
  const tick = (t) => {
    const k = Math.min(1, (t - start) / dur);
    const eased = 1 - (1 - k) ** 3;
    num.textContent = String(Math.round(amount * eased));
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  setTimeout(() => { num.textContent = String(amount); }, dur + 60);
  return el;
}
