import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startServer, form, seatContainerIds, DEFAULT_PIN } from './helpers.js';
import {
  getSeatByPosition,
  getSeat,
  getConfig,
  openDb,
  setConfig,
  bookSeat,
  releaseFixedSeat,
  CONFIG_KEYS,
} from '../src/db.js';
import { maybeDailyReset } from '../src/reset.js';
import { makeClock } from '../src/clock.js';

const idOf = (db, position) => getSeatByPosition(db, position).id;

test('S14: los textos por defecto incluyen Bar Cruiff y el título del viaje', async () => {
  const { baseUrl, close } = await startServer();
  try {
    const html = await (await fetch(`${baseUrl}/`)).text();

    assert.match(html, /Viaje hoy: Centro de Trabajo · Sede Central/);
    assert.match(html, /Punto: Bar Cruiff/);
    assert.match(html, /Punto: Parking Empresa/);
  } finally {
    await close();
  }
});

test('S14: el PIN permite editar los tres textos y se ven en la vista', async () => {
  const { baseUrl, close, db } = await startServer();
  try {
    const response = await fetch(
      `${baseUrl}/admin/text`,
      form({
        pin: DEFAULT_PIN,
        trip_title: '  Oficina Nueva · Planta 3  ',
        punto_ida: 'Bar Cruiff',
        punto_vuelta: 'Puerta Sur',
      }),
    );
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /Viaje hoy: Oficina Nueva · Planta 3/);
    assert.match(html, /Punto: Puerta Sur/);
    assert.equal(getConfig(db, CONFIG_KEYS.tripTitle), 'Oficina Nueva · Planta 3');
    assert.equal(getConfig(db, CONFIG_KEYS.puntoVuelta), 'Puerta Sur');
  } finally {
    await close();
  }
});

test('S14: PIN incorrecto no cambia los textos', async () => {
  const { baseUrl, close, db } = await startServer();
  try {
    const response = await fetch(
      `${baseUrl}/admin/text`,
      form({ pin: 'nope', trip_title: 'Hackeado', punto_ida: 'X', punto_vuelta: 'Y' }),
    );

    assert.equal(response.status, 401);
    assert.equal(getConfig(db, CONFIG_KEYS.tripTitle), 'Centro de Trabajo · Sede Central');
    assert.equal(getConfig(db, CONFIG_KEYS.puntoIda), 'Bar Cruiff');
  } finally {
    await close();
  }
});

test('S14: texto vacío o de más de 60 caracteres da 400 sin cambios', async () => {
  const { baseUrl, close, db } = await startServer();
  try {
    for (const bad of ['', '   ', 'x'.repeat(61)]) {
      const response = await fetch(
        `${baseUrl}/admin/text`,
        form({ pin: DEFAULT_PIN, trip_title: bad, punto_ida: 'Bar Cruiff', punto_vuelta: 'Sur' }),
      );
      assert.equal(response.status, 400, JSON.stringify(bad));
    }
    assert.equal(getConfig(db, CONFIG_KEYS.tripTitle), 'Centro de Trabajo · Sede Central');
  } finally {
    await close();
  }
});

test('S14: un texto con HTML se escapa en la vista', async () => {
  const { baseUrl, close } = await startServer();
  try {
    await fetch(
      `${baseUrl}/admin/text`,
      form({ pin: DEFAULT_PIN, trip_title: '<script>alert(1)</script>', punto_ida: 'X', punto_vuelta: 'Y' }),
    );
    const html = await (await fetch(`${baseUrl}/`)).text();

    assert.ok(!html.includes('<script>alert(1)</script>'));
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  } finally {
    await close();
  }
});

test('S13: el PIN libera la plaza de Paqui y queda reservable', async () => {
  const { baseUrl, close, db, clock } = await startServer();
  try {
    setConfig(db, CONFIG_KEYS.lastResetDate, clock.today());
    const paqui = idOf(db, 'back_left');

    const response = await fetch(`${baseUrl}/admin/release`, form({ pin: DEFAULT_PIN, seat_id: paqui }));
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.equal(seatContainerIds(html).length, 5);
    assert.equal(getSeat(db, paqui).is_fixed, 0);
    assert.equal(getSeat(db, paqui).name, 'Libre');

    // Y ahora cualquiera puede reservarla.
    const booking = await fetch(`${baseUrl}/api/book/${paqui}`, form({ name: 'Sole' }));
    assert.equal(booking.status, 200);
    assert.equal(getSeat(db, paqui).name, 'Sole');
  } finally {
    await close();
  }
});

test('S13: liberar sin PIN correcto no toca la plaza', async () => {
  const { baseUrl, close, db } = await startServer();
  try {
    const javi = idOf(db, 'copilot');
    for (const pin of ['', 'nope']) {
      const response = await fetch(`${baseUrl}/admin/release`, form({ pin, seat_id: javi }));
      assert.equal(response.status, 401, JSON.stringify(pin));
    }
    assert.equal(getSeat(db, javi).is_fixed, 1);
    assert.equal(getSeat(db, javi).name, 'Javi');
  } finally {
    await close();
  }
});

test('S13: la plaza de la conductora no se libera y un asiento no fijo tampoco', async () => {
  const { baseUrl, close, db } = await startServer();
  try {
    const driver = idOf(db, 'driver');
    const center = idOf(db, 'back_center');

    const driverRelease = await fetch(`${baseUrl}/admin/release`, form({ pin: DEFAULT_PIN, seat_id: driver }));
    assert.equal(driverRelease.status, 409);
    assert.equal(getSeat(db, driver).name, 'Patri');

    const dynamicRelease = await fetch(`${baseUrl}/admin/release`, form({ pin: DEFAULT_PIN, seat_id: center }));
    assert.equal(dynamicRelease.status, 409);

    const missing = await fetch(`${baseUrl}/admin/release`, form({ pin: DEFAULT_PIN, seat_id: 9999 }));
    assert.equal(missing.status, 404);
  } finally {
    await close();
  }
});

test('S13: el reseteo diario devuelve las plazas fijas a su dueño', async () => {
  const db = openDb(':memory:');
  const clock = makeClock({
    now: () => new Date('2025-11-10T07:00:00Z'),
    timeZone: 'Europe/Madrid',
  });
  maybeDailyReset(db, clock); // sella el lunes

  const paqui = idOf(db, 'back_left');
  const javi = idOf(db, 'copilot');
  setConfig(db, CONFIG_KEYS.lastResetDate, '2025-11-07'); // simulo un día nuevo

  // Libero ambas y alguien reserva la de Paqui.
  for (const id of [paqui, javi]) {
    assert.equal(getSeat(db, id).is_fixed, 1);
  }
  bookSeat(db, paqui, 'Sole'); // falla: es fija
  assert.equal(getSeat(db, paqui).name, 'Paqui');

  // Ahora sí: liberar y ocupar.
  assert.equal(releaseFixedSeat(db, paqui).ok, true);
  assert.equal(bookSeat(db, paqui, 'Sole').ok, true);
  assert.equal(getSeat(db, paqui).name, 'Sole');

  // Lunes siguiente: vuelve todo a su dueño.
  maybeDailyReset(db, clock);
  assert.equal(getSeat(db, paqui).name, 'Paqui');
  assert.equal(getSeat(db, paqui).is_fixed, 1);
  assert.equal(getSeat(db, javi).is_fixed, 1);
  assert.equal(getSeat(db, idOf(db, 'back_center')).name, 'Libre');
});
