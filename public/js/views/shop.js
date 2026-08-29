/* Магазин: три витрины, фильтры и сортировка. */

import { h, clear, icon, toast, confirmDialog, wallCoin } from '../ui.js';
import { store } from '../store.js';
import { sfx } from '../sound.js';
import { fmt } from '../economy.js';
import {
  PAWNS, WALLS, BUNDLES, PAWN_BY_ID, WALL_BY_ID, bundleFull,
  pawnSkin, wallSkin, paintSkin, pawnPreview, wallPreview, bundlePreview,
} from '../skins.js';

const STYLE_NAMES = {
  gloss: 'гладкая',
  ring: 'кольцо',
  gem: 'огранка',
  core: 'ядро с орбитой',
  ghost: 'полупрозрачная',
  flame: 'живой градиент',
};
const TEX_NAMES = {
  solid: 'сплошная',
  striped: 'полосатая',
  segmented: 'из блоков',
  glow: 'светящаяся',
};

const TABS = [
  { id: 'pawns', label: 'Фишки', icon: 'step' },
  { id: 'walls', label: 'Стены', icon: 'wall' },
  { id: 'bundles', label: 'Комплекты', icon: 'crown' },
];

const FILTERS = [
  { id: 'all', label: 'Все' },
  { id: 'owned', label: 'Куплено' },
  { id: 'afford', label: 'По карману' },
  { id: 'locked', label: 'Не куплено' },
];

const SORTS = [
  { id: 'price-asc', label: 'Дешевле' },
  { id: 'price-desc', label: 'Дороже' },
  { id: 'name', label: 'По имени' },
];

export function renderShop(mount) {
  let tab = 'pawns';
  let filter = 'all';
  let sort = 'price-asc';

  const balanceNum = h('div', { class: 'coin-balance__num' }, String(store.coins));
  const balance = h('div', { class: 'coin-balance' },
    wallCoin(26),
    h('div', {},
      balanceNum,
      h('div', { class: 'dim-2' }, 'стен в кошельке')));

  const tabsBox = h('div', { class: 'seg' });
  const filterBox = h('div', { class: 'seg seg--sm' });
  const sortBox = h('div', { class: 'seg seg--sm' });
  const countLabel = h('span', { class: 'dim-2' }, '');
  const grid = h('div', { class: 'shop-grid' });

  mount.append(h('div', { class: 'wrap stack stack--lg' },
    h('div', { class: 'shop-head' },
      h('div', { class: 'row__main' },
        h('div', { class: 'eyebrow' }, 'Коллекция'),
        h('h2', { class: 'h1', style: { fontSize: 'clamp(28px,5vw,48px)', marginTop: '6px' } }, 'МАГАЗИН')),
      balance),
    h('div', { class: 'subnav' }, tabsBox),
    h('div', { class: 'shop-bar' },
      h('div', { class: 'shop-bar__group' },
        h('span', { class: 'eyebrow' }, 'Показать'), filterBox),
      h('div', { class: 'shop-bar__group' },
        h('span', { class: 'eyebrow' }, 'Сортировка'), sortBox),
      h('div', { class: 'spacer' }),
      countLabel),
    grid));

  paintTabs(); paintFilters(); paintSorts(); paint();

  const onCoins = () => { balanceNum.textContent = String(store.coins); paint(); };
  window.addEventListener('coridor:coins', onCoins);

  /* ---------------- панели управления ---------------- */

  function paintTabs() {
    clear(tabsBox);
    for (const t of TABS) {
      tabsBox.append(h('button', {
        class: `seg__btn ${tab === t.id ? 'is-active' : ''}`,
        onClick: () => { tab = t.id; paintTabs(); paint(); },
      }, icon(t.icon, 14), t.label));
    }
  }

  function paintFilters() {
    clear(filterBox);
    for (const f of FILTERS) {
      filterBox.append(h('button', {
        class: `seg__btn ${filter === f.id ? 'is-active' : ''}`,
        onClick: () => { filter = f.id; paintFilters(); paint(); },
      }, f.label));
    }
  }

  function paintSorts() {
    clear(sortBox);
    for (const s of SORTS) {
      sortBox.append(h('button', {
        class: `seg__btn ${sort === s.id ? 'is-active' : ''}`,
        onClick: () => { sort = s.id; paintSorts(); paint(); },
      }, s.label));
    }
  }

  /* ---------------- витрина ---------------- */

  function itemsFor() {
    if (tab === 'walls') {
      return WALLS.map((w) => ({
        kind: 'wall', id: w.id, name: w.name, hint: w.hint, price: w.price,
        owned: store.hasWall(w.id), active: store.wall === w.id,
        tags: [TEX_NAMES[w.tex] || w.tex],
        skin: wallSkin(w.id, 0),
        preview: () => wallPreview(wallSkin(w.id, 0)),
      }));
    }
    if (tab === 'bundles') {
      return BUNDLES.map((b) => {
        const p = PAWN_BY_ID[b.pawn];
        const w = WALL_BY_ID[b.wall];
        const full = bundleFull(b);
        return {
          kind: 'bundle', id: b.id, name: b.name, hint: b.hint, price: b.price, full,
          owned: store.hasPawn(b.pawn) && store.hasWall(b.wall),
          active: store.pawn === b.pawn && store.wall === b.wall,
          tags: [p.name, w.name],
          parts: { pawn: b.pawn, wall: b.wall },
          skin: pawnSkin(b.pawn, 0),
          preview: () => bundlePreview(b),
        };
      });
    }
    return PAWNS.map((p) => ({
      kind: 'pawn', id: p.id, name: p.name, hint: p.hint, price: p.price,
      owned: store.hasPawn(p.id), active: store.pawn === p.id,
      tags: [STYLE_NAMES[p.style] || p.style],
      skin: pawnSkin(p.id, 0),
      preview: () => pawnPreview(pawnSkin(p.id, 0)),
    }));
  }

  function paint() {
    let items = itemsFor();

    if (filter === 'owned') items = items.filter((i) => i.owned);
    else if (filter === 'locked') items = items.filter((i) => !i.owned);
    else if (filter === 'afford') items = items.filter((i) => !i.owned && store.coins >= i.price);

    if (sort === 'price-asc') items.sort((a, b) => a.price - b.price);
    else if (sort === 'price-desc') items.sort((a, b) => b.price - a.price);
    else items.sort((a, b) => a.name.localeCompare(b.name, 'ru'));

    countLabel.textContent = items.length
      ? `${items.length} ${plural(items.length, 'предмет', 'предмета', 'предметов')}`
      : '';

    clear(grid);
    if (!items.length) {
      grid.append(h('div', { class: 'empty', style: { gridColumn: '1 / -1' } },
        'Здесь пусто. Смените фильтр или заработайте стен в партиях.'));
      return;
    }
    for (const it of items) grid.append(card(it));
  }

  function card(it) {
    const affordable = store.coins >= it.price;
    const el = h('div', { class: `shop-card ${it.active ? 'is-active' : ''} ${it.owned ? '' : 'is-locked'}` },
      h('div', { class: 'shop-card__preview' }, it.preview()),
      h('div', { class: 'shop-card__body' },
        h('div', { class: 'hstack' },
          h('div', { class: 'shop-card__name' }, it.name),
          it.active ? h('span', { class: 'badge badge--red' }, icon('check', 11), 'надет') : null),
        h('div', { class: 'shop-card__hint' }, it.hint),
        h('div', { class: 'shop-card__tags' },
          it.tags.map((t) => h('span', { class: 'badge' }, t)))),
      h('div', { class: 'shop-card__foot' },
        it.owned
          ? h('button', {
              class: `btn btn--sm btn--block ${it.active ? 'btn--outline' : 'btn--primary'}`,
              disabled: it.active,
              onClick: () => wear(it),
            }, it.active ? 'Выбран' : 'Надеть')
          : h('button', {
              class: `btn btn--sm btn--block ${affordable ? 'btn--primary' : 'btn--outline'}`,
              disabled: !affordable,
              onClick: () => buy(it),
            },
            h('span', { class: 'price' },
              wallCoin(13),
              h('b', {}, String(it.price)),
              it.full && it.full > it.price
                ? h('s', {}, String(it.full))
                : null),
            h('span', {}, affordable ? 'Купить' : 'Не хватает'))));
    paintSkin(el, it.skin);
    return el;
  }

  function wear(it) {
    if (it.kind === 'pawn') store.pawn = it.id;
    else if (it.kind === 'wall') store.wall = it.id;
    else { store.pawn = it.parts.pawn; store.wall = it.parts.wall; }
    sfx.notify();
    toast(`«${it.name}» надет`, 'ok');
    window.dispatchEvent(new CustomEvent('coridor:skin'));
    paint();
  }

  async function buy(it) {
    const ok = await confirmDialog(
      `Купить «${it.name}»?`,
      `Спишется ${fmt(it.price)}. Останется ${fmt(store.coins - it.price)}.`,
      'Купить', false);
    if (!ok) return;
    if (!store.buy(it.kind, it.id, it.price, it.parts)) return toast('Не хватает стен', 'err');
    sfx.coin();
    toast(`«${it.name}» куплен`, 'ok');
    wear(it);
  }

  return {
    destroy() { window.removeEventListener('coridor:coins', onCoins); },
  };
}

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}
