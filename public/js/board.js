/* Отрисовка доски, ввод и вся анимация. Доска умеет 2, 3 и 4 фишки. */

import {
  N, W, H, V,
  pawnMoves, checkWall, shortestPath, cellName, SEATS,
} from '/shared/quoridor.js';
import { h, clear } from './ui.js';
import { store } from './store.js';
import { sfx } from './sound.js';
import { pawnSkin, wallSkin, paintSkin } from './skins.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Насколько повернуть доску, чтобы моё место оказалось снизу. */
const SEAT_ROT = { 0: 0, 1: 2, 2: 3, 3: 1 };

export class Board {
  /**
   * @param {object} opts
   *   onMove(move)      пользователь сделал ход
   *   onIllegal(reason) попытка недопустимого хода
   *   onOrient(o)       сменился угол стены
   */
  constructor(opts = {}) {
    this.opts = opts;
    this.game = null;
    this.me = 0;              // индекс моего игрока в game.players
    this.rot = 0;             // поворот доски (0..3, по 90 градусов)
    this.interactive = false;
    this.legal = [];
    this.wallEls = new Map();
    this.pawnEls = [];
    this.hover = null;
    this.armed = null;
    this.prefOrient = H;
    this.cell = 0;
    this.gap = 0;
    this.lastMove = null;
    this.skins = [];
    this.wallSkins = [];
    this.chosenSkins = [];

    this.root = h('div', { class: 'board-frame' });
    this.board = h('div', { class: 'board' });
    this.root.append(this.board);

    this.layers = {
      cells: h('div', { class: 'b-layer' }),
      path: h('div', { class: 'b-layer b-path' }),
      walls: h('div', { class: 'b-layer walls-layer' }),
      moves: h('div', { class: 'b-layer moves-layer' }),
      pawns: h('div', { class: 'b-layer pawns-layer' }),
      ghost: h('div', { class: 'b-layer b-layer--over' }),
      fx: h('div', { class: 'b-layer fx-layer' }),
      hit: h('div', { class: 'b-layer hit-layer' }),
    };
    for (const el of Object.values(this.layers)) this.board.append(el);

    this._buildCells();
    this._bindInput();

    this._onResize = () => this._measure();
    window.addEventListener('resize', this._onResize);
    if (typeof ResizeObserver === 'function') {
      this.ro = new ResizeObserver(() => this._measure());
      this.ro.observe(this.board);
    }
  }

  mount(parent) {
    parent.append(this.root);
    this.refit();
    return this;
  }

  refit(tries = 24) {
    this._measure();
    if (this.cell > 0 || tries <= 0) return;
    clearTimeout(this._fitTimer);
    this._fitTimer = setTimeout(() => this.refit(tries - 1), 40);
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => this._measure());
  }

  destroy() {
    this.ro?.disconnect();
    clearTimeout(this._shakeTimer);
    clearTimeout(this._fitTimer);
    window.removeEventListener('keydown', this._onKey);
    window.removeEventListener('resize', this._onResize);
    this.root.remove();
  }

  /* ---------------- геометрия ---------------- */

  _measure() {
    const size = this.board.clientWidth;
    if (!size) return;
    const gap = clamp(Math.round(size * 0.023), 5, 15);
    const cell = (size - (N - 1) * gap) / N;
    if (Math.abs(cell - this.cell) < 0.01 && gap === this.gap) return;
    this.cell = cell;
    this.gap = gap;
    this.board.style.setProperty('--cell', cell + 'px');
    this.board.style.setProperty('--gap', gap + 'px');
    if (this.game) this._syncPath();
  }

  /** Клетка доски в экранные координаты. */
  _viewCell(r, c) {
    switch (this.rot) {
      case 1: return { r: c, c: N - 1 - r };
      case 2: return { r: N - 1 - r, c: N - 1 - c };
      case 3: return { r: N - 1 - c, c: r };
      default: return { r, c };
    }
  }

  /** Экранная клетка в координаты доски. */
  _invView(vr, vc) {
    switch (this.rot) {
      case 1: return { r: N - 1 - vc, c: vr };
      case 2: return { r: N - 1 - vr, c: N - 1 - vc };
      case 3: return { r: vc, c: N - 1 - vr };
      default: return { r: vr, c: vc };
    }
  }

  /** Паз стены в экранные координаты; при повороте на 90 меняется ориентация. */
  _viewWall(r, c, o) {
    switch (this.rot) {
      case 1: return { r: c, c: W - 1 - r, o: o === H ? V : H };
      case 2: return { r: W - 1 - r, c: W - 1 - c, o };
      case 3: return { r: W - 1 - c, c: r, o: o === H ? V : H };
      default: return { r, c, o };
    }
  }

  /** Экранная точка в координаты доски. */
  _boardPoint(x, y, size) {
    switch (this.rot) {
      case 1: return { x: y, y: size - x };
      case 2: return { x: size - x, y: size - y };
      case 3: return { x: size - y, y: x };
      default: return { x, y };
    }
  }

  /** Ориентация из экранной системы в систему доски. */
  _boardOrient(o) {
    return (this.rot % 2) ? (o === H ? V : H) : o;
  }

  /* ---------------- статические слои ---------------- */

  _buildCells() {
    const frag = document.createDocumentFragment();
    this.cellEls = [];
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const el = h('div', { class: 'cell', style: { '--r': r, '--c': c } });
        this.cellEls.push(el);
        frag.append(el);
      }
    }
    const coords = h('div', { class: 'b-coords' });
    for (let c = 0; c < N; c++) {
      coords.append(h('div', { class: 'b-coord b-coord--file', style: { '--c': c } }, ''));
    }
    for (let r = 0; r < N; r++) {
      coords.append(h('div', { class: 'b-coord b-coord--rank', style: { '--r': r } }, ''));
    }
    this.coords = coords;
    this.layers.cells.append(frag, coords);
    this._paintCoords();
  }

  _paintCoords() {
    for (const el of this.coords.children) {
      if (el.classList.contains('b-coord--file')) {
        const vc = Number(el.style.getPropertyValue('--c'));
        el.textContent = 'abcdefghi'[this._invView(N - 1, vc).c];
      } else {
        const vr = Number(el.style.getPropertyValue('--r'));
        el.textContent = String(N - this._invView(vr, 0).r);
      }
    }
  }

  _buildPawns(count) {
    clear(this.layers.pawns);
    this.pawnEls = [];
    for (let i = 0; i < count; i++) {
      const el = h('div', { class: 'pawn', style: { '--r': 0, '--c': 4 } },
        h('div', { class: 'pawn__body' }, h('span', { class: 'pawn__fx' })));
      this.pawnEls.push(el);
      this.layers.pawns.append(el);
    }
  }

  /**
   * Косметика каждого игрока: своя фишка и своя стена.
   * chosen приходит как [{pawn, wall}] по индексу игрока.
   */
  _resolveSkins(game, chosen = []) {
    const pawns = [];
    const walls = [];
    for (let i = 0; i < game.players.length; i++) {
      const seat = game.players[i].seat;
      const pick = chosen[i] || {};
      pawns.push(pawnSkin(pick.pawn, seat));
      walls.push(wallSkin(pick.wall, seat));
    }
    return { pawns, walls };
  }

  /* ---------------- обновление состояния ---------------- */

  /**
   * @param {object} game  состояние из shared/quoridor.js
   * @param {object} opts  {me, interactive, silent, lastMove, skins}
   */
  update(game, opts = {}) {
    const prev = this.game;
    const rebuilt = !prev || prev.players.length !== game.players.length
      || prev.mode !== game.mode;
    this.game = game;

    if (opts.me !== undefined && opts.me !== null) {
      const seat = game.players[opts.me]?.seat ?? 0;
      const rot = SEAT_ROT[seat] ?? 0;
      if (rot !== this.rot || this.me !== opts.me) {
        this.me = opts.me;
        this.rot = rot;
        this._paintCoords();
        this._resyncAllWalls();
      }
    }
    if (opts.interactive !== undefined) this.interactive = opts.interactive;
    if (opts.lastMove !== undefined) this.lastMove = opts.lastMove;
    if (opts.skins) this.chosenSkins = opts.skins;

    const resolved = this._resolveSkins(game, this.chosenSkins);
    this.skins = resolved.pawns;
    this.wallSkins = resolved.walls;
    if (rebuilt) this._buildPawns(game.players.length);

    this._measure();
    const silent = !!opts.silent || !store.animations;
    this._syncWalls(silent);
    this._syncPawns(prev, silent, rebuilt);
    this._syncCells();
    this._syncMoves();
    this._syncPath();
    this.layers.hit.classList.toggle('is-locked', !this.interactive);
    this.root.classList.toggle('is-myturn', !!this.interactive);
    if (!this.interactive) this._clearGhost();
  }

  _syncCells() {
    const last = this.lastMove;
    const goals = new Map();
    for (let i = 0; i < this.game.players.length; i++) {
      const p = this.game.players[i];
      const skin = this.skins[i];
      for (let k = 0; k < N; k++) {
        const key = p.goal.axis === 'row' ? `${p.goal.value}:${k}` : `${k}:${p.goal.value}`;
        goals.set(key, skin.mid);
      }
    }

    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const el = this.cellEls[r * N + c];
        const v = this._viewCell(r, c);
        el.style.setProperty('--r', v.r);
        el.style.setProperty('--c', v.c);
        const goal = goals.get(`${r}:${c}`);
        el.classList.toggle('is-goal', !!goal);
        if (goal) el.style.setProperty('--goal-color', goal);
        else el.style.removeProperty('--goal-color');
        el.classList.toggle('is-last', !!(last && last.type === 'move' && last.r === r && last.c === c));
      }
    }
  }

  _wallKey(w) { return `${w.o}:${w.r}:${w.c}`; }

  _syncWalls(silent) {
    const want = new Set();
    for (const w of this.game.wallList) {
      const key = this._wallKey(w);
      want.add(key);
      if (this.wallEls.has(key)) continue;
      const el = this._makeWall(w);
      this.wallEls.set(key, el);
      this.layers.walls.append(el);
      if (!silent) this._playWallFx(w, el);
    }
    for (const [key, el] of [...this.wallEls]) {
      if (want.has(key)) continue;
      el.remove();
      this.wallEls.delete(key);
    }
  }

  _resyncAllWalls() {
    for (const [key, el] of this.wallEls) {
      const [o, r, c] = key.split(':').map(Number);
      const v = this._viewWall(r, c, o);
      el.style.setProperty('--r', v.r);
      el.style.setProperty('--c', v.c);
      el.classList.toggle('wall--h', v.o === H);
      el.classList.toggle('wall--v', v.o === V);
    }
  }

  _makeWall(w) {
    const v = this._viewWall(w.r, w.c, w.o);
    const skin = this.wallSkins?.[w.by] || wallSkin('classic', 0);
    const el = h('div', {
      class: `wall wall--${v.o === H ? 'h' : 'v'} wall--tex-${skin.tex}`,
      style: { '--r': v.r, '--c': v.c },
    },
      h('div', { class: 'wall__glow' }),
      h('div', { class: 'wall__core' }),
      h('div', { class: 'wall__seam' }));
    return paintSkin(el, skin);
  }

  _syncPawns(prev, silent, rebuilt) {
    for (let i = 0; i < this.game.players.length; i++) {
      const p = this.game.players[i];
      const el = this.pawnEls[i];
      if (!el) continue;
      const skin = this.skins[i];
      const before = rebuilt ? null : prev?.players?.[i];
      const v = this._viewCell(p.r, p.c);
      const moved = before && (before.r !== p.r || before.c !== p.c);
      const dist = before ? Math.abs(before.r - p.r) + Math.abs(before.c - p.c) : 0;

      el.className = `pawn pawn--style-${skin.style}`;
      paintSkin(el, skin);
      el.style.setProperty('--r', v.r);
      el.style.setProperty('--c', v.c);
      el.classList.toggle('is-active', this.game.winner === null && this.game.turn === i);
      el.classList.toggle('is-me', i === this.me);
      el.classList.toggle('is-out', !p.active);
      el.classList.toggle('is-win', this.game.winnerSeat === i);

      if (moved && !silent) {
        el.classList.remove('is-hopping');
        void el.offsetWidth;
        if (dist > 1) {
          el.classList.add('is-hopping');
          sfx.hop();
          setTimeout(() => el.classList.remove('is-hopping'), 460);
        } else {
          sfx.step();
        }
        this._puff(p.r, p.c, skin);
      }
    }
  }

  _syncMoves() {
    const layer = clear(this.layers.moves);
    this.legal = [];
    if (!this.interactive || !this.game || this.game.winner !== null) return;
    this.legal = pawnMoves(this.game, this.game.turn);
    for (const m of this.legal) {
      const v = this._viewCell(m.r, m.c);
      layer.append(h('div', {
        class: `move-dot ${m.jump ? 'is-jump' : ''}`,
        style: { '--r': v.r, '--c': v.c },
        title: cellName(m.r, m.c),
        onClick: (e) => { e.stopPropagation(); this._commit({ type: 'move', r: m.r, c: m.c }); },
      }));
    }
  }

  _syncPath() {
    const layer = clear(this.layers.path);
    if (!store.showPath || !this.game || this.game.winner !== null || !this.cell) return;
    const idx = this.interactive ? this.game.turn : this.me;
    const path = shortestPath(this.game, idx);
    if (!path || path.length < 2) return;
    const step = this.cell + this.gap;
    const half = this.cell / 2;
    const pts = path.map(({ r, c }) => {
      const v = this._viewCell(r, c);
      return `${v.c * step + half},${v.r * step + half}`;
    });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', 'M' + pts.join(' L'));
    p.setAttribute('stroke', (this.skins[idx] || pawnSkin('classic', 0)).hi);
    svg.append(p);
    layer.append(svg);
  }

  /* ---------------- ввод ---------------- */

  _bindInput() {
    const hit = this.layers.hit;

    hit.addEventListener('pointermove', (e) => {
      if (!this.interactive) return;
      if (e.pointerType === 'touch') return;
      this._updateHover(e);
    });

    hit.addEventListener('pointerleave', () => {
      if (this.armed) return;
      this._clearGhost();
    });

    hit.addEventListener('pointerdown', (e) => {
      if (!this.interactive) return;
      if (e.button === 2) return;
      const target = this._targetFromEvent(e);
      if (!target) return;

      if (target.kind === 'cell') {
        const ok = this.legal.some((m) => m.r === target.r && m.c === target.c);
        if (ok) this._commit({ type: 'move', r: target.r, c: target.c });
        else if (e.pointerType !== 'touch') this._clearGhost();
        return;
      }

      if (e.pointerType === 'touch') {
        this._updateHover(e);
        const same = this.armed
          && this.armed.r === target.r && this.armed.c === target.c && this.armed.o === target.o;
        if (!same) {
          this.armed = { ...target };
          this.ghostEl?.classList.add('is-armed');
          return;
        }
      }
      const chk = checkWall(this.game, this.game.turn, target.r, target.c, target.o);
      if (!chk.ok) {
        sfx.deny();
        this.opts.onIllegal?.(chk.message);
        this._bumpGhost();
        return;
      }
      this._commit({ type: 'wall', r: target.r, c: target.c, o: target.o });
    });

    hit.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this._flipOrient();
    });

    hit.addEventListener('wheel', (e) => {
      if (!this.interactive) return;
      e.preventDefault();
      this._flipOrient();
    }, { passive: false });

    this._onKey = (e) => {
      if (!this.interactive) return;
      if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') {
        e.preventDefault();
        this._flipOrient();
      }
      if (e.key === 'Escape') { this.armed = null; this._clearGhost(); }
    };
    window.addEventListener('keydown', this._onKey);
  }

  /** Повернуть стену. Призрак перерисовывается сразу. */
  _flipOrient() {
    this.prefOrient = this.prefOrient === H ? V : H;
    this.opts.onOrient?.(this.prefOrient);
    if (this.hover && this.hover.kind === 'wall') {
      this.hover = { ...this.hover, o: this._boardOrient(this.prefOrient) };
      this._showGhost(this.hover);
    }
    return this.prefOrient;
  }

  toggleOrientation() { return this._flipOrient(); }
  get orientation() { return this.prefOrient; }

  _targetFromEvent(e) {
    const rect = this.board.getBoundingClientRect();
    const size = rect.width;
    if (!size) return null;
    const pt = this._boardPoint(e.clientX - rect.left, e.clientY - rect.top, size);
    return this._targetAt(pt.x, pt.y);
  }

  /**
   * Что под курсором. Угол стены задаёт только игрок (R, ПКМ, колесо),
   * от положения курсора он не зависит.
   */
  _targetAt(x, y) {
    const step = this.cell + this.gap;
    const col = clamp(Math.floor(x / step), 0, N - 1);
    const row = clamp(Math.floor(y / step), 0, N - 1);
    const rx = x - col * step;
    const ry = y - row * step;
    const pad = Math.min(7, this.gap * 0.7);
    const inV = col < N - 1 && rx > this.cell - pad;
    const inH = row < N - 1 && ry > this.cell - pad;

    if (!inV && !inH) return { kind: 'cell', r: row, c: col };

    const o = this._boardOrient(this.prefOrient);
    const c = clamp(Math.round((x - this.cell - this.gap / 2) / step), 0, W - 1);
    const r = clamp(Math.round((y - this.cell - this.gap / 2) / step), 0, W - 1);
    return { kind: 'wall', o, r, c };
  }

  _updateHover(e) {
    this._lastEvent = e;
    const target = this._targetFromEvent(e);
    if (!target) return;
    const same = this.hover
      && this.hover.kind === target.kind
      && this.hover.r === target.r && this.hover.c === target.c
      && this.hover.o === target.o;
    if (same) return;
    this.hover = target;
    this.armed = null;

    if (target.kind !== 'wall') { this._clearGhost(); return; }
    this._showGhost(target);
  }

  _showGhost(target) {
    const g = this.game;
    if (!g) return;
    const seat = g.turn;
    const chk = checkWall(g, seat, target.r, target.c, target.o);
    const v = this._viewWall(target.r, target.c, target.o);
    const skin = this.wallSkins?.[seat] || wallSkin('classic', 0);

    if (!this.ghostEl) {
      this.ghostEl = h('div', { class: 'wall wall--ghost' }, h('div', { class: 'wall__core' }));
      this.layers.ghost.append(this.ghostEl);
    }
    const el = this.ghostEl;
    el.className = `wall wall--ghost wall--${v.o === H ? 'h' : 'v'} ${chk.ok ? 'is-ok' : 'is-bad'}`;
    el.style.setProperty('--r', v.r);
    el.style.setProperty('--c', v.c);
    el.style.setProperty('--g-color', chk.ok ? skin.hi : '#ef4444');

    const reason = g.players[seat].walls <= 0
      ? 'Стены закончились'
      : (chk.ok ? null : chk.message);
    if (!reason) { this.tagEl?.remove(); this.tagEl = null; return; }

    if (!this.tagEl) {
      this.tagEl = h('div', { class: 'ghost-tag is-bad' });
      this.layers.ghost.append(this.tagEl);
    }
    const step = this.cell + this.gap;
    this.tagEl.textContent = reason;
    this.tagEl.style.left = (v.c * step + this.cell + this.gap / 2) + 'px';
    this.tagEl.style.top = (v.r * step + this.cell + this.gap / 2 - this.cell * 0.55) + 'px';
  }

  _clearGhost() {
    this.ghostEl?.remove();
    this.tagEl?.remove();
    this.ghostEl = null;
    this.tagEl = null;
    this.hover = null;
    this.armed = null;
  }

  _bumpGhost() {
    if (!this.ghostEl) return;
    this.ghostEl.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-3px)' },
       { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }],
      { duration: 220, easing: 'ease-in-out' });
  }

  _commit(move) {
    this._clearGhost();
    this.opts.onMove?.(move);
  }

  /* ---------------- эффекты ---------------- */

  shake() {
    this.board.classList.remove('is-shake');
    void this.board.offsetWidth;
    this.board.classList.add('is-shake');
    clearTimeout(this._shakeTimer);
    this._shakeTimer = setTimeout(() => this.board.classList.remove('is-shake'), 380);
  }

  _playWallFx(w, el) {
    el.classList.add('is-building');
    setTimeout(() => el.classList.remove('is-building'), 700);
    sfx.wall();
    this.shake();

    const skin = this.wallSkins?.[w.by] || wallSkin('classic', 0);
    const color = skin.hi;
    const step = this.cell + this.gap;
    const v = this._viewWall(w.r, w.c, w.o);
    const cx = v.c * step + this.cell + this.gap / 2;
    const cy = v.r * step + this.cell + this.gap / 2;

    const shock = h('div', {
      class: 'fx-shock',
      style: { left: cx + 'px', top: cy + 'px', '--fx-color': color },
    });
    this.layers.fx.append(shock);
    setTimeout(() => shock.remove(), 620);

    const flash = h('div', {
      class: 'fx-flash',
      style: v.o === H
        ? { left: (v.c * step) + 'px', top: (cy - 1.5) + 'px', width: (2 * this.cell + this.gap) + 'px', height: '3px' }
        : { left: (cx - 1.5) + 'px', top: (v.r * step) + 'px', width: '3px', height: (2 * this.cell + this.gap) + 'px' },
    });
    this.layers.fx.append(flash);
    setTimeout(() => flash.remove(), 340);

    for (let i = 0; i < 9; i++) {
      const d = h('div', {
        class: 'fx-dust',
        style: { left: cx + 'px', top: cy + 'px', '--fx-color': color },
      });
      this.layers.fx.append(d);
      const angle = v.o === H
        ? (Math.random() * Math.PI - Math.PI / 2) * (i % 2 ? 1 : -1)
        : (Math.random() * Math.PI) + (i % 2 ? 0 : Math.PI);
      const dist = this.cell * (0.35 + Math.random() * 0.85);
      const dx = Math.cos(angle) * dist * (v.o === H ? 1.5 : 0.7);
      const dy = Math.sin(angle) * dist * (v.o === H ? 0.7 : 1.5);
      d.animate([
        { transform: 'translate(-50%,-50%) scale(1)', opacity: .9 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.1)`, opacity: 0 },
      ], { duration: 460 + Math.random() * 320, easing: 'cubic-bezier(.2,.7,.3,1)' });
      setTimeout(() => d.remove(), 820);
    }
  }

  _puff(r, c, skin) {
    const step = this.cell + this.gap;
    const v = this._viewCell(r, c);
    const cx = v.c * step + this.cell / 2;
    const cy = v.r * step + this.cell / 2;
    const ring = h('div', {
      class: 'fx-shock',
      style: { left: cx + 'px', top: cy + 'px', '--fx-color': skin.glow },
    });
    ring.style.animationDuration = '420ms';
    this.layers.fx.append(ring);
    setTimeout(() => ring.remove(), 460);
  }

  celebrate(playerIndex) {
    const skin = this.skins[playerIndex] || pawnSkin('classic', 0);
    const colors = [skin.hi, skin.mid, '#ffffff', skin.lo];
    const rect = this.board.getBoundingClientRect();
    for (let i = 0; i < 70; i++) {
      const p = h('div', {
        class: 'fx-confetti',
        style: {
          left: (rect.width / 2) + 'px',
          top: (rect.height * 0.42) + 'px',
          background: colors[i % colors.length],
        },
      });
      this.layers.fx.append(p);
      const angle = Math.random() * Math.PI * 2;
      const power = 120 + Math.random() * rect.width * 0.55;
      const dx = Math.cos(angle) * power;
      const dy = Math.sin(angle) * power - 120;
      p.animate([
        { transform: 'translate(-50%,-50%) rotate(0deg)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy + rect.height * 0.5}px)) rotate(${540 + Math.random() * 540}deg)`, opacity: 0 },
      ], { duration: 1300 + Math.random() * 900, easing: 'cubic-bezier(.15,.6,.4,1)' });
      setTimeout(() => p.remove(), 2300);
    }
  }

  showOverlay(node) {
    this.hideOverlay();
    this.overlayEl = h('div', { class: 'overlay' }, h('div', { class: 'overlay__box' }, node));
    this.root.append(this.overlayEl);
  }

  hideOverlay() {
    this.overlayEl?.remove();
    this.overlayEl = null;
  }
}

export { SEATS };
