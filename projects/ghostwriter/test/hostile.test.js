import { describe, expect, it } from 'vitest';
import { CodecError, LIMITS, decode, decodeBinary, encode, encodeBinary, toBase64Url } from '../core/codec.js';
import { Writer } from '../core/varint.js';
import { makeSample } from '../core/sample.js';
import { mulberry32 } from '../core/random.js';

function header(count, { createdSeconds = 0 } = {}) {
  const w = new Writer();
  w.byte(0x47);
  w.byte(1);
  w.byte(0);
  w.uvarint(createdSeconds);
  w.uvarint(count);
  return w;
}

async function deflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

describe('decode bombs', () => {
  it('rejects an event count above the cap before allocating anything', () => {
    const w = header(2_000_000);
    for (let i = 0; i < 4_000_000; i++) w.byte(0);
    const started = performance.now();
    expect(() => decodeBinary(w.finish())).toThrow(/too many edits/);
    expect(performance.now() - started).toBeLessThan(50);
  });

  it('rejects a compressed link that claims 2M one-byte events (deflate bomb)', async () => {
    const w = header(LIMITS.maxEvents + 1);
    for (let i = 0; i < 1_000_000; i++) w.byte(0);
    const payload = 'z' + toBase64Url(await deflate(w.finish()));
    expect(payload.length).toBeLessThan(8000);
    await expect(decode(payload)).rejects.toBeInstanceOf(CodecError);
  });

  it('stops inflating at the size cap', async () => {
    const zeros = new Uint8Array(LIMITS.maxInflatedBytes + 1024);
    const payload = 'z' + toBase64Url(await deflate(zeros));
    await expect(decode(payload)).rejects.toThrow(/too large/);
  });

  it('caps total inserted text', () => {
    const n = 3;
    const len = Math.ceil(LIMITS.maxTextChars / 2);
    const w = header(n);
    let pos = 0;
    for (let i = 0; i < n; i++) {
      w.uvarint(1);
      w.svarint(1);
      w.uvarint(len);
      pos += len;
    }
    w.bytes(new TextEncoder().encode('a'.repeat(pos)));
    expect(() => decodeBinary(w.finish())).toThrow(/too much text/);
  });

  it('caps replay duration and creation date', () => {
    const long = header(1);
    long.uvarint(LIMITS.maxDurationMs / 10 + 1);
    long.svarint(0);
    long.byte(0x61);
    expect(() => decodeBinary(long.finish())).toThrow(/24 hours/);

    const future = header(0, { createdSeconds: 2 ** 52 });
    expect(() => decodeBinary(future.finish())).toThrow(/creation date/);
  });

  it('refuses to encode more edits than a link may carry', () => {
    const events = Array.from({ length: LIMITS.maxEvents + 1 }, (_, i) => ({ t: i, type: 'insert', pos: i, text: 'a' }));
    expect(() => encodeBinary({ createdAt: 0, events })).toThrow(CodecError);
  });
});

describe('fuzz', () => {
  it('random byte flips either decode to a valid replay or throw CodecError', async () => {
    const valid = (await encode(makeSample())).slice(1);
    const rand = mulberry32(42);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    for (let i = 0; i < 300; i++) {
      const chars = valid.split('');
      const flips = 1 + Math.floor(rand() * 4);
      for (let f = 0; f < flips; f++) chars[Math.floor(rand() * chars.length)] = alphabet[Math.floor(rand() * 64)];
      const prefix = rand() < 0.5 ? 'z' : 'r';
      try {
        const replay = await decode(prefix + chars.join(''));
        expect(Array.isArray(replay.events)).toBe(true);
        expect(replay.events.length).toBeLessThanOrEqual(LIMITS.maxEvents);
      } catch (err) {
        expect(err).toBeInstanceOf(CodecError);
      }
    }
  });

  it('raw binary fuzz never escapes as a non-CodecError', () => {
    const rand = mulberry32(7);
    for (let i = 0; i < 500; i++) {
      const bytes = Uint8Array.from({ length: 1 + Math.floor(rand() * 64) }, () => Math.floor(rand() * 256));
      if (rand() < 0.7) {
        bytes[0] = 0x47;
        if (bytes.length > 1) bytes[1] = 1;
      }
      try {
        decodeBinary(bytes);
      } catch (err) {
        expect(err).toBeInstanceOf(CodecError);
      }
    }
  });

  it('turns a lone surrogate into U+FFFD without breaking positions', async () => {
    const replay = {
      createdAt: 0,
      events: [
        { t: 0, type: 'insert', pos: 0, text: 'a\ud83db' },
        { t: 10, type: 'delete', pos: 1, len: 1 },
      ],
    };
    const back = await decode(await encode(replay));
    expect(back.events[0].text).toBe('a�b');
    expect(back.events[1]).toEqual({ t: 10, type: 'delete', pos: 1, len: 1 });
  });
});
