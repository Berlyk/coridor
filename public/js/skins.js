/*
 * Косметика делится на три витрины:
 *   PAWNS   форма и цвет фишки
 *   WALLS   фактура и цвет стены
 *   BUNDLES готовые комплекты со скидкой
 *
 * Базовый набор «По стороне» бесплатный и красится от места на доске:
 * снизу красные, сверху белые, слева синие, справа жёлтые.
 */

/** Цвета мест: используются базовым набором и как запасной вариант. */
export const SEAT_COLORS = [
  { hi: '#f87171', mid: '#dc2626', lo: '#7f1d1d', glow: 'rgba(220,38,38,.55)', fg: '#fff' },
  { hi: '#ffffff', mid: '#d4d4d8', lo: '#71717a', glow: 'rgba(228,228,231,.45)', fg: '#18181b' },
  { hi: '#93c5fd', mid: '#3b82f6', lo: '#1e3a8a', glow: 'rgba(59,130,246,.55)', fg: '#fff' },
  { hi: '#fde68a', mid: '#f59e0b', lo: '#78350f', glow: 'rgba(245,158,11,.55)', fg: '#3b2006' },
];

const c = (hi, mid, lo, glow, fg) => ({ hi, mid, lo, glow, fg });

/* ------------------------------------------------------------------ *
 * Фишки
 * ------------------------------------------------------------------ */

export const PAWNS = [
  {
    id: 'classic', name: 'По стороне', price: 0, style: 'gloss', bySeat: true,
    hint: 'Базовая фишка. Снизу красная, сверху белая, по бокам синяя и жёлтая.',
    ...c('#f87171', '#dc2626', '#7f1d1d', 'rgba(220,38,38,.55)', '#fff'),
  },
  {
    id: 'frost', name: 'Иней', price: 150, style: 'gloss',
    hint: 'Ледяной шар с холодным бликом.',
    ...c('#e0f2fe', '#38bdf8', '#075985', 'rgba(56,189,248,.55)', '#082f49'),
  },
  {
    id: 'emerald', name: 'Изумруд', price: 220, style: 'ring',
    hint: 'Кольцо с пустым центром.',
    ...c('#a7f3d0', '#10b981', '#064e3b', 'rgba(16,185,129,.55)', '#022c22'),
  },
  {
    id: 'amethyst', name: 'Аметист', price: 320, style: 'gem',
    hint: 'Восьмигранная огранка вместо круга.',
    ...c('#ddd6fe', '#8b5cf6', '#4c1d95', 'rgba(139,92,246,.6)', '#fff'),
  },
  {
    id: 'sunset', name: 'Закат', price: 380, style: 'gloss',
    hint: 'Тёплый оранжевый с мягким ореолом.',
    ...c('#fed7aa', '#f97316', '#7c2d12', 'rgba(249,115,22,.6)', '#431407'),
  },
  {
    id: 'jade', name: 'Нефрит', price: 450, style: 'ring',
    hint: 'Бирюзовое кольцо с глубокой тенью.',
    ...c('#99f6e4', '#14b8a6', '#134e4a', 'rgba(20,184,166,.55)', '#042f2e'),
  },
  {
    id: 'coral', name: 'Коралл', price: 520, style: 'gem',
    hint: 'Розовая огранка с перламутром.',
    ...c('#fecdd3', '#f43f5e', '#881337', 'rgba(244,63,94,.6)', '#fff'),
  },
  {
    id: 'gold', name: 'Золото', price: 600, style: 'gem',
    hint: 'Тяжёлый золотой камень.',
    ...c('#fef9c3', '#eab308', '#713f12', 'rgba(234,179,8,.6)', '#422006'),
  },
  {
    id: 'neon', name: 'Неон', price: 720, style: 'core',
    hint: 'Ядро с вращающимся кольцом.',
    ...c('#f5d0fe', '#d946ef', '#701a75', 'rgba(217,70,239,.65)', '#fff'),
  },
  {
    id: 'ghost', name: 'Призрак', price: 860, style: 'ghost',
    hint: 'Полупрозрачная фишка, сквозь неё видно доску.',
    ...c('#f8fafc', '#94a3b8', '#334155', 'rgba(148,163,184,.6)', '#f8fafc'),
  },
  {
    id: 'magma', name: 'Магма', price: 1100, style: 'flame',
    hint: 'Градиент, который переливается сам по себе.',
    ...c('#fde047', '#f97316', '#991b1b', 'rgba(249,115,22,.7)', '#450a0a'),
  },
  {
    id: 'void', name: 'Бездна', price: 1500, style: 'core',
    hint: 'Чёрное ядро в фиолетовом ореоле.',
    ...c('#a78bfa', '#312e81', '#09090b', 'rgba(129,90,225,.7)', '#ede9fe'),
  },
  {
    id: 'aurora', name: 'Сияние', price: 1900, style: 'flame',
    hint: 'Северное сияние в одной фишке. Самая редкая.',
    ...c('#67e8f9', '#22c55e', '#1e3a8a', 'rgba(34,197,94,.7)', '#052e16'),
  },
];

/* ------------------------------------------------------------------ *
 * Стены
 * ------------------------------------------------------------------ */

export const WALLS = [
  {
    id: 'classic', name: 'По стороне', price: 0, tex: 'solid', bySeat: true,
    hint: 'Базовая стена в цвет вашего места.',
    ...c('#f87171', '#dc2626', '#991b1b', 'rgba(220,38,38,.55)', '#fff'),
  },
  {
    id: 'steel', name: 'Сталь', price: 120, tex: 'solid',
    hint: 'Холодный металл с ровным бликом.',
    ...c('#e2e8f0', '#94a3b8', '#334155', 'rgba(148,163,184,.5)', '#0f172a'),
  },
  {
    id: 'brick', name: 'Кирпич', price: 200, tex: 'segmented',
    hint: 'Кладка из отдельных блоков.',
    ...c('#fca5a5', '#b45309', '#5b2408', 'rgba(180,83,9,.55)', '#fff'),
  },
  {
    id: 'ice', name: 'Наледь', price: 260, tex: 'striped',
    hint: 'Полосатый лёд с прожилками.',
    ...c('#e0f2fe', '#38bdf8', '#0c4a6e', 'rgba(56,189,248,.55)', '#082f49'),
  },
  {
    id: 'moss', name: 'Изумрудная кладка', price: 340, tex: 'segmented',
    hint: 'Зелёные блоки с глубокими швами.',
    ...c('#a7f3d0', '#10b981', '#064e3b', 'rgba(16,185,129,.55)', '#022c22'),
  },
  {
    id: 'goldwall', name: 'Золотой слиток', price: 520, tex: 'glow',
    hint: 'Полированное золото со свечением.',
    ...c('#fef9c3', '#eab308', '#713f12', 'rgba(234,179,8,.65)', '#422006'),
  },
  {
    id: 'neonwall', name: 'Неоновая лента', price: 680, tex: 'striped',
    hint: 'Пульсирующие полосы кислотного цвета.',
    ...c('#f5d0fe', '#d946ef', '#701a75', 'rgba(217,70,239,.7)', '#fff'),
  },
  {
    id: 'obsidian', name: 'Обсидиан', price: 900, tex: 'segmented',
    hint: 'Чёрное стекло с фиолетовым отблеском.',
    ...c('#a78bfa', '#312e81', '#09090b', 'rgba(129,90,225,.65)', '#ede9fe'),
  },
  {
    id: 'plasma', name: 'Плазма', price: 1200, tex: 'glow',
    hint: 'Светящийся барьер, который видно издалека.',
    ...c('#cffafe', '#06b6d4', '#164e63', 'rgba(6,182,212,.75)', '#062c33'),
  },
  {
    id: 'lava', name: 'Лава', price: 1600, tex: 'glow',
    hint: 'Раскалённый камень с оранжевым нутром.',
    ...c('#fde047', '#ea580c', '#7f1d1d', 'rgba(234,88,12,.75)', '#450a0a'),
  },
];

/* ------------------------------------------------------------------ *
 * Комплекты
 * ------------------------------------------------------------------ */

export const BUNDLES = [
  { id: 'set-frost', name: 'Ледник', pawn: 'frost', wall: 'ice', price: 340,
    hint: 'Иней и наледь. Всё в холодных тонах.' },
  { id: 'set-emerald', name: 'Изумрудный сад', pawn: 'emerald', wall: 'moss', price: 480,
    hint: 'Кольцо и зелёная кладка.' },
  { id: 'set-gold', name: 'Королевский', pawn: 'gold', wall: 'goldwall', price: 950,
    hint: 'Золотая огранка и золотые барьеры.' },
  { id: 'set-neon', name: 'Неоновый город', pawn: 'neon', wall: 'neonwall', price: 1180,
    hint: 'Ядро с орбитой и пульсирующие ленты.' },
  { id: 'set-void', name: 'Бездна', pawn: 'void', wall: 'obsidian', price: 2050,
    hint: 'Чёрное ядро и обсидиановые стены.' },
  { id: 'set-magma', name: 'Вулкан', pawn: 'magma', wall: 'lava', price: 2300,
    hint: 'Живой градиент и раскалённые барьеры.' },
];

export const PAWN_BY_ID = Object.fromEntries(PAWNS.map((s) => [s.id, s]));
export const WALL_BY_ID = Object.fromEntries(WALLS.map((s) => [s.id, s]));
export const BUNDLE_BY_ID = Object.fromEntries(BUNDLES.map((s) => [s.id, s]));

/** Полная цена комплекта по отдельности. */
export function bundleFull(b) {
  return (PAWN_BY_ID[b.pawn]?.price || 0) + (WALL_BY_ID[b.wall]?.price || 0);
}

/* ------------------------------------------------------------------ *
 * Разрешение цветов
 * ------------------------------------------------------------------ */

function withSeat(skin, seat) {
  if (!skin.bySeat) return skin;
  const p = SEAT_COLORS[seat % SEAT_COLORS.length];
  return { ...skin, ...p };
}

export function pawnSkin(id, seat = 0) {
  return withSeat(PAWN_BY_ID[id] || PAWN_BY_ID.classic, seat);
}

export function wallSkin(id, seat = 0) {
  return withSeat(WALL_BY_ID[id] || WALL_BY_ID.classic, seat);
}

/** Выставить переменные скина на элемент. */
export function paintSkin(el, skin) {
  el.style.setProperty('--sk-hi', skin.hi);
  el.style.setProperty('--sk-mid', skin.mid);
  el.style.setProperty('--sk-lo', skin.lo);
  el.style.setProperty('--sk-glow', skin.glow);
  el.style.setProperty('--sk-fg', skin.fg);
  return el;
}

/* ------------------------------------------------------------------ *
 * Превью
 * ------------------------------------------------------------------ */

const NS = 'http://www.w3.org/2000/svg';

function node(tag, attrs) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function gradient(svg, skin, uid) {
  const defs = node('defs', {});
  const g = node('radialGradient', { id: uid, cx: '34%', cy: '28%', r: '75%' });
  g.append(node('stop', { offset: '0%', 'stop-color': skin.hi }));
  g.append(node('stop', { offset: '45%', 'stop-color': skin.mid }));
  g.append(node('stop', { offset: '100%', 'stop-color': skin.lo }));
  defs.append(g);
  svg.append(defs);
  return `url(#${uid})`;
}

function drawPawn(svg, skin, cx, cy, r, uid) {
  const fill = gradient(svg, skin, uid);
  if (skin.style === 'gem') {
    const pts = [];
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI / 4) * i - Math.PI / 8;
      pts.push(`${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`);
    }
    svg.append(node('polygon', { points: pts.join(' '), fill }));
  } else if (skin.style === 'ring') {
    svg.append(node('circle', { cx, cy, r: r - 3, fill: 'none', stroke: fill, 'stroke-width': 7 }));
  } else if (skin.style === 'core') {
    svg.append(node('circle', { cx, cy, r, fill: 'none', stroke: skin.hi, 'stroke-width': 2, opacity: .6 }));
    svg.append(node('circle', { cx, cy, r: r - 7, fill }));
  } else if (skin.style === 'ghost') {
    svg.append(node('circle', { cx, cy, r, fill, opacity: .5 }));
    svg.append(node('circle', { cx, cy, r, fill: 'none', stroke: skin.hi, 'stroke-width': 1.5, opacity: .85 }));
  } else if (skin.style === 'flame') {
    svg.append(node('circle', { cx, cy, r, fill }));
    svg.append(node('circle', { cx, cy, r: r * .55, fill: skin.hi, opacity: .55 }));
  } else {
    svg.append(node('circle', { cx, cy, r, fill }));
  }
}

function drawWall(svg, skin, x, y, w, hgt) {
  if (skin.tex === 'segmented') {
    const n = 4;
    const step = w / n;
    for (let i = 0; i < n; i++) {
      svg.append(node('rect', {
        x: x + i * step, y, width: step - 4, height: hgt, rx: 3, fill: skin.mid,
      }));
    }
  } else if (skin.tex === 'striped') {
    svg.append(node('rect', { x, y, width: w, height: hgt, rx: 4, fill: skin.lo }));
    for (let i = 0; i * 10 < w - 4; i++) {
      svg.append(node('rect', { x: x + 3 + i * 10, y, width: 4, height: hgt, fill: skin.hi }));
    }
  } else if (skin.tex === 'glow') {
    svg.append(node('rect', { x: x - 3, y: y - 3, width: w + 6, height: hgt + 6, rx: 7, fill: skin.mid, opacity: .35 }));
    svg.append(node('rect', { x, y, width: w, height: hgt, rx: 4, fill: skin.hi }));
  } else {
    svg.append(node('rect', { x, y, width: w, height: hgt, rx: 4, fill: skin.mid }));
    svg.append(node('rect', { x, y, width: w, height: 2, rx: 1, fill: skin.hi, opacity: .7 }));
  }
}

function frame(vb = '0 0 120 76') {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', vb);
  svg.setAttribute('width', '100%');
  svg.style.display = 'block';
  return svg;
}

function board(svg, cols = 2, rows = 1) {
  for (let r = 0; r < rows; r++) {
    for (let cc = 0; cc < cols; cc++) {
      svg.append(node('rect', {
        x: 8 + cc * 52, y: 8 + r * 52, width: 44, height: 44, rx: 8,
        fill: '#1e1e23', stroke: 'rgba(255,255,255,.05)',
      }));
    }
  }
}

/** Превью фишки. */
export function pawnPreview(skin) {
  const svg = frame('0 0 120 66');
  board(svg, 2, 1);
  drawPawn(svg, skin, 30, 30, 16, 'pv-' + skin.id);
  if (skin.bySeat) {
    drawPawn(svg, { ...skin, ...SEAT_COLORS[1] }, 82, 30, 16, 'pv2-' + skin.id);
  }
  return svg;
}

/** Превью стены. */
export function wallPreview(skin) {
  const svg = frame('0 0 120 66');
  board(svg, 2, 1);
  drawWall(svg, skin, 8, 27, 96, 10);
  return svg;
}

/** Превью комплекта: фишка и стена вместе. */
export function bundlePreview(bundle) {
  const p = pawnSkin(bundle.pawn);
  const w = wallSkin(bundle.wall);
  const svg = frame('0 0 120 100');
  board(svg, 2, 1);
  drawPawn(svg, p, 30, 30, 16, 'bp-' + bundle.id);
  drawWall(svg, w, 8, 62, 96, 10);
  svg.append(node('rect', { x: 8, y: 80, width: 44, height: 12, rx: 4, fill: 'transparent' }));
  return svg;
}
