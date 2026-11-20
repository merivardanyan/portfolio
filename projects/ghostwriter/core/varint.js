export class Writer {
  constructor(size = 256) {
    this.buf = new Uint8Array(size);
    this.len = 0;
  }

  ensure(n) {
    if (this.len + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.len + n) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
  }

  byte(b) {
    this.ensure(1);
    this.buf[this.len++] = b & 0xff;
  }

  uvarint(n) {
    if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(`uvarint out of range: ${n}`);
    this.ensure(8);
    while (n >= 0x80) {
      this.buf[this.len++] = (n % 0x80) | 0x80;
      n = Math.floor(n / 0x80);
    }
    this.buf[this.len++] = n;
  }

  svarint(n) {
    this.uvarint(n >= 0 ? n * 2 : -n * 2 - 1);
  }

  bytes(arr) {
    this.ensure(arr.length);
    this.buf.set(arr, this.len);
    this.len += arr.length;
  }

  finish() {
    return this.buf.slice(0, this.len);
  }
}

export class Reader {
  constructor(buf) {
    this.buf = buf;
    this.pos = 0;
  }

  get done() {
    return this.pos >= this.buf.length;
  }

  byte() {
    if (this.pos >= this.buf.length) throw new RangeError('Unexpected end of data');
    return this.buf[this.pos++];
  }

  uvarint() {
    let result = 0;
    let mul = 1;
    for (let i = 0; i < 8; i++) {
      const b = this.byte();
      result += (b & 0x7f) * mul;
      if (b < 0x80) return result;
      mul *= 0x80;
    }
    throw new RangeError('Varint too long');
  }

  svarint() {
    const u = this.uvarint();
    return u % 2 === 0 ? u / 2 : -(u + 1) / 2;
  }

  bytes(n) {
    if (this.pos + n > this.buf.length) throw new RangeError('Unexpected end of data');
    const out = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }
}
