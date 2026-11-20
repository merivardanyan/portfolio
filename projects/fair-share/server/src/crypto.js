import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Hex SHA-256. Tokens are 256-bit random, so a fast hash is fine (no password stretching needed). */
export const sha256 = (s) => createHash('sha256').update(s).digest('hex');

/** 32 random bytes, base64url (43 chars). */
export const newToken = () => randomBytes(32).toString('base64url');

export const TOKEN_RE = /^[A-Za-z0-9_-]{20,100}$/;

/** Constant-time check of a presented token against a stored sha256 hex hash. */
export function tokenMatches(token, storedHash) {
  if (typeof token !== 'string' || !TOKEN_RE.test(token) || typeof storedHash !== 'string' || storedHash.length !== 64) return false;
  const a = Buffer.from(sha256(token), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
