import { Reader, Writer } from './varint.js';

const MAGIC = 0x47;
const VERSION = 1;
const FLAG_TITLE = 1;
const FLAG_REVEAL = 2;
const KIND_INSERT_ONE = 0;
const KIND_INSERT = 1;
const KIND_DELETE_ONE = 2;
const KIND_DELETE = 3;
export const TIME_UNIT_MS = 10;
export const LIMITS = Object.freeze({
  maxEvents: 20000,
  maxTextChars: 100000,
  maxDocChars: 100000,
  maxTitleBytes: 320,
  maxInflatedBytes: 1024 * 1024,
  maxDurationMs: 24 * 60 * 60 * 1000,
});
const MAX_CREATED_SECONDS = 253402300799;
const PREFIX_DEFLATE = 'z';
const PREFIX_RAW = 'r';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64_LOOKUP = new Int16Array(128).fill(-1);
for (let i = 0; i < B64.length; i++) B64_LOOKUP[B64.charCodeAt(i)] = i;

export class CodecError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CodecError';
  }
}

export function toBase64Url(bytes) {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += B64[n >> 18] + B64[(n >> 12) & 63];
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63];
  }
  return out;
}

export function fromBase64Url(str) {
  if (str.length % 4 === 1) throw new CodecError('Invalid base64url length');
  const out = new Uint8Array(Math.floor((str.length * 3) / 4));
  let o = 0;
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    const v = c < 128 ? B64_LOOKUP[c] : -1;
    if (v < 0) throw new CodecError('Invalid base64url character');
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
    }
  }
  if (bits > 0 && (acc & ((1 << bits) - 1)) !== 0) throw new CodecError('Invalid base64url padding bits');
  return out.subarray(0, o);
}

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder('utf-8', { fatal: false });

export function encodeBinary(replay) {
  const events = replay.events ?? [];
  if (events.length > LIMITS.maxEvents) throw new CodecError(`Too many edits to share (limit ${LIMITS.maxEvents})`);
  const w = new Writer(64 + events.length * 4);
  const title = (replay.title ?? '').trim();
  let flags = 0;
  if (title) flags |= FLAG_TITLE;
  if (replay.reveal) flags |= FLAG_REVEAL;

  w.byte(MAGIC);
  w.byte(VERSION);
  w.byte(flags);
  w.uvarint(Math.max(0, Math.floor((replay.createdAt ?? Date.now()) / 1000)));
  if (title) {
    const tb = utf8Encoder.encode(title);
    w.uvarint(tb.length);
    w.bytes(tb);
  }
  w.uvarint(events.length);

  let prevT = 0;
  let expectedPos = 0;
  let blob = '';
  for (const e of events) {
    const t = Math.max(prevT, Math.round(e.t / TIME_UNIT_MS));
    w.uvarint(t - prevT);
    prevT = t;
    const isDelete = e.type === 'delete';
    const len = isDelete ? e.len : e.text.length;
    const kind = isDelete ? (len === 1 ? KIND_DELETE_ONE : KIND_DELETE) : len === 1 ? KIND_INSERT_ONE : KIND_INSERT;
    w.svarint((e.pos - expectedPos) * 4 + kind);
    if (kind === KIND_INSERT || kind === KIND_DELETE) w.uvarint(len);
    if (isDelete) {
      expectedPos = e.pos;
    } else {
      blob += e.text;
      expectedPos = e.pos + len;
    }
  }
  w.bytes(utf8Encoder.encode(blob));
  return w.finish();
}

export function decodeBinary(bytes) {
  const r = new Reader(bytes);
  try {
    if (r.byte() !== MAGIC) throw new CodecError('Not a Ghostwriter replay');
    const version = r.byte();
    if (version !== VERSION) throw new CodecError(`Unsupported replay version ${version}`);
    const flags = r.byte();
    const createdSeconds = r.uvarint();
    if (createdSeconds > MAX_CREATED_SECONDS) throw new CodecError('Invalid creation date');
    const createdAt = createdSeconds * 1000;
    let title;
    if (flags & FLAG_TITLE) {
      const titleBytes = r.uvarint();
      if (titleBytes > LIMITS.maxTitleBytes) throw new CodecError('Title is too long');
      title = utf8Decoder.decode(r.bytes(titleBytes));
    }
    const count = r.uvarint();
    if (count > LIMITS.maxEvents) throw new CodecError(`Replay has too many edits (limit ${LIMITS.maxEvents})`);
    if (count * 2 > bytes.length - r.pos) throw new CodecError('Corrupt event count');

    const raw = new Array(count);
    let t = 0;
    let expectedPos = 0;
    let textChars = 0;
    const maxUnits = LIMITS.maxDurationMs / TIME_UNIT_MS;
    for (let i = 0; i < count; i++) {
      t += r.uvarint();
      if (t > maxUnits) throw new CodecError('Replay is longer than 24 hours');
      const head = r.svarint();
      const kind = ((head % 4) + 4) % 4;
      const pos = expectedPos + (head - kind) / 4;
      const type = kind >= KIND_DELETE_ONE ? 'delete' : 'insert';
      const len = kind === KIND_INSERT || kind === KIND_DELETE ? r.uvarint() : 1;
      if (type === 'insert') {
        textChars += len;
        if (textChars > LIMITS.maxTextChars) throw new CodecError('Replay contains too much text');
      } else if (len > LIMITS.maxDocChars) {
        throw new CodecError('Delete past end of document');
      }
      raw[i] = { t: t * TIME_UNIT_MS, type, pos, len };
      expectedPos = type === 'delete' ? pos : pos + len;
    }
    const blob = utf8Decoder.decode(r.bytes(bytes.length - r.pos));

    let offset = 0;
    let docLen = 0;
    const events = new Array(count);
    for (let i = 0; i < count; i++) {
      const { t: et, type, pos, len } = raw[i];
      if (pos < 0 || pos > docLen) throw new CodecError('Event position out of range');
      if (type === 'delete') {
        if (pos + len > docLen) throw new CodecError('Delete past end of document');
        events[i] = { t: et, type: 'delete', pos, len };
        docLen -= len;
      } else {
        if (offset + len > blob.length) throw new CodecError('Text blob truncated');
        events[i] = { t: et, type: 'insert', pos, text: blob.slice(offset, offset + len) };
        offset += len;
        docLen += len;
        if (docLen > LIMITS.maxDocChars) throw new CodecError('Document is too long');
      }
    }

    const replay = { v: VERSION, createdAt, reveal: Boolean(flags & FLAG_REVEAL), events };
    if (title) replay.title = title;
    return replay;
  } catch (err) {
    if (err instanceof CodecError) throw err;
    throw new CodecError(`Corrupt replay: ${err.message}`);
  }
}

const hasCompression = () =>
  typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

async function pipe(bytes, stream, limit = Infinity) {
  const writer = stream.writable.getWriter();
  writer.write(bytes).catch(() => {});
  writer.close().catch(() => {});
  const reader = stream.readable.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      reader.cancel().catch(() => {});
      throw new CodecError('Replay is too large');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

export async function encode(replay) {
  const bin = encodeBinary(replay);
  if (hasCompression()) {
    const deflated = await pipe(bin, new CompressionStream('deflate-raw'));
    if (deflated.length < bin.length) return PREFIX_DEFLATE + toBase64Url(deflated);
  }
  return PREFIX_RAW + toBase64Url(bin);
}

export async function decode(str) {
  if (typeof str !== 'string' || str.length < 2) throw new CodecError('Empty replay');
  const prefix = str[0];
  const bytes = fromBase64Url(str.slice(1));
  if (prefix === PREFIX_RAW) return decodeBinary(bytes);
  if (prefix !== PREFIX_DEFLATE) throw new CodecError('Unknown replay encoding');
  if (!hasCompression()) throw new CodecError('This browser cannot decompress replays');
  let inflated;
  try {
    inflated = await pipe(bytes, new DecompressionStream('deflate-raw'), LIMITS.maxInflatedBytes);
  } catch (err) {
    if (err instanceof CodecError) throw err;
    throw new CodecError('Replay data is damaged');
  }
  return decodeBinary(inflated);
}
