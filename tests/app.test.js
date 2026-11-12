import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startServer, form } from './helpers.js';
import { loadConfig, DEFAULT_ADMIN_PIN } from '../src/config.js';
import { openDb, getSeatByPosition, getConfig, setConfig, CONFIG_KEYS, bookSeat } from '../src/db.js';

test('S10: GET /health responde 200 con la base consultable', async () => {
  const { baseUrl, close } = await startServer();
  try {
    const response = await fetch(`${baseUrl}/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /application\/json/);
    assert.deepEqual(body, { status: 'ok' });
  } finally {
    await close();
  }
});

test('S12: /health no expone el PIN ni rutas del filesystem', async () => {
  const { baseUrl, close } = await startServer({ adminPin: 'pin-oculto-99' });
  try {
    const raw = await (await fetch(`${baseUrl}/health`)).text();

    assert.doesNotMatch(raw, /pin-oculto-99/);
    assert.doesNotMatch(raw, /\/home|\/app|sqlite/i);
  } finally {
    await close();
  }
});

test('S12: un body de más de 10 kb devuelve 413 y no crea la reserva', async () => {
  const { baseUrl, close, db, clock } = await startServer();
  try {
    const seat = getSeatByPosition(db, 'back_center');
    const response = await fetch(
      `${baseUrl}/api/book/${seat.id}`,
      form({ name: 'x'.repeat(11 * 1024) }),
    );

    assert.equal(response.status, 413);
    assert.equal(getSeatByPosition(db, 'back_center').name, 'Libre');
    assert.equal(clock.today().length, 10);
  } finally {
    await close();
  }
});

test('S12: un JSON inválido devuelve 400 sin romper el servidor', async () => {
  const { baseUrl, close, db } = await startServer();
  try {
    const seat = getSeatByPosition(db, 'back_right');
    const response = await fetch(`${baseUrl}/api/book/${seat.id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"name": ',
    });

    assert.equal(response.status, 400);
    assert.equal(getSeatByPosition(db, 'back_right').name, 'Libre');
    // El servidor sigue vivo después del body inválido.
    assert.equal((await fetch(`${baseUrl}/health`)).status, 200);
  } finally {
    await close();
  }
});

test('S12: no se anuncia Express y una ruta desconocida da 404', async () => {
  const { baseUrl, close } = await startServer();
  try {
    const response = await fetch(`${baseUrl}/no-existe`);

    assert.equal(response.status, 404);
    assert.equal(response.headers.get('x-powered-by'), null);
  } finally {
    await close();
  }
});

test('S8: el middleware resetea en el primer request laborable del día', async () => {
  const { baseUrl, close, db } = await startServer();
  try {
    // Reserva escrita "de ayer": la base no tiene last_reset_date de hoy.
    bookSeat(db, getSeatByPosition(db, 'back_center').id, 'Ana');
    assert.equal(getSeatByPosition(db, 'back_center').name, 'Ana');

    await fetch(`${baseUrl}/health`);

    assert.equal(getSeatByPosition(db, 'back_center').name, 'Libre');
    assert.equal(getConfig(db, CONFIG_KEYS.lastResetDate), '2025-11-10');
  } finally {
    await close();
  }
});

test('S9: sin ADMIN_PIN arranca con el default y avisa por log una sola vez', () => {
  const warnings = [];
  const config = loadConfig({}, { warn: (message) => warnings.push(message) });

  assert.equal(config.adminPin, DEFAULT_ADMIN_PIN);
  assert.equal(DEFAULT_ADMIN_PIN, 'PatriCar');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /ADMIN_PIN/);
});

test('S9: ADMIN_PIN definido se respeta y no se avisa', () => {
  const warnings = [];
  const config = loadConfig({ ADMIN_PIN: '  secreto  ' }, { warn: (m) => warnings.push(m) });

  assert.equal(config.adminPin, 'secreto');
  assert.equal(warnings.length, 0);
});

test('S9: PORT se valida y cae al default cuando es inválido', () => {
  assert.equal(loadConfig({ PORT: '8080' }, { warn() {} }).port, 8080);
  assert.equal(loadConfig({}, { warn() {} }).port, 3000);
  assert.equal(loadConfig({ PORT: 'abc' }, { warn() {} }).port, 3000);
  assert.equal(loadConfig({ PORT: '0' }, { warn() {} }).port, 3000);
  assert.equal(loadConfig({ PORT: '99999' }, { warn() {} }).port, 3000);
});

test('S9: DB_PATH y TIMEZONE tienen defaults operativos', () => {
  const config = loadConfig({}, { warn() {} });

  assert.equal(config.dbPath, './data/patricar.sqlite');
  assert.equal(config.timeZone, 'Europe/Madrid');
  assert.equal(loadConfig({ TIMEZONE: 'UTC' }, { warn() {} }).timeZone, 'UTC');
  assert.equal(loadConfig({ DB_PATH: '/tmp/x.sqlite' }, { warn() {} }).dbPath, '/tmp/x.sqlite');
});

test('S8: sábado y domingo no resetean por HTTP ni tocan last_reset_date', async () => {
  const db = openDb(':memory:');
  setConfig(db, CONFIG_KEYS.lastResetDate, '2025-11-14'); // viernes
  bookSeat(db, getSeatByPosition(db, 'back_center').id, 'Ana');

  for (const iso of ['2025-11-15T10:00:00Z', '2025-11-16T10:00:00Z']) {
    const { baseUrl, close } = await startServer({ db, now: () => new Date(iso) });
    try {
      await fetch(`${baseUrl}/`);
      await fetch(`${baseUrl}/health`);
      await fetch(`${baseUrl}/no-ruta`);

      assert.equal(getSeatByPosition(db, 'back_center').name, 'Ana', iso);
      assert.equal(getConfig(db, CONFIG_KEYS.lastResetDate), '2025-11-14', iso);
    } finally {
      await close();
    }
  }
});
