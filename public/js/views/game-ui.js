/* Общие блоки игрового экрана: карточки игроков, чат, панели. */

import { h, clear, icon, initials, fmtClock } from '../ui.js';

export class PlayerCard {
  constructor(seat) {
    this.seat = seat;
    this.avatar = h('div', { class: `avatar ${seat === 1 ? 'avatar--silver' : ''}` }, '?');
    this.name = h('div', { class: 'pcard__name' });
    this.meta = h('div', { class: 'pcard__meta' });
    this.clock = h('div', { class: 'pcard__clock' });
    this.bar = h('div', { class: 'wallbar' });
    this.el = h('div', { class: `pcard pcard--p${seat}` },
      this.avatar,
      h('div', { class: 'row__main' }, this.name, this.meta, this.bar),
      this.clock);
  }

  update(o = {}) {
    const name = o.name || '—';
    this.avatar.textContent = initials(name);
    clear(this.name);
    this.name.append(name);
    if (o.isMe) this.name.append(h('span', { class: 'badge' }, 'вы'));
    if (o.isHost) this.name.append(h('span', { class: 'badge badge--red-soft' }, 'хост'));
    if (o.connected === false) this.name.append(h('span', { class: 'badge badge--warn' }, 'нет связи'));
    if (o.isBot) this.name.append(h('span', { class: 'badge' }, 'бот'));

    this.meta.textContent = o.sub || '';
    this.el.classList.toggle('is-turn', !!o.isTurn);

    if (o.clockMs === null || o.clockMs === undefined) {
      this.clock.textContent = '';
      this.clock.classList.remove('is-low');
    } else {
      this.clock.textContent = fmtClock(o.clockMs);
      this.clock.classList.toggle('is-low', o.clockMs < 10000 && o.isTurn);
    }

    const max = o.wallsMax ?? 10;
    const left = o.walls ?? 0;
    if (this.bar.children.length !== max) {
      clear(this.bar);
      for (let i = 0; i < max; i++) this.bar.append(h('i'));
    }
    [...this.bar.children].forEach((n, i) => {
      const on = i < left;
      n.classList.toggle('is-on', on);
      n.classList.toggle('is-spent', !on);
    });
  }
}

export class Chat {
  constructor(onSend) {
    this.list = h('div', { class: 'chat__list' });
    this.input = h('input', { class: 'input', maxlength: 240, placeholder: 'Сообщение…' });
    this.form = h('form', {
      class: 'chat__form',
      onSubmit: (e) => {
        e.preventDefault();
        const text = this.input.value.trim();
        if (!text) return;
        onSend(text);
        this.input.value = '';
      },
    }, this.input, h('button', { class: 'btn btn--icon btn--ghost', type: 'submit' }, icon('send')));
    this.el = h('div', { class: 'chat' }, this.list, this.form);
    this.seen = new Set();
  }

  update(messages) {
    clear(this.list);
    for (const m of messages || []) this.list.append(this.node(m));
    this.list.scrollTop = this.list.scrollHeight;
  }

  push(m) {
    if (this.seen.has(m.id)) return false;
    this.seen.add(m.id);
    this.list.append(this.node(m));
    this.list.scrollTop = this.list.scrollHeight;
    return true;
  }

  node(m) {
    if (m.sys) return h('div', { class: 'chat__msg is-sys' }, m.text);
    return h('div', { class: 'chat__msg' },
      h('span', { class: `chat__from ${m.seat === 0 ? 'p0' : m.seat === 1 ? 'p1' : ''}` }, m.from + ':'),
      m.text);
  }
}

export function panel(title, body, extra) {
  return h('div', { class: 'card card--pad', style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
    h('div', { class: 'hstack' },
      h('div', { class: 'eyebrow' }, title),
      h('div', { class: 'spacer' }),
      extra || null),
    body);
}

export function turnPill() {
  const dot = h('span', { class: 'turn-pill__dot' });
  const text = h('span', {});
  const el = h('div', { class: 'turn-pill' }, dot, text);
  return {
    el,
    set(label, mode) {
      text.textContent = label;
      el.className = 'turn-pill' + (mode ? ' is-' + mode : '');
    },
    thinking(label) {
      clear(text);
      text.append(label, h('span', { class: 'thinking', style: { marginLeft: '6px' } },
        h('i'), h('i'), h('i')));
      el.className = 'turn-pill is-thinking';
    },
  };
}

export function gameLayout(boardStage, side) {
  return h('div', { class: 'game-grid' }, boardStage, h('div', { class: 'side' }, ...side));
}
