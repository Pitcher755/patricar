import { once } from 'node:events';

import { createApp } from '../src/app.js';
import { openDb } from '../src/db.js';
import { makeClock } from '../src/clock.js';

export const DEFAULT_PIN = 'PatriCar';

/**
 * Boots the real Express app on an ephemeral port so tests exercise the actual
 * HTTP stack (body parsing, limits, status codes) instead of calling handlers.
 */
export async function startServer({
  dbPath = ':memory:',
  db: existingDb,
  adminPin = DEFAULT_PIN,
  timeZone = 'Europe/Madrid',
  now = () => new Date('2025-11-10T07:00:00Z'), // lunes laborable, 08:00 en Madrid
} = {}) {
  const db = existingDb ?? openDb(dbPath);
  const clock = makeClock({ now, timeZone });
  const app = createApp({ db, adminPin, clock, logger: { warn() {}, error() {} } });

  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();

  return {
    db,
    clock,
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve) => {
        server.close(resolve);
      }),
  };
}

export function form(fields = {}) {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  };
}

export function postJson(fields = {}) {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(fields),
  };
}

/** Counts occurrences of a seat container id in a rendered document. */
export function seatContainerIds(html) {
  return [...html.matchAll(/data-seat="([a-z_]+)"/g)].map((match) => match[1]);
}
