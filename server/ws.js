/**
 * Минимальный WebSocket-сервер (RFC 6455) без внешних зависимостей.
 * Поддерживает текстовые и бинарные кадры, фрагментацию, ping/pong, close.
 */

import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_PAYLOAD = 512 * 1024;

const OP = {
  CONT: 0x0,
  TEXT: 0x1,
  BIN: 0x2,
  CLOSE: 0x8,
  PING: 0x9,
  PONG: 0xa,
};

export class WSConnection extends EventEmitter {
  constructor(socket, req) {
    super();
    this.socket = socket;
    this.req = req;
    this.open = true;
    this.buffer = Buffer.alloc(0);
    this.fragments = [];
    this.fragmentOp = 0;
    this.isAlive = true;
    this.remote = (req.headers['x-forwarded-for'] || socket.remoteAddress || '')
      .toString().split(',')[0].trim();

    socket.on('data', (chunk) => this._onData(chunk));
    socket.on('close', () => this._shutdown('socket-close'));
    socket.on('error', (err) => {
      this.emit('socketError', err);
      this._shutdown('socket-error');
    });
    socket.setTimeout(0);
    socket.setNoDelay(true);
  }

  _onData(chunk) {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    // защита от «раздувания» до разбора
    if (this.buffer.length > MAX_PAYLOAD * 2) {
      this.close(1009, 'too big');
      return;
    }
    let guard = 0;
    while (this.open && guard++ < 1000) {
      const frame = this._readFrame();
      if (!frame) break;
      this._handleFrame(frame);
    }
  }

  _readFrame() {
    const b = this.buffer;
    if (b.length < 2) return null;

    const fin = (b[0] & 0x80) !== 0;
    const rsv = b[0] & 0x70;
    const opcode = b[0] & 0x0f;
    const masked = (b[1] & 0x80) !== 0;
    let len = b[1] & 0x7f;
    let offset = 2;

    if (rsv !== 0) { this.close(1002, 'rsv'); return null; }
    if (!masked) { this.close(1002, 'unmasked'); return null; }

    if (len === 126) {
      if (b.length < offset + 2) return null;
      len = b.readUInt16BE(offset);
      offset += 2;
    } else if (len === 127) {
      if (b.length < offset + 8) return null;
      const big = b.readBigUInt64BE(offset);
      if (big > BigInt(MAX_PAYLOAD)) { this.close(1009, 'too big'); return null; }
      len = Number(big);
      offset += 8;
    }
    if (len > MAX_PAYLOAD) { this.close(1009, 'too big'); return null; }

    if (b.length < offset + 4 + len) return null;
    const mask = b.subarray(offset, offset + 4);
    offset += 4;
    const payload = Buffer.allocUnsafe(len);
    for (let i = 0; i < len; i++) payload[i] = b[offset + i] ^ mask[i & 3];
    offset += len;

    this.buffer = b.subarray(offset);
    return { fin, opcode, payload };
  }

  _handleFrame({ fin, opcode, payload }) {
    switch (opcode) {
      case OP.PING:
        this._send(OP.PONG, payload);
        return;
      case OP.PONG:
        this.isAlive = true;
        return;
      case OP.CLOSE: {
        let code = 1000;
        if (payload.length >= 2) code = payload.readUInt16BE(0);
        this._send(OP.CLOSE, payload.subarray(0, 2));
        this._shutdown('peer-close', code);
        return;
      }
      case OP.CONT: {
        if (!this.fragmentOp) { this.close(1002, 'unexpected continuation'); return; }
        this.fragments.push(payload);
        if (fin) this._deliver(this.fragmentOp, Buffer.concat(this.fragments));
        return;
      }
      case OP.TEXT:
      case OP.BIN: {
        if (this.fragmentOp) { this.close(1002, 'interleaved'); return; }
        if (fin) { this._deliver(opcode, payload); return; }
        this.fragmentOp = opcode;
        this.fragments = [payload];
        return;
      }
      default:
        this.close(1002, 'bad opcode');
    }
  }

  _deliver(opcode, payload) {
    this.fragmentOp = 0;
    this.fragments = [];
    this.isAlive = true;
    if (opcode === OP.TEXT) {
      let text;
      try {
        text = payload.toString('utf8');
      } catch {
        this.close(1007, 'bad utf8');
        return;
      }
      this.emit('message', text);
    } else {
      this.emit('binary', payload);
    }
  }

  _send(opcode, payload = Buffer.alloc(0)) {
    if (!this.open || this.socket.destroyed) return false;
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.allocUnsafe(2);
      header[1] = len;
    } else if (len < 65536) {
      header = Buffer.allocUnsafe(4);
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.allocUnsafe(10);
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }
    header[0] = 0x80 | opcode;
    try {
      this.socket.write(Buffer.concat([header, payload]));
      return true;
    } catch {
      this._shutdown('write-error');
      return false;
    }
  }

  send(data) {
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    return this._send(OP.TEXT, Buffer.from(text, 'utf8'));
  }

  ping() {
    this.isAlive = false;
    this._send(OP.PING);
  }

  close(code = 1000, reason = '') {
    if (!this.open) return;
    const body = Buffer.allocUnsafe(2 + Buffer.byteLength(reason));
    body.writeUInt16BE(code, 0);
    body.write(reason, 2);
    this._send(OP.CLOSE, body);
    this._shutdown('local-close', code);
  }

  _shutdown(why, code = 1006) {
    if (!this.open) return;
    this.open = false;
    try { this.socket.end(); } catch { /* ignore */ }
    try { this.socket.destroy(); } catch { /* ignore */ }
    this.emit('close', { why, code });
  }
}

/**
 * Подключает WS-обработчик к http-серверу.
 * @param {import('node:http').Server} server
 * @param {(conn: WSConnection, req) => void} onConnection
 */
export function attachWebSocket(server, onConnection, opts = {}) {
  const path = opts.path || '/ws';
  const connections = new Set();

  server.on('upgrade', (req, socket) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== path) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }
    const key = req.headers['sec-websocket-key'];
    const version = req.headers['sec-websocket-version'];
    if (!key || String(version) !== '13') {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }
    const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );

    const conn = new WSConnection(socket, req);
    connections.add(conn);
    conn.on('close', () => connections.delete(conn));
    onConnection(conn, req);
  });

  // heartbeat: раз в 25 секунд пингуем, мёртвых отключаем
  const timer = setInterval(() => {
    for (const c of connections) {
      if (!c.isAlive) { c._shutdown('heartbeat'); continue; }
      c.ping();
    }
  }, 25000);
  timer.unref?.();

  return { connections };
}
