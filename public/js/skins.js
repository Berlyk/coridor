/* Скины персонажа: цвет плюс форма фишки и фактура стены. */

/**
 * style  — как выглядит фишка: gloss | ring | gem | core | ghost | flame
 * wall   — фактура стены: solid | striped | segmented | glow
 * price  — цена в стенах (игровая валюта)
 */
export const SKINS = [
  {
    id: 'classic', name: 'Классика', price: 0,
    hint: 'Гладкая красная фишка, с которой всё начиналось',
    style: 'gloss', wall: 'solid',
    hi: '#f87171', mid: '#dc2626', lo: '#7f1d1d', glow: 'rgba(220,38,38,.55)', fg: '#fff',
  },
  {
    id: 'chalk', name: 'Мел', price: 0,
    hint: 'Белая фишка второго игрока, доступна сразу',
    style: 'gloss', wall: 'solid',
    hi: '#ffffff', mid: '#d4d4d8', lo: '#71717a', glow: 'rgba(228,228,231,.45)', fg: '#18181b',
  },
  {
    id: 'frost', name: 'Иней', price: 150,
    hint: 'Ледяная фишка и стена в полоску',
    style: 'gloss', wall: 'striped',
    hi: '#e0f2fe', mid: '#38bdf8', lo: '#075985', glow: 'rgba(56,189,248,.55)', fg: '#082f49',
  },
  {
    id: 'emerald', name: 'Изумруд', price: 250,
    hint: 'Кольцо с полым центром, стена собрана из блоков',
    style: 'ring', wall: 'segmented',
    hi: '#a7f3d0', mid: '#10b981', lo: '#064e3b', glow: 'rgba(16,185,129,.55)', fg: '#022c22',
  },
  {
    id: 'amethyst', name: 'Аметист', price: 350,
    hint: 'Огранённый камень вместо круга',
    style: 'gem', wall: 'segmented',
    hi: '#ddd6fe', mid: '#8b5cf6', lo: '#4c1d95', glow: 'rgba(139,92,246,.6)', fg: '#fff',
  },
  {
    id: 'sunset', name: 'Закат', price: 400,
    hint: 'Тёплый оранжевый и мягкое свечение стены',
    style: 'gloss', wall: 'glow',
    hi: '#fed7aa', mid: '#f97316', lo: '#7c2d12', glow: 'rgba(249,115,22,.6)', fg: '#431407',
  },
  {
    id: 'gold', name: 'Золото', price: 600,
    hint: 'Огранка и золотой блеск для тех, кто много играет',
    style: 'gem', wall: 'glow',
    hi: '#fef9c3', mid: '#eab308', lo: '#713f12', glow: 'rgba(234,179,8,.6)', fg: '#422006',
  },
  {
    id: 'neon', name: 'Неон', price: 750,
    hint: 'Ядро с вращающимся кольцом',
    style: 'core', wall: 'striped',
    hi: '#f5d0fe', mid: '#d946ef', lo: '#701a75', glow: 'rgba(217,70,239,.65)', fg: '#fff',
  },
  {
    id: 'ghost', name: 'Призрак', price: 900,
    hint: 'Полупрозрачная фишка, которую видно насквозь',
    style: 'ghost', wall: 'glow',
    hi: '#f8fafc', mid: '#94a3b8', lo: '#334155', glow: 'rgba(148,163,184,.6)', fg: '#f8fafc',
  },
  {
    id: 'magma', name: 'Магма', price: 1200,
    hint: 'Живой градиент, который переливается сам по себе',
    style: 'flame', wall: 'glow',
    hi: '#fde047', mid: '#f97316', lo: '#991b1b', glow: 'rgba(249,115,22,.7)', fg: '#450a0a',
  },
  {
    id: 'void', name: 'Пустота', price: 1600,
    hint: 'Чёрное ядро в фиолетовом ореоле, самый редкий набор',
    style: 'core', wall: 'segmented',
    hi: '#a78bfa', mid: '#312e81', lo: '#09090b', glow: 'rgba(129,90,225,.7)', fg: '#ede9fe',
  },
];

export const SKIN_BY_ID = Object.fromEntries(SKINS.map((s) => [s.id, s]));

/** Запасные цвета для мест, если игрок ничего не выбрал. */
export const SEAT_SKIN = ['classic', 'chalk', 'frost', 'gold'];

export function skinFor(id) { return SKIN_BY_ID[id] || SKIN_BY_ID.classic; }

export function seatSkin(seat) { return skinFor(SEAT_SKIN[seat % SEAT_SKIN.length]); }

/** Выставить переменные скина на элемент. */
export function paintSkin(el, skin) {
  el.style.setProperty('--sk-hi', skin.hi);
  el.style.setProperty('--sk-mid', skin.mid);
  el.style.setProperty('--sk-lo', skin.lo);
  el.style.setProperty('--sk-glow', skin.glow);
  el.style.setProperty('--sk-fg', skin.fg);
  return el;
}

/** Мини-превью фишки и стены для магазина и карточек игроков. */
export function skinPreview(skin, size = 120) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 120 120');
  svg.setAttribute('width', '100%');
  svg.style.display = 'block';
  svg.style.maxHeight = size + 'px';

  const node = (tag, attrs) => {
    const el = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };

  const uid = 'sk-' + skin.id;
  const defs = node('defs', {});
  const grad = node('radialGradient', { id: uid, cx: '34%', cy: '28%', r: '75%' });
  grad.append(node('stop', { offset: '0%', 'stop-color': skin.hi }));
  grad.append(node('stop', { offset: '45%', 'stop-color': skin.mid }));
  grad.append(node('stop', { offset: '100%', 'stop-color': skin.lo }));
  defs.append(grad);
  svg.append(defs);

  // клетки фона
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      svg.append(node('rect', {
        x: 8 + j * 54, y: 8 + i * 54, width: 46, height: 46, rx: 8,
        fill: '#1e1e23', stroke: 'rgba(255,255,255,.05)',
      }));
    }
  }

  // фишка в выбранном стиле
  const cx = 31, cy = 31, r = 17;
  if (skin.style === 'gem') {
    const pts = [];
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI / 4) * i - Math.PI / 8;
      pts.push(`${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`);
    }
    svg.append(node('polygon', { points: pts.join(' '), fill: `url(#${uid})` }));
  } else if (skin.style === 'ring') {
    svg.append(node('circle', {
      cx, cy, r: r - 3, fill: 'none', stroke: `url(#${uid})`, 'stroke-width': 7,
    }));
  } else if (skin.style === 'core') {
    svg.append(node('circle', { cx, cy, r, fill: 'none', stroke: skin.hi, 'stroke-width': 2, opacity: .55 }));
    svg.append(node('circle', { cx, cy, r: r - 7, fill: `url(#${uid})` }));
  } else if (skin.style === 'ghost') {
    svg.append(node('circle', { cx, cy, r, fill: `url(#${uid})`, opacity: .55 }));
    svg.append(node('circle', { cx, cy, r, fill: 'none', stroke: skin.hi, 'stroke-width': 1.5, opacity: .8 }));
  } else {
    svg.append(node('circle', { cx, cy, r, fill: `url(#${uid})` }));
  }

  // стена в выбранной фактуре
  const wx = 8, wy = 58, ww = 100, wh = 8;
  if (skin.wall === 'segmented') {
    for (let i = 0; i < 4; i++) {
      svg.append(node('rect', {
        x: wx + i * 26, y: wy, width: 22, height: wh, rx: 3, fill: skin.mid,
      }));
    }
  } else if (skin.wall === 'striped') {
    svg.append(node('rect', { x: wx, y: wy, width: ww, height: wh, rx: 4, fill: skin.lo }));
    for (let i = 0; i < 10; i++) {
      svg.append(node('rect', { x: wx + 3 + i * 10, y: wy, width: 4, height: wh, fill: skin.hi }));
    }
  } else if (skin.wall === 'glow') {
    svg.append(node('rect', {
      x: wx, y: wy - 2, width: ww, height: wh + 4, rx: 6, fill: skin.mid, opacity: .3,
    }));
    svg.append(node('rect', { x: wx, y: wy, width: ww, height: wh, rx: 4, fill: skin.hi }));
  } else {
    svg.append(node('rect', { x: wx, y: wy, width: ww, height: wh, rx: 4, fill: skin.mid }));
  }

  return svg;
}
