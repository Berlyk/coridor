/**
 * Проверка синхронизации: два клиента играют партию, и после каждого хода
 * обе стороны обязаны увидеть одно и то же состояние.
 *
 * Запуск:  node tests/sync.test.js   (сервер должен быть поднят)
 */

import { deserialize } from '../shared/quoridor.js';
import { chooseMove } from '../shared/ai.js';

const URL = process.env.CORIDOR_WS || 'ws://localhost:8080/ws';
const ROUNDS = Number(process.env.ROUNDS || 40);

let failures = 0;
function ok(cond, label) {
  if (!cond) failures++;
  console.log(`${cond ? '  ok  ' : ' FAIL '} ${label}`);
}

let seq = 0;
class Client {
  constructor(name) {
    this.name = name;
    this.id = 'sync-' + (++seq) + '-' + Math.random().toString(36).slice(2, 8);
    this.handlers = new Map();
    this.room = null;
    this.state = null;
    this.seqNo = 0;
    this.gaps = 0;
    this.log = [];
    this.ws = new WebSocket(URL);
    this.ready = new Promise((res) => { this._ready = res; });
    this.ws.addEventListener('open', () => {
      this.send({ type: 'hello', clientId: this.id, name });
    });
    this.ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.type === 'hello:ok') { this.id = m.clientId; this._ready(m); }
      if (m.type === 'room:state') { this.room = m.room; this.state = m.state; }
      if ((m.type === 'game:move' || m.type === 'game:over') && m.state) this.state = m.state;
      if (typeof m.seq === 'number') {
        if (this.seqNo && m.seq > this.seqNo + 1) this.gaps++;
        this.seqNo = Math.max(this.seqNo, m.seq);
      }
      this.log.push(m.type + (m.state ? `#${m.state.ply}` : ''));
      for (const fn of [...(this.handlers.get(m.type) || [])]) fn(m);
    });
  }

  send(o) { this.ws.send(JSON.stringify(o)); }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type)?.delete(fn);
  }

  wait(type, pred = null, timeout = 6000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { off(); reject(new Error('timeout ' + type)); }, timeout);
      const off = this.on(type, (m) => {
        if (pred && !pred(m)) return;
        clearTimeout(t); off(); resolve(m);
      });
    });
  }

  /** Дождаться, пока у клиента появится состояние с нужным номером хода. */
  waitPly(ply, timeout = 6000) {
    if (this.state && this.state.ply >= ply) return Promise.resolve(this.state);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { clearInterval(iv); reject(new Error(`нет ply ${ply}, есть ${this.state?.ply}`)); }, timeout);
      const iv = setInterval(() => {
        if (this.state && this.state.ply >= ply) { clearTimeout(t); clearInterval(iv); resolve(this.state); }
      }, 20);
    });
  }

  close() { try { this.ws.close(); } catch { /* noop */ } }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log('\n=== проверка синхронизации ===\n');

  const a = new Client('Первый');
  const b = new Client('Второй');
  await Promise.all([a.ready, b.ready]);

  const created = a.wait('room:state');
  a.send({ type: 'room:create', name: 'Синхронизация', mode: 'duel', turnTimeSec: 0 });
  const code = (await created).room.code;

  const joined = b.wait('room:state');
  b.send({ type: 'room:join', code });
  await joined;

  const started = a.wait('room:state', (m) => m.room.status === 'playing');
  const startedB = b.wait('room:state', (m) => m.room.status === 'playing');
  a.send({ type: 'room:start' });
  await Promise.all([started, startedB]);
  ok(true, `партия началась в комнате ${code}`);

  const clients = [a, b];
  let over = null;
  a.on('game:over', (m) => { over = m; });
  b.on('game:over', (m) => { over = m; });

  let desync = 0;
  let lateA = 0, lateB = 0;
  let worstLag = 0;

  for (let n = 0; n < ROUNDS && !over; n++) {
    const g = deserialize(a.state);
    if (g.winner !== null) break;
    const seat = g.turn;
    const mover = clients[seat];
    const other = clients[1 - seat];
    const targetPly = g.ply + 1;

    const t0 = Date.now();
    mover.send({ type: 'game:move', move: chooseMove(g, seat, 'medium') });

    // обе стороны обязаны увидеть новый ход
    let mineOk = true, theirsOk = true;
    try { await mover.waitPly(targetPly, 5000); } catch { mineOk = false; lateA++; }
    try { await other.waitPly(targetPly, 5000); } catch { theirsOk = false; lateB++; }
    worstLag = Math.max(worstLag, Date.now() - t0);

    if (!mineOk || !theirsOk) {
      console.log(`   ход ${targetPly}: ходивший ${mineOk ? 'ок' : 'НЕ ПОЛУЧИЛ'}, соперник ${theirsOk ? 'ок' : 'НЕ ПОЛУЧИЛ'}`);
      desync++;
      continue;
    }

    // состояния обязаны совпадать
    const sa = a.state, sb = b.state;
    if (sa.ply !== sb.ply || sa.turn !== sb.turn
        || JSON.stringify(sa.players) !== JSON.stringify(sb.players)
        || sa.wallList.length !== sb.wallList.length) {
      console.log(`   ход ${targetPly}: РАСХОЖДЕНИЕ`);
      console.log(`     первый:  ply=${sa.ply} turn=${sa.turn} стен=${sa.wallList.length}`);
      console.log(`     второй:  ply=${sb.ply} turn=${sb.turn} стен=${sb.wallList.length}`);
      desync++;
    }
  }

  ok(desync === 0, `расхождений состояния: ${desync}`);
  ok(lateA === 0, `ходивший не увидел свой ход: ${lateA} раз`);
  ok(lateB === 0, `соперник не увидел ход: ${lateB} раз`);
  ok(a.gaps === 0 && b.gaps === 0, `пропусков в нумерации: ${a.gaps} и ${b.gaps}`);
  console.log(`   максимальная задержка доставки: ${worstLag} мс`);
  console.log(`   сыграно полуходов: ${a.state?.ply}`);

  a.close(); b.close();
  await sleep(200);
  console.log(`\n${failures ? failures + ' ПРОВАЛОВ' : 'СИНХРОНИЗАЦИЯ В ПОРЯДКЕ'}\n`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error('тест упал:', e); process.exit(1); });
