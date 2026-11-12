import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startServer, form, postJson, seatContainerIds } from './helpers.js';
import { getSeat, getSeatByPosition, setConfig, CONFIG_KEYS } from '../src/db.js';

const XSS_NAME = '<script>alert(1)</script>';

function sealToday(db, clock) {
  setConfig(db, CONFIG_KEYS.lastResetDate, clock.today());
}

test('S4: reservar por HTMX devuelve sólo el fragmento del asiento, ya ocupado', async () => {
  const { baseUrl, close, db, clock } = await startServer();
  try {
    sealToday(db, clock);
    const seat = getSeatByPosition(db, 'back_center');

    const response = await fetch(`${baseUrl}/api/book/${seat.id}`, form({ name: '  Bruno  ' }));
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.deepEqual(seatContainerIds(html), ['back_center']);
    assert.match(html, /data-state="booked"/);
    assert.match(html, />Bruno</);
    assert.match(html, new RegExp(`hx-post="/api/unbook/${seat.id}"`));
    assert.equal(getSeat(db, seat.id).name, 'Bruno');
  } finally {
    await close();
  }
});

test('S4: reservar con JSON también funciona (contrato de payload)', async () => {
  const { baseUrl, close, db, clock } = await startServer();
  try {
    sealToday(db, clock);
    const seat = getSeatByPosition(db, 'back_right');

    const response = await fetch(`${baseUrl}/api/book/${seat.id}`, postJson({ name: 'Caro' }));

    assert.equal(response.status, 200);
    assert.equal(getSeat(db, seat.id).name, 'Caro');
  } finally {
    await close();
  }
});

test('S4: los rechazos devuelven su status y no tocan la base', async () => {
  const { baseUrl, close, db, clock } = await startServer();
  try {
    sealToday(db, clock);
    const driver = getSeatByPosition(db, 'driver');
    const center = getSeatByPosition(db, 'back_center');
    const copilot = getSeatByPosition(db, 'copilot');

    const fixed = await fetch(`${baseUrl}/api/book/${driver.id}`, form({ name: 'Ana' }));
    assert.equal(fixed.status, 409);
    assert.equal(getSeat(db, driver.id).name, 'Patri');

    const missing = await fetch(`${baseUrl}/api/book/9999`, form({ name: 'Ana' }));
    assert.equal(missing.status, 404);

    const garbageId = await fetch(`${baseUrl}/api/book/abc`, form({ name: 'Ana' }));
    assert.equal(garbageId.status, 404);

    const empty = await fetch(`${baseUrl}/api/book/${center.id}`, form({ name: '   ' }));
    assert.equal(empty.status, 400);
    assert.equal(getSeat(db, center.id).name, 'Libre');

    const tooLong = await fetch(`${baseUrl}/api/book/${center.id}`, form({ name: 'x'.repeat(41) }));
    assert.equal(tooLong.status, 400);
    assert.equal(getSeat(db, center.id).name, 'Libre');

    const missingName = await fetch(`${baseUrl}/api/book/${center.id}`, form({}));
    assert.equal(missingName.status, 400);

    // El asiento del copiloto sigue siendo de Javi tras todos los rechazos.
    assert.equal(getSeat(db, copilot.id).name, 'Javi');
  } finally {
    await close();
  }
});

test('S4: reservar un asiento ya ocupado devuelve 409 y conserva al ocupante', async () => {
  const { baseUrl, close, db, clock } = await startServer();
  try {
    sealToday(db, clock);
    const seat = getSeatByPosition(db, 'back_center');
    await fetch(`${baseUrl}/api/book/${seat.id}`, form({ name: 'Ana' }));

    const second = await fetch(`${baseUrl}/api/book/${seat.id}`, form({ name: 'Bruno' }));
    const html = await second.text();

    assert.equal(second.status, 409);
    assert.match(html, /Ana/);
    assert.equal(getSeat(db, seat.id).name, 'Ana');
  } finally {
    await close();
  }
});

test('S5: liberar por HTMX devuelve el asiento libre y vuelve a ofrecer reserva', async () => {
  const { baseUrl, close, db, clock } = await startServer();
  try {
    sealToday(db, clock);
    const seat = getSeatByPosition(db, 'back_center');
    await fetch(`${baseUrl}/api/book/${seat.id}`, form({ name: 'Ana' }));

    const response = await fetch(`${baseUrl}/api/unbook/${seat.id}`, { method: 'POST' });
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.deepEqual(seatContainerIds(html), ['back_center']);
    assert.match(html, /data-state="free"/);
    assert.match(html, /¡Libre!/);
    assert.match(html, new RegExp(`hx-post="/api/book/${seat.id}"`));
    assert.equal(getSeat(db, seat.id).name, 'Libre');
  } finally {
    await close();
  }
});

test('S5: liberar sin auth es idempotente; un asiento fijo devuelve 409', async () => {
  const { baseUrl, close, db } = await startServer();
  try {
    const center = getSeatByPosition(db, 'back_center');
    const driver = getSeatByPosition(db, 'driver');

    const first = await fetch(`${baseUrl}/api/unbook/${center.id}`, { method: 'POST' });
    const second = await fetch(`${baseUrl}/api/unbook/${center.id}`, { method: 'POST' });
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(getSeat(db, center.id).name, 'Libre');

    const fixed = await fetch(`${baseUrl}/api/unbook/${driver.id}`, { method: 'POST' });
    assert.equal(fixed.status, 409);
    assert.equal(getSeat(db, driver.id).name, 'Patri');

    const missing = await fetch(`${baseUrl}/api/unbook/9999`, { method: 'POST' });
    assert.equal(missing.status, 404);
  } finally {
    await close();
  }
});

test('S12: un nombre con HTML se escapa en el fragmento y en la vista', async () => {
  const { baseUrl, close, db, clock } = await startServer();
  try {
    sealToday(db, clock);
    const seat = getSeatByPosition(db, 'back_center');

    const response = await fetch(`${baseUrl}/api/book/${seat.id}`, form({ name: XSS_NAME }));
    const fragment = await response.text();

    assert.equal(response.status, 200);
    assert.ok(!fragment.includes(XSS_NAME), 'el fragmento no debe contener el script crudo');
    assert.match(fragment, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);

    const page = await (await fetch(`${baseUrl}/`)).text();
    assert.ok(!page.includes(XSS_NAME), 'la vista no debe contener el script crudo');
    assert.match(page, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  } finally {
    await close();
  }
});

test('S4: reservar y liberar a través de la app deja la vista consistente', async () => {
  const { baseUrl, close, db, clock } = await startServer();
  try {
    sealToday(db, clock);
    const center = getSeatByPosition(db, 'back_center');
    const right = getSeatByPosition(db, 'back_right');

    await fetch(`${baseUrl}/api/book/${center.id}`, form({ name: 'Ana' }));
    await fetch(`${baseUrl}/api/book/${right.id}`, form({ name: 'Bruno' }));

    let page = await (await fetch(`${baseUrl}/`)).text();
    assert.match(page, /id="badge-free" data-count="0"/);
    assert.match(page, /¡Coche lleno!/);
    assert.match(page, />Ana</);
    assert.match(page, />Bruno</);

    await fetch(`${baseUrl}/api/unbook/${center.id}`, { method: 'POST' });

    page = await (await fetch(`${baseUrl}/`)).text();
    assert.match(page, /id="badge-free" data-count="1"/);
    assert.match(page, />Bruno</);
  } finally {
    await close();
  }
});
