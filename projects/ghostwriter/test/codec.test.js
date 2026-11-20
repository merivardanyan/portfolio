import { describe, expect, it } from 'vitest';
import {
  CodecError,
  TIME_UNIT_MS,
  decode,
  decodeBinary,
  encode,
  encodeBinary,
  fromBase64Url,
  toBase64Url,
} from '../core/codec.js';
import { textAtCount } from '../core/engine.js';
import { makeSample } from '../core/sample.js';
import { mulberry32 } from '../core/random.js';

const quantize = (events) => events.map((e) => ({ ...e, t: Math.round(e.t / TIME_UNIT_MS) * TIME_UNIT_MS }));

function randomReplay(seed, n) {
  const rand = mulberry32(seed);
  const alphabet = ['a', 'b', ' ', '\n', 'é', '日本', '👋', 'ß', 'z'];
  const events = [];
  let len = 0;
  let t = 0;
  for (let i = 0; i < n; i++) {
    t += Math.floor(rand() * 3000);
    if (len > 0 && rand() < 0.3) {
      const pos = Math.floor(rand() * len);
      const dl = 1 + Math.floor(rand() * Math.min(3, len - pos));
      events.push({ t, type: 'delete', pos, len: dl });
      len -= dl;
    } else {
      const text = alphabet[Math.floor(rand() * alphabet.length)];
      const pos = Math.floor(rand() * (len + 1));
      events.push({ t, type: 'insert', pos, text });
      len += text.length;
    }
  }
  return { v: 1, createdAt: 1_700_000_000_000, reveal: rand() < 0.5, events };
}

describe('base64url', () => {
  it('round-trips every length mod 3', () => {
    for (let n = 0; n < 40; n++) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + n) & 0xff);
      const s = toBase64Url(bytes);
      expect(s).toMatch(/^[A-Za-z0-9_-]*$/);
      expect(Array.from(fromBase64Url(s))).toEqual(Array.from(bytes));
    }
  });

  it('matches the platform encoder', () => {
    const bytes = Uint8Array.from([251, 255, 191, 0, 1, 2, 3]);
    const expected = Buffer.from(bytes).toString('base64url');
    expect(toBase64Url(bytes)).toBe(expected);
  });

  it('rejects invalid characters', () => {
    expect(() => fromBase64Url('ab+/')).toThrow(CodecError);
    expect(() => fromBase64Url('abcde')).toThrow(CodecError);
  });
});

describe('binary codec', () => {
  it('round-trips random replays including emoji and CJK', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const replay = randomReplay(seed, 300);
      const out = decodeBinary(encodeBinary(replay));
      expect(out.events).toEqual(quantize(replay.events));
      expect(out.reveal).toBe(replay.reveal);
      expect(out.createdAt).toBe(replay.createdAt);
    }
  });

  it('keeps the title and drops blank titles', () => {
    const base = { createdAt: 0, events: [] };
    expect(decodeBinary(encodeBinary({ ...base, title: '  Für dich 💌 ' })).title).toBe('Für dich 💌');
    expect(decodeBinary(encodeBinary({ ...base, title: '   ' }))).not.toHaveProperty('title');
  });

  it('is compact for ordinary typing (about 3 bytes per keystroke including text)', () => {
    const sample = makeSample();
    const bin = encodeBinary(sample);
    expect(bin.length / sample.events.length).toBeLessThan(3.2);
  });

  it('rejects corrupted payloads with a CodecError', () => {
    const bin = encodeBinary(makeSample());
    expect(() => decodeBinary(bin.subarray(0, 20))).toThrow(CodecError);
    const wrongMagic = bin.slice();
    wrongMagic[0] = 0;
    expect(() => decodeBinary(wrongMagic)).toThrow(/Not a Ghostwriter/);
  });

  it('rejects edits outside the document', () => {
    const bad = encodeBinary({ createdAt: 0, events: [{ t: 0, type: 'delete', pos: 0, len: 3 }] });
    expect(() => decodeBinary(bad)).toThrow(CodecError);
  });
});

describe('encode/decode (compressed, URL-safe)', () => {
  it('round-trips the sample and reproduces the final text', async () => {
    const sample = makeSample();
    const payload = await encode(sample);
    expect(payload).toMatch(/^[zr][A-Za-z0-9_-]+$/);
    expect(payload[0]).toBe('z');
    const back = await decode(payload);
    expect(back.events).toEqual(quantize(sample.events));
    expect(back.title).toBe(sample.title);
    const final = textAtCount(back.events, back.events.length);
    expect(final).toContain('Sorry, sorry, sorry.');
    expect(final).toContain('completely out of line');
  });

  it('fails cleanly on garbage', async () => {
    await expect(decode('zAAAA')).rejects.toBeInstanceOf(CodecError);
    await expect(decode('q123')).rejects.toBeInstanceOf(CodecError);
    await expect(decode('')).rejects.toBeInstanceOf(CodecError);
  });
});
