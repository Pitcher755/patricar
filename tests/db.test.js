import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  openDb,
  getSeats,
  getSeat,
  getSeatByPosition,
  getConfig,
  setConfig,
  bookSeat,
  unbookSeat,
  resetDynamicSeats,
  CONFIG_KEYS,
} from '../src/db.js';

function fresh() {
  const db = openDb(':memory:');
  return db;
}

test('S3: el esquema siembra los 5 asientos con nombres y fijos exactos', () => {
  const db = fresh();
  const seats = getSeats(db);

  assert.deepEqual(
    seats.map((s) => [s.position, s.name, s.is_fixed]),
    [
      ['driver', 'Patri', 1],
      ['copilot', 'Javi', 1],
      ['back_left', 'Paqui', 1],
      ['back_center', 'Libre', 0],
      ['back_right', 'Libre', 0],
    ],
  );
});

test('S3: abrir la base dos veces no duplica ni pisa nombres ya cambiados', () => {
  const path = ':memory:';
  const first = openDb(path);
  assert.equal(bookSeat(first, idOf(first, 'back_center'), 'Ana').ok, true);
  assert.equal(getSeatByPosition(first, 'back_center').name, 'Ana');

  // Reabrir sobre la misma conexión no debe re-sembrar ni pisar datos.
  const second = openDb(path, { db: first });
  assert.equal(getSeats(second).length, 5);
  assert.equal(getSeatByPosition(second, 'back_center').name, 'Ana');
});

test('S3: config devuelve defaults y persiste valores', () => {
  const db = fresh();

  assert.equal(getConfig(db, CONFIG_KEYS.timeIda), '08:00');
  assert.equal(getConfig(db, CONFIG_KEYS.timeVuelta), '17:00');
  assert.equal(getConfig(db, CONFIG_KEYS.lastResetDate), '');

  setConfig(db, CONFIG_KEYS.timeIda, '07:45');
  assert.equal(getConfig(db, CONFIG_KEYS.timeIda), '07:45');

  setConfig(db, CONFIG_KEYS.timeIda, '07:50');
  assert.equal(getConfig(db, CONFIG_KEYS.timeIda), '07:50');
});

test('S4: reservar un asiento libre lo ocupa y devuelve el asiento', () => {
  const db = fresh();
  const seat = getSeatByPosition(db, 'back_right');

  const result = bookSeat(db, seat.id, '  Ana  ');

  assert.equal(result.ok, true);
  assert.equal(result.seat.name, 'Ana');
  assert.equal(getSeat(db, seat.id).name, 'Ana');
});

test('S4: reservar un asiento fijo devuelve 409 y no modifica nada', () => {
  const db = fresh();
  const driver = getSeatByPosition(db, 'driver');

  const result = bookSeat(db, driver.id, 'Ana');

  assert.equal(result.ok, false);
  assert.equal(result.code, 409);
  assert.equal(getSeat(db, driver.id).name, 'Patri');
});

test('S4: reservar un asiento ya ocupado devuelve 409 y conserva al ocupante', () => {
  const db = fresh();
  const seat = getSeatByPosition(db, 'back_center');
  bookSeat(db, seat.id, 'Ana');

  const result = bookSeat(db, seat.id, 'Bruno');

  assert.equal(result.ok, false);
  assert.equal(result.code, 409);
  assert.equal(getSeat(db, seat.id).name, 'Ana');
});

test('S4: reservar un id inexistente devuelve 404', () => {
  const db = fresh();
  const result = bookSeat(db, 9999, 'Ana');
  assert.equal(result.ok, false);
  assert.equal(result.code, 404);
});

test('S4: nombre vacío, sólo espacios o de más de 40 caracteres devuelve 400', () => {
  const db = fresh();
  const seat = getSeatByPosition(db, 'back_center');

  for (const bad of ['', '   ', '\n\t ', 'x'.repeat(41)]) {
    const result = bookSeat(db, seat.id, bad);
    assert.equal(result.ok, false, `debería rechazar ${JSON.stringify(bad)}`);
    assert.equal(result.code, 400);
    assert.equal(getSeat(db, seat.id).name, 'Libre');
  }
});

test('S4: 40 caracteres es el límite aceptado y se recorta el espacio exterior', () => {
  const db = fresh();
  const seat = getSeatByPosition(db, 'back_center');
  const name = 'x'.repeat(40);

  const result = bookSeat(db, seat.id, `  ${name}  `);

  assert.equal(result.ok, true);
  assert.equal(result.seat.name, name);
});

test('S5: liberar un asiento reservado vuelve a Libre', () => {
  const db = fresh();
  const seat = getSeatByPosition(db, 'back_right');
  bookSeat(db, seat.id, 'Ana');

  const result = unbookSeat(db, seat.id);

  assert.equal(result.ok, true);
  assert.equal(result.seat.name, 'Libre');
  assert.equal(getSeat(db, seat.id).name, 'Libre');
});

test('S5: liberar un asiento fijo devuelve 409 sin cambios; un id inexistente 404', () => {
  const db = fresh();
  const copilot = getSeatByPosition(db, 'copilot');

  const fixed = unbookSeat(db, copilot.id);
  assert.equal(fixed.ok, false);
  assert.equal(fixed.code, 409);
  assert.equal(getSeat(db, copilot.id).name, 'Javi');

  const missing = unbookSeat(db, 9999);
  assert.equal(missing.ok, false);
  assert.equal(missing.code, 404);
});

test('S5: liberar un asiento ya libre es idempotente', () => {
  const db = fresh();
  const seat = getSeatByPosition(db, 'back_center');

  const first = unbookSeat(db, seat.id);
  const second = unbookSeat(db, seat.id);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.seat.name, 'Libre');
});

test('S7: el reseteo limpia sólo los asientos dinámicos', () => {
  const db = fresh();
  bookSeat(db, idOf(db, 'back_center'), 'Ana');
  bookSeat(db, idOf(db, 'back_right'), 'Bruno');

  const cleared = resetDynamicSeats(db);

  assert.equal(cleared, 2);
  assert.deepEqual(
    getSeats(db).map((s) => s.name),
    ['Patri', 'Javi', 'Paqui', 'Libre', 'Libre'],
  );
});

test('S7: el reseteo es idempotente y devuelve 0 cuando no había nada reservado', () => {
  const db = fresh();
  assert.equal(resetDynamicSeats(db), 0);
  assert.equal(resetDynamicSeats(db), 0);
});

function idOf(db, position) {
  return getSeatByPosition(db, position).id;
}
