import { test } from 'node:test';
import assert from 'node:assert/strict';

import { localDate, isWorkday, makeClock } from '../src/clock.js';
import { maybeDailyReset } from '../src/reset.js';
import {
  openDb,
  bookSeat,
  getSeatByPosition,
  getSeats,
  getConfig,
  CONFIG_KEYS,
} from '../src/db.js';

function dbWithBooking(position = 'back_center', name = 'Ana') {
  const db = openDb(':memory:');
  bookSeat(db, getSeatByPosition(db, position).id, name);
  return db;
}

const at = (iso, timeZone = 'Europe/Madrid') => makeClock({ now: () => new Date(iso), timeZone });

test('S8: localDate usa la zona horaria del viaje, no la del host', () => {
  // 23:30 UTC del viernes 14 todavía es viernes en Madrid (CET, +1), pero 23:30 UTC
  // del 15 ya es domingo 16 en Madrid.
  assert.equal(localDate(new Date('2025-11-14T23:30:00Z'), 'Europe/Madrid'), '2025-11-15');
  assert.equal(localDate(new Date('2025-11-14T22:30:00Z'), 'Europe/Madrid'), '2025-11-14');
  // Horario de verano: UTC+2.
  assert.equal(localDate(new Date('2025-07-01T23:30:00Z'), 'Europe/Madrid'), '2025-07-02');
  assert.equal(localDate(new Date('2025-07-01T21:30:00Z'), 'Europe/Madrid'), '2025-07-01');
  // Zona distinta cambia el día.
  assert.equal(localDate(new Date('2025-11-14T23:30:00Z'), 'UTC'), '2025-11-14');
});

test('S8: una zona horaria inválida falla en vez de inventar una fecha', () => {
  assert.throws(() => localDate(new Date('2025-11-14T10:00:00Z'), 'Marte/Olympus'));
});

test('S8: lunes a viernes son laborables; sábado y domingo no', () => {
  const expected = {
    '2025-11-10': true, // lunes
    '2025-11-11': true,
    '2025-11-12': true,
    '2025-11-13': true,
    '2025-11-14': true, // viernes
    '2025-11-15': false, // sábado
    '2025-11-16': false, // domingo
  };
  for (const [date, isDay] of Object.entries(expected)) {
    assert.equal(isWorkday(date), isDay, date);
  }
});

test('S8: una fecha mal formada no se interpreta como día laborable', () => {
  assert.throws(() => isWorkday('14/11/2025'));
});

test('S8: primer request en día laborable resetea y sella la fecha', () => {
  const db = dbWithBooking();
  const clock = at('2025-11-10T07:00:00Z', 'Europe/Madrid');

  const result = maybeDailyReset(db, clock);

  assert.equal(result.status, 'reset');
  assert.equal(getSeatByPosition(db, 'back_center').name, 'Libre');
  assert.equal(getConfig(db, CONFIG_KEYS.lastResetDate), '2025-11-10');
});

test('S8: una reserva hecha después del reseteo sobrevive al resto del día', () => {
  const db = dbWithBooking();
  const clock = at('2025-11-10T07:00:00Z', 'Europe/Madrid');
  maybeDailyReset(db, clock);

  const seat = getSeatByPosition(db, 'back_right');
  bookSeat(db, seat.id, 'Bruno');

  const second = maybeDailyReset(db, clock);

  assert.equal(second.status, 'skipped');
  assert.equal(second.reason, 'already_reset');
  assert.equal(getSeatByPosition(db, 'back_right').name, 'Bruno');
});

test('S8: sábado y domingo no resetean ni tocan last_reset_date', () => {
  const db = dbWithBooking();
  const friday = at('2025-11-14T07:00:00Z', 'Europe/Madrid');
  maybeDailyReset(db, friday);
  bookSeat(db, getSeatByPosition(db, 'back_center').id, 'Ana');

  for (const iso of ['2025-11-15T10:00:00Z', '2025-11-16T10:00:00Z']) {
    const result = maybeDailyReset(db, at(iso, 'Europe/Madrid'));
    assert.equal(result.status, 'skipped', iso);
    assert.equal(result.reason, 'weekend', iso);
  }

  assert.equal(getConfig(db, CONFIG_KEYS.lastResetDate), '2025-11-14');
  assert.equal(getSeatByPosition(db, 'back_center').name, 'Ana');
});

test('S8: el lunes resetea las reservas que quedaron del viernes', () => {
  const db = dbWithBooking();
  maybeDailyReset(db, at('2025-11-14T07:00:00Z', 'Europe/Madrid'));
  bookSeat(db, getSeatByPosition(db, 'back_center').id, 'Ana');

  const monday = maybeDailyReset(db, at('2025-11-17T06:00:00Z', 'Europe/Madrid'));

  assert.equal(monday.status, 'reset');
  assert.deepEqual(
    getSeats(db).map((s) => s.name),
    ['Patri', 'Javi', 'Paqui', 'Libre', 'Libre'],
  );
  assert.equal(getConfig(db, CONFIG_KEYS.lastResetDate), '2025-11-17');
});
