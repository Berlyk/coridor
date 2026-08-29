/* Магазин: скины персонажа покупаются за стены. */

import { h, clear, icon, toast, confirmDialog } from '../ui.js';
import { store } from '../store.js';
import { sfx } from '../sound.js';
import { fmt } from '../economy.js';
import { SKINS, skinPreview, paintSkin } from '../skins.js';

const STYLE_NAMES = {
  gloss: 'гладкая',
  ring: 'кольцо',
  gem: 'огранка',
  core: 'ядро с орбитой',
  ghost: 'полупрозрачная',
  flame: 'живой градиент',
};
const WALL_NAMES = {
  solid: 'сплошная стена',
  striped: 'стена в полоску',
  segmented: 'стена из блоков',
  glow: 'светящаяся стена',
};

export function renderShop(mount) {
  const grid = h('div', { class: 'skin-grid' });
  const balance = h('div', { class: 'coin-balance' });

  const head = h('div', { class: 'shop-head' },
    h('div', { class: 'row__main' },
      h('div', { class: 'eyebrow' }, 'Коллекция'),
      h('h2', { class: 'h1', style: { fontSize: 'clamp(28px,5vw,48px)', marginTop: '6px' } }, 'МАГАЗИН')),
    balance);

  const intro = h('p', { class: 'lead', style: { marginBottom: '20px', maxWidth: '62ch' } },
    'Скин меняет вашу фишку и стены, которые вы ставите. Он виден и вам, и соперникам '
    + 'в онлайн-партиях. Стены на покупку начисляются за каждую сыгранную партию: '
    + 'за победу больше, за поражение меньше.');

  mount.append(h('div', { class: 'wrap' }, head, intro, grid));

  paintBalance();
  paint();

  const onCoins = () => { paintBalance(); paint(); };
  window.addEventListener('coridor:coins', onCoins);

  function paintBalance() {
    clear(balance);
    balance.append(
      h('span', { class: 'coin-icon' }),
      h('div', {},
        h('div', { class: 'coin-balance__num' }, String(store.coins)),
        h('div', { class: 'dim-2' }, 'в кошельке')));
  }

  function paint() {
    clear(grid);
    const current = store.skin;
    for (const skin of SKINS) {
      const owned = store.has(skin.id);
      const active = skin.id === current;
      const affordable = store.coins >= skin.price;

      const card = h('div', {
        class: `skin-card ${active ? 'is-active' : ''} ${owned ? '' : 'is-locked'}`,
      },
        h('div', { class: 'skin-preview' }, skinPreview(skin)),
        h('div', { class: 'hstack', style: { marginTop: '14px' } },
          h('div', { class: 'row__main' },
            h('div', { class: 'h3' }, skin.name),
            h('div', { class: 'tile__v' }, skin.hint)),
          active ? h('span', { class: 'badge badge--red' }, icon('check', 12), 'надет') : null),
        h('div', { class: 'hstack hstack--wrap', style: { marginTop: '10px', gap: '6px' } },
          h('span', { class: 'badge' }, STYLE_NAMES[skin.style] || skin.style),
          h('span', { class: 'badge' }, WALL_NAMES[skin.wall] || skin.wall)),
        h('div', { style: { marginTop: '14px' } },
          owned
            ? h('button', {
                class: `btn btn--sm btn--block ${active ? 'btn--outline' : 'btn--primary'}`,
                disabled: active,
                onClick: () => wear(skin),
              }, active ? 'Выбран' : 'Надеть')
            : h('button', {
                class: `btn btn--sm btn--block ${affordable ? 'btn--primary' : 'btn--outline'}`,
                disabled: !affordable,
                onClick: () => buy(skin),
              }, h('span', { class: 'coin-icon coin-icon--sm' }), `${skin.price}`)));

      paintSkin(card, skin);
      grid.append(card);
    }
  }

  function wear(skin) {
    store.skin = skin.id;
    sfx.notify();
    toast(`Скин «${skin.name}» надет`, 'ok');
    window.dispatchEvent(new CustomEvent('coridor:skin'));
    paint();
  }

  async function buy(skin) {
    const ok = await confirmDialog(
      `Купить «${skin.name}»?`,
      `Спишется ${fmt(skin.price)}. Останется ${fmt(store.coins - skin.price)}.`,
      'Купить', false);
    if (!ok) return;
    if (!store.buy(skin.id, skin.price)) return toast('Не хватает стен', 'err');
    sfx.coin();
    toast(`«${skin.name}» куплен`, 'ok');
    wear(skin);
  }

  return {
    destroy() { window.removeEventListener('coridor:coins', onCoins); },
  };
}
