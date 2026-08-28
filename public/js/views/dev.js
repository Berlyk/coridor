/* Раздел «Разработка»: из чего собрана игра, что уже готово и что впереди. */

import { h, icon } from '../ui.js';

const VERSION = '1.0.0';

const DONE = [
  ['Правила Quoridor', 'Доска 9×9, стены, прыжки и диагонали, запрет полного перекрытия пути'],
  ['Онлайн 1 на 1', 'Комнаты с кодом, приватные с паролем, наблюдатели, чат, реванш'],
  ['Боты', 'Четыре уровня: от жадной эвристики до перебора на шесть полуходов'],
  ['Анимации', 'Постройка стены с ударной волной и пылью, пружинные ходы фишки'],
  ['Переподключение', '45 секунд на возврат в партию после обрыва связи'],
  ['Быстрый подбор', 'Двое в очереди — сразу партия по минуте на ход'],
  ['Магазин скинов', 'Семь наборов цветов, открываются за победы'],
];

const NEXT = [
  ['Рейтинг', 'Общая таблица и очки за онлайн-партии'],
  ['Разбор партий', 'Перемотка ходов и оценка позиции ботом'],
  ['Турниры', 'Сетка на 4–16 игроков внутри лобби'],
  ['Игра на четверых', 'Классический режим Quoridor с четырьмя фишками и пятью стенами'],
  ['Профиль на сервере', 'Чтобы прогресс и скины не терялись при смене браузера'],
];

const STACK = [
  ['Сервер', 'Node.js без зависимостей: свой WebSocket по RFC 6455 и раздача статики'],
  ['Клиент', 'ES-модули без сборщика, вся анимация — CSS и Web Animations API'],
  ['Правила', 'Одно ядро на сервере и в браузере, сервер — источник истины'],
  ['Бот', 'Negamax с alpha-beta в Web Worker, чтобы интерфейс не подвисал'],
  ['Звук', 'WebAudio, синтез на лету — в проекте нет ни одного аудиофайла'],
];

export function renderDev(mount) {
  mount.append(h('div', { class: 'wrap stack stack--lg' },
    h('div', {},
      h('div', { class: 'eyebrow' }, `версия ${VERSION}`),
      h('h2', { class: 'h1', style: { fontSize: 'clamp(30px,5vw,48px)', marginTop: '6px' } }, 'РАЗРАБОТКА'),
      h('p', { class: 'lead', style: { marginTop: '14px', maxWidth: '60ch' } },
        'Коридор написан с нуля: ни игрового движка, ни фреймворка, ни одной npm-зависимости. '
        + 'Ниже — что уже работает, что в планах и как всё устроено внутри.')),

    h('div', { class: 'dev-grid' },
      block('Уже работает', 'check', DONE, 'ok'),
      block('В планах', 'zap', NEXT, 'warn')),

    h('div', { class: 'card card--pad' },
      h('div', { class: 'hstack', style: { marginBottom: '14px' } },
        icon('settings', 18),
        h('div', { class: 'h3' }, 'Как это устроено')),
      h('div', { class: 'stack' },
        STACK.map(([k, v]) => h('div', { class: 'row' },
          h('div', { class: 'row__main' },
            h('div', { class: 'row__title' }, k),
            h('div', { class: 'row__sub' }, v)))))),

    h('div', { class: 'card card--hero card--pad' },
      h('div', { class: 'hstack hstack--wrap' },
        h('div', { class: 'row__main' },
          h('div', { class: 'h3' }, 'Нашли баг или есть идея?'),
          h('div', { class: 'dim-2', style: { marginTop: '4px' } },
            'Пишите в issues репозитория — правки прилетают в игру без обновления клиента')),
        h('a', {
          class: 'btn btn--primary',
          href: 'https://github.com/Berlyk/coridor',
          target: '_blank',
          rel: 'noopener noreferrer',
        }, icon('share'), 'Открыть на GitHub')))));

  return { destroy() {} };
}

function block(title, ico, rows, badge) {
  return h('div', { class: 'card card--pad' },
    h('div', { class: 'hstack', style: { marginBottom: '14px' } },
      icon(ico, 18),
      h('div', { class: 'h3' }, title),
      h('div', { class: 'spacer' }),
      h('span', { class: `badge badge--${badge}` }, String(rows.length))),
    h('div', { class: 'stack stack--sm' },
      rows.map(([k, v]) => h('div', { class: 'tile' },
        h('div', { class: 'tile__k' }, k),
        h('div', { class: 'tile__v' }, v)))));
}
