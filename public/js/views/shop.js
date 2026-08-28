/* Магазин скинов: цвета фишек и стен, открываются за победы. */

import { h, clear, icon, toast, plural } from '../ui.js';
import { store } from '../store.js';
import { sfx } from '../sound.js';
import { SKINS, SKIN_BY_ID, applySkin, isUnlocked, totalWins } from '../skins.js';

export function renderShop(mount) {
  const wins = totalWins(store.stats);
  const grid = h('div', { class: 'skin-grid' });

  const head = h('div', { class: 'hstack hstack--wrap', style: { marginBottom: '22px' } },
    h('div', { class: 'row__main' },
      h('div', { class: 'eyebrow' }, 'Коллекция'),
      h('h2', { class: 'h1', style: { fontSize: 'clamp(30px,5vw,48px)', marginTop: '6px' } }, 'МАГАЗИН')),
    h('div', { class: 'card card--pad', style: { padding: '14px 18px', textAlign: 'right' } },
      h('div', { style: { fontSize: '26px', fontWeight: '900', lineHeight: '1' } }, String(wins)),
      h('div', { class: 'dim-2', style: { marginTop: '4px' } },
        plural(wins, 'победа', 'победы', 'побед') + ' всего')));

  const intro = h('p', { class: 'lead', style: { marginBottom: '20px', maxWidth: '58ch' } },
    'Скины меняют цвет фишек и стен на доске — и в партиях с ботом, и в онлайне. '
    + 'Новые наборы открываются за победы: каждая партия приближает следующий.');

  mount.append(h('div', { class: 'wrap' }, head, intro, grid));

  paint();

  function paint() {
    clear(grid);
    const current = store.skin;
    for (const skin of SKINS) {
      const open = isUnlocked(skin, store.stats);
      const active = skin.id === current;
      const left = Math.max(0, (skin.unlock || 0) - wins);

      grid.append(h('div', {
        class: `skin-card ${active ? 'is-active' : ''} ${open ? '' : 'is-locked'}`,
      },
        preview(skin),
        h('div', { class: 'hstack', style: { marginTop: '14px' } },
          h('div', { class: 'row__main' },
            h('div', { class: 'h3' }, skin.name),
            h('div', { class: 'tile__v' }, skin.hint)),
          active ? h('span', { class: 'badge badge--red' }, icon('check', 12), 'надет') : null),
        h('div', { style: { marginTop: '14px' } },
          open
            ? h('button', {
                class: `btn btn--sm btn--block ${active ? 'btn--outline' : 'btn--primary'}`,
                disabled: active,
                onClick: () => choose(skin),
              }, active ? 'Выбран' : 'Надеть')
            : h('div', { class: 'skin-lock' },
                icon('lock', 14),
                h('span', {}, `ещё ${left} ${plural(left, 'победа', 'победы', 'побед')}`)))));
    }
  }

  function choose(skin) {
    store.skin = skin.id;
    applySkin(skin.id);
    sfx.notify();
    toast(`Скин «${skin.name}» надет`, 'ok');
    window.dispatchEvent(new CustomEvent('coridor:skin'));
    paint();
  }

  return { destroy() {} };
}

/* ------------------------------------------------------------------ */

/** Мини-доска 3×3 с фишками и стеной в цветах скина. */
function preview(skin) {
  const S = 34, G = 8, STEP = S + G;
  const size = 3 * S + 2 * G;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.style.display = 'block';
  svg.style.maxHeight = '150px';

  const node = (tag, attrs) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      svg.append(node('rect', {
        x: c * STEP, y: r * STEP, width: S, height: S, rx: 6,
        fill: '#1e1e23', stroke: 'rgba(255,255,255,.05)',
      }));
    }
  }

  for (const [seat, r, c] of [[0, 2, 1], [1, 0, 1]]) {
    const col = skin[`p${seat}`];
    const id = `g-${skin.id}-${seat}`;
    const grad = node('radialGradient', { id, cx: '32%', cy: '28%', r: '75%' });
    grad.append(node('stop', { offset: '0%', 'stop-color': col.hi }));
    grad.append(node('stop', { offset: '45%', 'stop-color': col.mid }));
    grad.append(node('stop', { offset: '100%', 'stop-color': col.lo }));
    const defs = node('defs', {});
    defs.append(grad);
    svg.append(defs);
    svg.append(node('circle', {
      cx: c * STEP + S / 2, cy: r * STEP + S / 2, r: S * 0.33,
      fill: `url(#${id})`,
    }));
  }

  // горизонтальная стена «красных» и вертикальная «белых»
  svg.append(node('rect', {
    x: 0, y: STEP - G, width: 2 * S + G, height: G, rx: 3, fill: skin.p0.mid,
  }));
  svg.append(node('rect', {
    x: 2 * STEP - G, y: STEP, width: G, height: 2 * S + G, rx: 3, fill: skin.p1.mid,
  }));

  return h('div', { class: 'skin-preview' }, svg);
}
