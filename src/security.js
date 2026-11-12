import { createHash, timingSafeEqual } from 'node:crypto';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Constant-time PIN comparison: both sides are hashed first so the comparison
 * length is fixed and cannot leak the expected PIN's length.
 */
export function pinMatches(given, expected) {
  if (typeof given !== 'string' || typeof expected !== 'string' || expected.length === 0) {
    return false;
  }
  const givenDigest = createHash('sha256').update(given).digest();
  const expectedDigest = createHash('sha256').update(expected).digest();
  return timingSafeEqual(givenDigest, expectedDigest);
}

/** Accepts only 24h `HH:MM` strings. */
export function isValidTime(value) {
  return typeof value === 'string' && TIME_PATTERN.test(value);
}
