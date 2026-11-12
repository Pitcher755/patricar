import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startServer, seatContainerIds } from './helpers.js';
import { getSeatByPosition, bookSeat, setConfig, CONFIG_KEYS } from '../src/db.js';

test('S1: GET / responde 200 HTML con los 5 asientos en orden de posición', async () => {
  const { baseUrl, close } = await startServer();
  try {
    const response = await fetch(`${baseUrl}/`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.deepEqual(seatContainerIds(html), [
      'driver',
      'copilot',
      'back_left',
      'back_center',
      'back_right',
    ]);
  } finally {
    await close();
  }
});

test('S1: los 3 fijos muestran a sus dueños y los 2 dinámicos arrancan libres', async () => {
  const { baseUrl, close } = await startServer();
  try {
    const html = await (await fetch(`${baseUrl}/`)).text();

    assert.match(html, />Patri</);
    assert.match(html, />Javi</);
    assert.match(html, />Paqui</);
    assert.equal(count(html, '¡Libre!'), 2);
    assert.equal(count(html, 'data-state="free"'), 2);
    assert.equal(count(html, 'data-state="fixed"'), 3);
    assert.match(html, /Conductora/);
    assert.match(html, /Copiloto/);
  } finally {
    await close();
  }
});

test('S1: los badges del coche cuentan 3 ocupadas y 2 libres', async () => {
  const { baseUrl, close } = await startServer();
  try {
    const html = await (await fetch(`${baseUrl}/`)).text();
    assert.match(html, /id="badge-occupied" data-count="3"/);
    assert.match(html, /id="badge-free" data-count="2"/);
    assert.match(html, /3 Ocupadas/);
    assert.match(html, /2 Libres/);
  } finally {
    await close();
  }
});

test('S1: la vista muestra los horarios por defecto 08:00 y 17:00', async () => {
  const { baseUrl, close } = await startServer();
  try {
    const html = await (await fetch(`${baseUrl}/`)).text();
    assert.match(html, /id="ida-display"[^>]*>\s*08:00\s*</);
    assert.match(html, /id="vuelta-display"[^>]*>\s*17:00\s*</);
  } finally {
    await close();
  }
});

test('S1: la vista muestra el nombre del ocupante dinámico cuando está reservado', async () => {
  const { baseUrl, close, db, clock } = await startServer();
  try {
    // Sellamos el día para que el middleware no borre la reserva de este test.
    setConfig(db, CONFIG_KEYS.lastResetDate, clock.today());
    const seat = getSeatByPosition(db, 'back_center');
    bookSeat(db, seat.id, 'Ana');

    const html = await (await fetch(`${baseUrl}/`)).text();

    assert.match(html, /data-seat="back_center" data-state="booked"/);
    assert.match(html, /data-seat="back_right" data-state="free"/);
    assert.match(html, />Ana</);
    assert.match(html, /id="badge-occupied" data-count="4"/);
    assert.match(html, /id="badge-free" data-count="1"/);
    assert.match(html, /1 Libre/);
  } finally {
    await close();
  }
});

test('S2: la vista carga el diseño aprobado (Tailwind CDN, Lucide, Inter, paleta)', async () => {
  const { baseUrl, close } = await startServer();
  try {
    const html = await (await fetch(`${baseUrl}/`)).text();

    assert.match(html, /cdn\.tailwindcss\.com/);
    assert.match(html, /unpkg\.com\/lucide/);
    assert.match(html, /family=Inter/);
    assert.match(html, /#3b9e80/);
    assert.match(html, /#7c3aed/);
    assert.match(html, /class="dark"/);
    assert.match(html, /PatriCar/);
    assert.match(html, /Reserva tu plaza sin spam de WhatsApp/);
    // El estado de las reservas vive en el servidor, no en JS del cliente.
    assert.doesNotMatch(html, /function confirmSeat/);
  } finally {
    await close();
  }
});

test('S12: el PIN nunca se renderiza en el HTML servido', async () => {
  const pin = 'clave-secreta-123';
  const { baseUrl, close } = await startServer({ adminPin: pin });
  try {
    const html = await (await fetch(`${baseUrl}/`)).text();

    assert.doesNotMatch(html, new RegExp(pin));
    assert.doesNotMatch(html, /PIN demo/);
    assert.doesNotMatch(html, /1234/);
  } finally {
    await close();
  }
});

test('S1: los asientos dinámicos traen el formulario HTMX de reserva', async () => {
  const { baseUrl, close, db } = await startServer();
  try {
    const html = await (await fetch(`${baseUrl}/`)).text();
    const center = getSeatByPosition(db, 'back_center');
    const right = getSeatByPosition(db, 'back_right');

    assert.match(html, new RegExp(`hx-post="/api/book/${center.id}"`));
    assert.match(html, new RegExp(`hx-post="/api/book/${right.id}"`));
    assert.match(html, /name="name"/);
  } finally {
    await close();
  }
});

function count(html, needle) {
  return html.split(needle).length - 1;
}
