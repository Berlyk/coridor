/**
 * Сквозной тест сетевой части: два клиента, комната, партия до победы.
 * Запуск:  node tests/online.test.js   (сервер должен быть поднят)
 */

import { deserialize } from '../shared/quoridor.js';
import { chooseMove } from '../shared/ai.js';

const URL = process.env.CORIDOR_WS || 'ws://localhost:8080/ws';

let failures = 0;
function ok(cond, label) {
  console.log(`${cond ? '  ok  ' : ' FAIL '} ${label}`);
  if (!cond) failures++;
}

let seq = 0;
class Client {
  constructor(name, id) {
    this.name = name;
    this.id = id || ('test-' + (++seq) + '-' + Math.random().toString(36).slice(2, 8));
    this.handlers = new Map();
    this.room = null;
    this.state = null;
    this.ws = new WebSocket(URL);
    this.ready = new Promise((res) => { this._ready = res; });
    this.ws.addEventListener('open', () => {
      this.send({ type: 'hello', clientId: this.id, name });
    });
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'hello:ok') { this.id = msg.clientId; this._ready(msg); }
      if (msg.type === 'room:state') { this.room = msg.room; this.state = msg.state; }
      if (msg.type === 'game:move' || msg.type === 'game:over') this.state = msg.state || this.state;
      const set = this.handlers.get(msg.type);
      if (set) for (const fn of [...set]) fn(msg);
    });
  }

  send(o) { this.ws.send(JSON.stringify(o)); }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type)?.delete(fn);
  }

  /** ждём сообщение нужного типа, опционально с условием */
  wait(type, pred = null, timeout = 6000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { off(); reject(new Error('timeout ' + type)); }, timeout);
      const off = this.on(type, (m) => {
        if (pred && !pred(m)) return;
        clearTimeout(t); off(); resolve(m);
      });
    });
  }

  close() { try { this.ws.close(); } catch { /* noop */ } }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log('\n=== сетевой тест «Коридора» ===\n');

  const a = new Client('Алиса');
  const b = new Client('Борис');
  await Promise.all([a.ready, b.ready]);
  ok(true, 'оба клиента представились серверу');

  /* --- комната --- */
  const created = a.wait('room:state');
  a.send({ type: 'room:create', name: 'Тестовая', wallsPerPlayer: 10, turnTimeSec: 0 });
  const roomMsg = await created;
  const code = roomMsg.room.code;
  ok(code?.length === 5, `комната создана, код ${code}`);
  ok(roomMsg.room.seats[0] === a.id, 'создатель сел на первое место');

  const joined = b.wait('room:state');
  b.send({ type: 'room:join', code });
  ok((await joined).room.seats[1] === b.id, 'второй игрок сел на второе место');

  /* --- ошибки входа --- */
  const c = new Client('Гость');
  await c.ready;
  const errP = c.wait('room:error');
  c.send({ type: 'room:join', code: 'ZZZZZ' });
  ok((await errP).message.includes('не найдена'), 'несуществующая комната отклоняется');

  const spectate = c.wait('room:state');
  c.send({ type: 'room:join', code });
  ok((await spectate).room.members.some((m) => m.id === c.id && m.seat === null),
    'третий вошёл наблюдателем');

  /* --- старт --- */
  const started = a.wait('room:state', (m) => m.room.status === 'playing');
  a.send({ type: 'room:ready', ready: true });
  b.send({ type: 'room:ready', ready: true });
  const st = await started;
  ok(st.room.status === 'playing', 'партия стартовала после готовности обоих');
  ok(st.state?.players[0].r === 8 && st.state?.players[1].r === 0, 'начальная расстановка верна');

  /* --- проверка правил на сервере --- */
  const reject = b.wait('game:reject');
  b.send({ type: 'game:move', move: { type: 'move', r: 1, c: 4 } });
  ok((await reject).message.includes('не ваш ход'), 'ход вне очереди отклонён');

  const reject2 = a.wait('game:reject');
  a.send({ type: 'game:move', move: { type: 'move', r: 0, c: 0 } });
  ok((await reject2).code === 'illegal', 'нелегальный ход отклонён');

  const reject3 = a.wait('game:reject');
  a.send({ type: 'game:move', move: { type: 'wall', r: 99, c: 99, o: 1 } });
  ok(!!(await reject3), 'мусорные координаты стены отклонены');

  /* --- партия до конца --- */
  const clients = [a, b];
  let over = null;
  const overP = new Promise((res) => a.on('game:over', (m) => { over = m; res(m); }));

  let plies = 0;
  let lastReject = null;
  const offRej = [a.on('game:reject', (m) => { lastReject = m; }),
                  b.on('game:reject', (m) => { lastReject = m; })];
  while (!over && plies < 260) {
    const g = deserialize(a.state);
    if (g.winner !== null) break;
    const seat = g.turn;
    const mv = chooseMove(g, seat, seat === 0 ? 'medium' : 'easy');
    // ждём подтверждение на «наблюдающем» клиенте a — он получает все ходы
    const moved = a.wait('game:move', (m) => m.state.ply === g.ply + 1, 8000).catch(() => null);
    clients[seat].send({ type: 'game:move', move: mv });
    const res = await Promise.race([moved, overP]);
    if (!res) break;
    plies++;
  }
  for (const off of offRej) off();
  if (!over && lastReject) console.log('    последний отказ:', JSON.stringify(lastReject.message));
  await Promise.race([overP, sleep(1500)]);
  ok(!!over, `партия дошла до конца за ${plies} полуходов`);
  ok(over && (over.winner === 0 || over.winner === 1), `победитель: ${over?.winnerName}`);

  /* --- чат --- */
  const chatP = b.wait('chat:msg', (m) => !m.message.sys);
  a.send({ type: 'chat:send', text: 'Хорошая игра!' });
  ok((await chatP).message.text === 'Хорошая игра!', 'чат доставляется сопернику');

  /* --- реванш --- */
  const rematchStarted = a.wait('room:state', (m) => m.room.status === 'playing');
  a.send({ type: 'game:rematch' });
  b.send({ type: 'game:rematch' });
  const rm = await rematchStarted;
  ok(rm.room.status === 'playing', 'реванш стартовал');
  ok(rm.room.seats[0] === b.id && rm.room.seats[1] === a.id, 'стороны поменялись местами');

  /* --- обрыв и возврат --- */
  const noticeP = a.wait('room:notice', (m) => m.kind === 'disconnect');
  const bId = b.id;
  b.close();
  ok(!!(await noticeP), 'обрыв связи замечен, партия не закрыта сразу');

  const backP = a.wait('room:notice', (m) => m.kind === 'reconnect');
  const b2 = new Client('Борис', bId);
  const b2Room = b2.wait('room:state');
  await b2.ready;
  ok(!!(await backP), 'игрок вернулся в свою партию по тому же clientId');
  ok((await b2Room).room.code === code, 'вернувшийся клиент сразу получил состояние комнаты');

  /* --- сдача --- */
  const overP2 = a.wait('game:over');
  b2.send({ type: 'game:resign' });
  const o2 = await overP2;
  ok(o2.reason === 'resign', 'сдача засчитана сопернику');

  /* --- быстрый подбор --- */
  const q1 = new Client('Q1');
  const q2 = new Client('Q2');
  await Promise.all([q1.ready, q2.ready]);
  const qRoom = q1.wait('room:state', (m) => m.room.status === 'playing');
  q1.send({ type: 'queue:join' });
  await sleep(120);
  q2.send({ type: 'queue:join' });
  ok((await qRoom).room.status === 'playing', 'быстрый подбор свёл двоих и начал партию');

  /* --- таймер хода --- */
  const t1 = new Client('T1');
  const t2 = new Client('T2');
  await Promise.all([t1.ready, t2.ready]);
  const tRoom = t1.wait('room:state');
  t1.send({ type: 'room:create', name: 'Таймер', wallsPerPlayer: 10, turnTimeSec: 15 });
  const tCode = (await tRoom).room.code;
  const tJoin = t2.wait('room:state');
  t2.send({ type: 'room:join', code: tCode });
  await tJoin;
  const tStart = t1.wait('room:state', (m) => m.room.status === 'playing');
  t1.send({ type: 'room:ready', ready: true });
  t2.send({ type: 'room:ready', ready: true });
  await tStart;
  const clock = await t1.wait('game:clock', null, 3000).catch(() => null);
  ok(!!(clock && clock.turnDeadline > Date.now()), 'сервер прислал дедлайн хода');

  for (const cl of [a, b2, c, q1, q2, t1, t2]) cl.close();
  await sleep(250);

  console.log(`\n${failures ? failures + ' ПРОВАЛОВ' : 'ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ'}\n`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error('тест упал:', e);
  process.exit(1);
});
