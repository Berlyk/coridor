/* Раздел «Разработка»: сборка, список релизов, отчёт об ошибке. */

import { h, clear, icon, modal, copyText, toast } from '../ui.js';

export const BUILD = 'Beta 0.3';
const REPO = 'https://github.com/Berlyk/coridor';
const PER_PAGE = 2;

const RELEASES = [
  {
    version: 'Beta 0.3',
    date: '29.08.2026',
    title: 'Новые режимы, игровая валюта и магазин',
    items: [
      'Добавлен режим «Трое»: три фишки на доске, каждый сам за себя.',
      'Добавлен режим «Каждый сам за себя» на четырёх игроков.',
      'Добавлен командный режим 2 на 2: партнёры стоят напротив друг друга.',
      'Добавлен режим 2 на 1: одиночка ходит дважды за ход и получает вдвое больше стен.',
      'Добавлена игровая валюта «стены», она начисляется за каждую сыгранную партию.',
      'Магазин переведён на валюту, скины теперь меняют форму фишки и фактуру стены.',
      'Скин виден соперникам: он передаётся вместе с профилем в комнату.',
      'Переписан звук: компрессор, небольшая комната и отдельные огибающие для каждого события.',
      'Доска научилась поворачиваться под любое из четырёх мест.',
      'Улучшена синхронизация: клиент замечает пропущенное сообщение и запрашивает состояние заново.',
      'Добавлены Политика конфиденциальности, Пользовательское соглашение и Публичная оферта.',
      'Убраны кнопки готовности и занятия места: игроки рассаживаются автоматически.',
      'Вход по коду убран из лобби, приглашение отправляется ссылкой.',
      'В настройки партии добавлены короткие таймеры от 5 секунд.',
      'Переработана мобильная вёрстка на всех экранах.',
    ],
  },
  {
    version: 'Beta 0.2',
    date: '28.08.2026',
    title: 'Магазин, раздел разработки и правки управления',
    items: [
      'Добавлен магазин скинов и раздел «Разработка».',
      'Разделы «Быстрый вход» и «Открытые комнаты» переехали под навигацию.',
      'Угол стены перестал зависеть от положения курсора, поворот только по R.',
      'Убрана подсказка о длине маршрута при наведении на паз.',
      'Убрана история ходов из боковой панели.',
      'Исправлено переполнение подсказок и правил на узких экранах.',
    ],
  },
  {
    version: 'Beta 0.1',
    date: '28.08.2026',
    title: 'Первый запуск',
    items: [
      'Полные правила Quoridor: ходы, прыжки, диагонали, запрет полного перекрытия пути.',
      'Онлайн-лобби с комнатами, приватным доступом, наблюдателями и чатом.',
      'Четыре уровня ботов от жадной эвристики до перебора на шесть полуходов.',
      'Анимация постройки стены с ударной волной, пылью и тряской доски.',
      'Возврат в партию в течение 45 секунд после обрыва связи.',
    ],
  },
];

export function renderDev(mount) {
  let page = 0;
  const pages = Math.ceil(RELEASES.length / PER_PAGE);
  const list = h('div', { class: 'stack' });
  const pager = h('div', { class: 'pager' });

  mount.append(h('div', { class: 'wrap wrap--narrow stack stack--lg' },
    h('div', { class: 'card card--pad build-card' },
      h('div', { class: 'build-badge' },
        h('div', { class: 'eyebrow' }, 'build'),
        h('div', { class: 'build-badge__value' }, BUILD)),
      h('button', { class: 'btn btn--ghost', onClick: reportBug },
        icon('info', 16), 'Сообщить о баге')),
    list,
    pager));

  paint();

  function paint() {
    clear(list);
    const slice = RELEASES.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);
    for (const r of slice) {
      list.append(h('article', { class: 'card card--pad release' },
        h('div', { class: 'hstack hstack--wrap' },
          h('div', { class: 'row__main' },
            h('h3', { class: 'release__title' }, `Релиз ${r.version}: ${r.title}`)),
          h('span', { class: 'badge' }, r.date)),
        h('div', { class: 'release__version' }, `Версия: ${r.version}`),
        h('ul', { class: 'release__list' },
          r.items.map((t) => h('li', {}, t)))));
    }

    clear(pager);
    pager.append(
      h('button', {
        class: 'btn btn--sm btn--ghost', disabled: page === 0,
        onClick: () => { page = Math.max(0, page - 1); paint(); },
      }, '< Пред.'),
      h('span', { class: 'dim-2' }, `Страница ${page + 1} из ${pages}`),
      h('button', {
        class: 'btn btn--sm btn--ghost', disabled: page >= pages - 1,
        onClick: () => { page = Math.min(pages - 1, page + 1); paint(); },
      }, 'След. >'));
  }

  async function reportBug() {
    const info = [
      `Сборка: ${BUILD}`,
      `Экран: ${window.innerWidth}x${window.innerHeight}`,
      `Браузер: ${navigator.userAgent}`,
    ].join('\n');

    await modal({
      title: 'Сообщить о баге',
      sub: 'Опишите, что пошло не так, и приложите эти данные',
      body: h('div', { class: 'stack stack--lg' },
        h('p', { class: 'dim' },
          'Ошибки принимаются в issues репозитория. Опишите, что вы делали, '
          + 'что ожидали увидеть и что произошло на самом деле.'),
        h('pre', { class: 'code-block' }, info),
        h('div', { class: 'hstack hstack--wrap' },
          h('button', {
            class: 'btn btn--ghost btn--sm',
            onClick: async () => {
              if (await copyText(info)) toast('Данные скопированы', 'ok');
            },
          }, icon('copy', 14), 'Скопировать данные'),
          h('a', {
            class: 'btn btn--primary btn--sm',
            href: `${REPO}/issues/new`,
            target: '_blank', rel: 'noopener noreferrer',
          }, icon('share', 14), 'Открыть issues'))),
      actions: [{ label: 'Закрыть', class: 'btn--ghost', value: true }],
    });
  }

  return { destroy() {} };
}
