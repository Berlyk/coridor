/* WebSocket-клиент с авто-переподключением и очередью отправки. */

import { store } from './store.js';

const listeners = new Map();
let ws = null;
let status = 'idle';          // idle | connecting | online | offline
let retry = 0;
let retryTimer = null;
let queue = [];
let pingTimer = null;
let latency = 0;
let serverOffset = 0;
let takenOver = false;
let closing = false;   // страница выгружается — переподключаться нельзя

function emit(type, payload) {
  for (const fn of listeners.get(type) || []) {
    try { fn(payload); } catch (e) { console.error('[net] listener', type, e); }
  }
  for (const fn of listeners.get('*') || []) {
    try { fn({ type, ...payload }); } catch { /* noop */ }
  }
}

export function on(type, fn) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(fn);
  return () => listeners.get(type)?.delete(fn);
}

export function off(type, fn) { listeners.get(type)?.delete(fn); }

function setStatus(next) {
  if (status === next) return;
  status = next;
  emit('status', { status, latency });
}

export function getStatus() { return status; }
export function getLatency() { return latency; }
/** Смещение часов клиента относительно сервера, мс. */
export function getOffset() { return serverOffset; }
export function serverNow() { return Date.now() + serverOffset; }

function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}

export function connect() {
  if (takenOver || closing) return;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  clearTimeout(retryTimer);
  setStatus('connecting');

  try {
    ws = new WebSocket(wsUrl());
  } catch {
    scheduleRetry();
    return;
  }

  ws.addEventListener('open', () => {
    retry = 0;
    send({ type: 'hello', clientId: store.clientId, name: store.name });
    for (const m of queue.splice(0)) raw(m);
    clearInterval(pingTimer);
    pingTimer = setInterval(() => send({ type: 'ping', t: Date.now() }), 20000);
  });

  ws.addEventListener('message', (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.type === 'pong') {
      latency = Date.now() - (msg.t || Date.now());
      emit('status', { status, latency });
      return;
    }
    if (msg.type === 'hello:ok') {
      if (msg.serverTime) serverOffset = msg.serverTime - Date.now();
      setStatus('online');
    }
    emit(msg.type, msg);
  });

  ws.addEventListener('close', (ev) => {
    clearInterval(pingTimer);
    // 4001 — эту же учётку перехватила другая вкладка: молча не переподключаемся,
    // иначе вкладки начнут бесконечно отбирать сессию друг у друга
    if (ev.code === 4001) {
      takenOver = true;
      setStatus('replaced');
      return;
    }
    setStatus('offline');
    scheduleRetry();
  });

  ws.addEventListener('error', () => { /* close последует сам */ });
}

function scheduleRetry() {
  clearTimeout(retryTimer);
  retry = Math.min(retry + 1, 8);
  const delay = Math.min(600 * 2 ** (retry - 1), 12000) + Math.random() * 400;
  retryTimer = setTimeout(connect, delay);
}

function raw(obj) {
  try { ws.send(JSON.stringify(obj)); return true; } catch { return false; }
}

export function send(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) return raw(obj);
  if (obj.type !== 'ping') {
    queue.push(obj);
    if (queue.length > 40) queue.shift();
  }
  connect();
  return false;
}

/** Принудительное переподключение (например, по кнопке «Играть здесь»). */
export function reconnect() {
  retry = 0;
  takenOver = false;
  try { ws?.close(); } catch { /* noop */ }
  connect();
}

export function isTakenOver() { return takenOver; }

// при уходе со страницы гасим сокет: иначе «зомби-переподключение» из
// выгружаемого документа отберёт сессию у только что открытой страницы
for (const ev of ['pagehide', 'beforeunload']) {
  window.addEventListener(ev, () => {
    closing = true;
    clearTimeout(retryTimer);
    clearInterval(pingTimer);
    try { ws?.close(1001, 'unload'); } catch { /* noop */ }
  });
}
window.addEventListener('pageshow', (e) => {
  if (!e.persisted) return;
  closing = false;      // возврат из bfcache
  connect();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && status !== 'online' && !takenOver) connect();
});
window.addEventListener('online', () => { if (!takenOver) connect(); });
