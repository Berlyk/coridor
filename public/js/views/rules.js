/* Страница правил с мини-схемами. */

import { MODE_LIST, seatCount } from '/shared/quoridor.js';
import { h } from '../ui.js';

export function renderRules(mount) {
  mount.append(h('div', { class: 'wrap wrap--narrow stack stack--lg' },
    h('div', {},
      h('div', { class: 'eyebrow' }, 'Quoridor'),
      h('h2', { class: 'h1', style: { fontSize: 'clamp(28px,5vw,48px)', marginTop: '6px' } }, 'ПРАВИЛА'),
      h('p', { class: 'lead', style: { marginTop: '12px', maxWidth: '58ch' } },
        'Фишки идут навстречу друг другу по доске 9 на 9. Побеждает тот, кто первым '
        + 'доберётся до противоположного края. Мешать сопернику можно только стенами.')),

    section('Цель', diagGoal(),
      ['Красная фишка стартует внизу и должна попасть в любую клетку верхнего ряда.',
       'Белая стартует сверху и идёт в нижний ряд. В играх на троих и четверых добавляются левое и правое места.',
       'Достаточно попасть в любую клетку целевого ряда, колонка не важна.']),

    section('Ход', diagStep(),
      ['За ход делают одно из двух: передвигают фишку или ставят стену.',
       'Фишка ходит на одну клетку по вертикали или горизонтали, по диагонали нельзя.',
       'Стена между клетками полностью перекрывает переход.']),

    section('Стены', diagWall(),
      ['У каждого игрока свой запас стен, число зависит от режима.',
       'Стена занимает ровно два прохода и ставится в паз между рядами клеток.',
       'Стены не могут пересекаться и накладываться друг на друга.',
       'Главное ограничение: после постановки у каждого игрока должен остаться хотя бы один путь до своей цели. Полностью замуровать соперника нельзя.']),

    section('Прыжки', diagJump(),
      ['Если фишки стоят вплотную, можно перепрыгнуть соперника и встать сразу за ним.',
       'Если за соперником стена, край доски или ещё одна фишка, прыжок заменяется диагональным обходом.',
       'Диагональный ход возможен только в такой ситуации.']),

    panelBlock('Режимы', MODE_LIST.map((m) => ctrl(
      `${m.label}, ${seatCount(m.id)}`.replace(/, (\d)$/, ', $1 игрока').replace(', 4 игрока', ', 4 игроков'),
      m.hint))),

    panelBlock('Управление', [
      ctrl('Клик по клетке', 'ход фишкой, доступные клетки подсвечены точками'),
      ctrl('Наведение на паз', 'появляется призрак стены; красный контур значит, что так нельзя'),
      ctrl('R', 'поворот стены между горизонтальной и вертикальной, работает без курсора на доске'),
      ctrl('Первое касание', 'на телефоне прицеливает стену, второе ставит'),
      ctrl('Escape', 'снять прицел'),
    ]),

    panelBlock('Нотация', [
      ctrl('e2', 'ход фишкой на клетку e2, колонки от a до i слева направо, ряды от 1 до 9 снизу вверх'),
      ctrl('d3h', 'горизонтальная стена в пазу d3'),
      ctrl('f5v', 'вертикальная стена в пазу f5'),
    ])));

  return { destroy() {} };
}

/* ------------------------------------------------------------------ */

function section(title, diagram, points) {
  return h('div', { class: 'card card--pad' },
    h('div', { class: 'rule-row' },
      h('div', { style: { minWidth: '0' } },
        h('div', { class: 'h3', style: { marginBottom: '10px' } }, title),
        h('ul', { class: 'stack stack--sm' },
          points.map((p) => h('li', { class: 'rule-li' },
            h('span', { style: { color: 'var(--red)', flex: 'none' } }, '•'),
            h('span', { class: 'dim' }, p))))),
      h('div', { class: 'rule-diagram' }, diagram)));
}

function panelBlock(title, rows) {
  return h('div', { class: 'card card--pad' },
    h('div', { class: 'h3', style: { marginBottom: '12px' } }, title),
    h('div', { class: 'stack stack--sm' }, rows));
}

function ctrl(k, v) {
  return h('div', { class: 'tip' },
    h('span', { class: 'badge' }, k),
    h('span', { class: 'tip__text' }, v));
}

/* ---------------- мини-схемы ---------------- */

const S = 18;
const G = 5;
const STEP = S + G;
const SIZE = 5 * S + 4 * G;

function svg(...kids) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', `-6 -6 ${SIZE + 12} ${SIZE + 12}`);
  el.setAttribute('width', '170');
  el.setAttribute('height', '170');
  el.style.maxWidth = '100%';
  el.style.height = 'auto';
  for (const k of kids) el.append(k);
  return el;
}

function node(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function gridCells(highlight = []) {
  const out = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const hit = highlight.find((x) => x.r === r && x.c === c);
      out.push(node('rect', {
        x: c * STEP, y: r * STEP, width: S, height: S, rx: 3,
        fill: hit ? hit.fill : '#1e1e23',
        stroke: hit?.stroke || 'rgba(255,255,255,.05)',
        'stroke-width': 1,
      }));
    }
  }
  return out;
}

function pawn(r, c, color) {
  return node('circle', {
    cx: c * STEP + S / 2, cy: r * STEP + S / 2, r: S * 0.32,
    fill: color, stroke: 'rgba(0,0,0,.4)', 'stroke-width': 1,
  });
}

function wallH(r, c, color) {
  return node('rect', { x: c * STEP, y: r * STEP + S, width: 2 * S + G, height: G, rx: 2, fill: color });
}

function wallV(r, c, color) {
  return node('rect', { x: c * STEP + S, y: r * STEP, width: G, height: 2 * S + G, rx: 2, fill: color });
}

function arrow(r1, c1, r2, c2, color) {
  return node('line', {
    x1: c1 * STEP + S / 2, y1: r1 * STEP + S / 2,
    x2: c2 * STEP + S / 2, y2: r2 * STEP + S / 2,
    stroke: color, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-dasharray': '3 3',
  });
}

function diagGoal() {
  const red = { fill: 'rgba(220,38,38,.22)', stroke: 'rgba(220,38,38,.4)' };
  const white = { fill: 'rgba(228,228,231,.14)' };
  return svg(
    ...gridCells([
      { r: 0, c: 0, ...red }, { r: 0, c: 1, ...red }, { r: 0, c: 2, ...red },
      { r: 0, c: 3, ...red }, { r: 0, c: 4, ...red },
      { r: 4, c: 0, ...white }, { r: 4, c: 1, ...white }, { r: 4, c: 2, ...white },
      { r: 4, c: 3, ...white }, { r: 4, c: 4, ...white },
    ]),
    arrow(4, 2, 0, 2, 'rgba(248,113,113,.6)'),
    pawn(4, 2, '#dc2626'),
    pawn(0, 2, '#e4e4e7'));
}

function diagStep() {
  return svg(
    ...gridCells([
      { r: 1, c: 2, fill: 'rgba(255,255,255,.07)' },
      { r: 3, c: 2, fill: 'rgba(255,255,255,.07)' },
      { r: 2, c: 1, fill: 'rgba(255,255,255,.07)' },
      { r: 2, c: 3, fill: 'rgba(255,255,255,.07)' },
    ]),
    pawn(2, 2, '#dc2626'),
    node('circle', { cx: 2 * STEP + S / 2, cy: 1 * STEP + S / 2, r: 3, fill: '#f4f4f5' }),
    node('circle', { cx: 2 * STEP + S / 2, cy: 3 * STEP + S / 2, r: 3, fill: '#f4f4f5' }),
    node('circle', { cx: 1 * STEP + S / 2, cy: 2 * STEP + S / 2, r: 3, fill: '#f4f4f5' }),
    node('circle', { cx: 3 * STEP + S / 2, cy: 2 * STEP + S / 2, r: 3, fill: '#f4f4f5' }));
}

function diagWall() {
  return svg(
    ...gridCells(),
    wallH(1, 1, '#dc2626'),
    wallV(2, 2, '#e4e4e7'),
    pawn(1, 1, '#dc2626'),
    pawn(3, 3, '#e4e4e7'));
}

function diagJump() {
  return svg(
    ...gridCells([{ r: 0, c: 2, fill: 'rgba(255,255,255,.08)' }]),
    pawn(2, 2, '#dc2626'),
    pawn(1, 2, '#e4e4e7'),
    arrow(2, 2, 0, 2, 'rgba(248,113,113,.7)'),
    node('circle', { cx: 2 * STEP + S / 2, cy: 0 * STEP + S / 2, r: 3.5, fill: '#f87171' }));
}
