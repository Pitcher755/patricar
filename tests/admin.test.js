import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startServer, form, seatContainerIds, DEFAULT_PIN } from './helpers.js';
import {
  getSeatByPosition,
  getConfig,
  bookSeat,
  setConfig,
  CONFIG_KEYS,
} from '../src/db.js';

test('S6: PIN correcto actualiza los horarios y devuelve la interfaz', async () => {
  const { baseUrl, close, db } = await startServer();
  try {
    const response = await fetch(
      `${baseUrl}/admin/time`,
      form({ pin: DEFAULT_PIN, time_ida: '07:45', time_vuelta: '16:15' }),
    );
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.match(html, /id="ida-display"[^>]*>\s*07:45\s*</);
    assert.match(html, /id="vuelta-display"[^>]*>\s*16:15\s*</);
    // Devuelve la interfaz completa del coche, con el panel abierto para seguir operando.
    assert.equal(seatContainerIds(html).length, 5);
    assert.match(html, /data-admin-toggle-text>Cerrar</);
    assert.equal(getConfig(db, CONFIG_KEYS.timeIda), '07:45');
    assert.equal(getConfig(db, CONFIG_KEYS.timeVuelta), '16:15');
  } finally {
    await close();
  }
});

test('S6: PIN incorrecto devuelve 401 y no modifica los horarios', async () => {
  const { baseUrl, close, db } = await startServer();
  try {
    const response = await fetch(
      `${baseUrl}/admin/time`,
      form({ pin: 'incorrecto', time_ida: '07:45', time_vuelta: '16:15' }),
    );
    const html = await response.text();

    assert.equal(response.status, 401);
    assert.match(html, /PIN incorrecto/);
    assert.equal(getConfig(db, CONFIG_KEYS.timeIda), '08:00');
    assert.equal(getConfig(db, CONFIG_KEYS.timeVuelta), '17:00');
  } finally {
    await close();
  }
});

test('S6: sin PIN también es 401 (no se puede omitir el campo)', async () => {
  const { baseUrl, close } = await startServer();
  try {
    const response = await fetch(
      `${baseUrl}/admin/time`,
      form({ time_ida: '07:45', time_vuelta: '16:15' }),
    );
    assert.equal(response.status, 401);
  } finally {
    await close();
  }
});

test('S6: el PIN se compara con el configurado, no con uno hardcodeado', async () => {
  const { baseUrl, close } = await startServer({ adminPin: 'otro-pin' });
  try {
    const wrong = await fetch(
      `${baseUrl}/admin/time`,
      form({ pin: DEFAULT_PIN, time_ida: '07:45', time_vuelta: '16:15' }),
    );
    assert.equal(wrong.status, 401);

    const right = await fetch(
      `${baseUrl}/admin/time`,
      form({ pin: 'otro-pin', time_ida: '07:45', time_vuelta: '16:15' }),
    );
    assert.equal(right.status, 200);
  } finally {
    await close();
  }
});

test('S6: horas inválidas devuelven 400 sin modificar nada', async () => {
  const { baseUrl, close, db } = await startServer();
  try {
    for (const bad of ['7:45', '25:00', '12:60', 'abc', '', '<script>x</script>', '08:00:00']) {
      const response = await fetch(
        `${baseUrl}/admin/time`,
        form({ pin: DEFAULT_PIN, time_ida: bad, time_vuelta: '16:15' }),
      );
      assert.equal(response.status, 400, `debería rechazar ${JSON.stringify(bad)}`);
    }
    assert.equal(getConfig(db, CONFIG_KEYS.timeIda), '08:00');
    assert.equal(getConfig(db, CONFIG_KEYS.timeVuelta), '17:00');
  } finally {
    await close();
  }
});

test('S6: los extremos 00:00 y 23:59 son horas válidas', async () => {
  const { baseUrl, close, db } = await startServer();
  try {
    const response = await fetch(
      `${baseUrl}/admin/time`,
      form({ pin: DEFAULT_PIN, time_ida: '00:00', time_vuelta: '23:59' }),
    );
    assert.equal(response.status, 200);
    assert.equal(getConfig(db, CONFIG_KEYS.timeIda), '00:00');
    assert.equal(getConfig(db, CONFIG_KEYS.timeVuelta), '23:59');
  } finally {
    await close();
  }
});

test('S7: el reseteo manual vacía las plazas dinámicas y devuelve el coche', async () => {
  const { baseUrl, close, db, clock } = await startServer();
  try {
    setConfig(db, CONFIG_KEYS.lastResetDate, clock.today());
    bookSeat(db, getSeatByPosition(db, 'back_center').id, 'Ana');
    bookSeat(db, getSeatByPosition(db, 'back_right').id, 'Bruno');

    const response = await fetch(`${baseUrl}/admin/reset`, form({ pin: DEFAULT_PIN }));
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.equal(seatContainerIds(html).length, 5);
    assert.equal(html.split('data-state="free"').length - 1, 2);
    assert.match(html, /id="badge-free" data-count="2"/);
    assert.equal(getSeatByPosition(db, 'back_center').name, 'Libre');
    assert.equal(getSeatByPosition(db, 'back_right').name, 'Libre');
    assert.equal(getSeatByPosition(db, 'back_left').name, 'Paqui');
  } finally {
    await close();
  }
});

test('S7: el reseteo manual con PIN incorrecto devuelve 401 y no vacía nada', async () => {
  const { baseUrl, close, db, clock } = await startServer();
  try {
    setConfig(db, CONFIG_KEYS.lastResetDate, clock.today());
    bookSeat(db, getSeatByPosition(db, 'back_center').id, 'Ana');

    const response = await fetch(`${baseUrl}/admin/reset`, form({ pin: 'nope' }));

    assert.equal(response.status, 401);
    assert.equal(getSeatByPosition(db, 'back_center').name, 'Ana');
  } finally {
    await close();
  }
});

test('S7: un 401 de reseteo no filtra el PIN esperado ni el hash', async () => {
  const pin = 'pin-super-secreto';
  const { baseUrl, close } = await startServer({ adminPin: pin });
  try {
    const html = await (
      await fetch(`${baseUrl}/admin/reset`, form({ pin: 'intento-equivocado' }))
    ).text();

    assert.doesNotMatch(html, new RegExp(pin));
    assert.doesNotMatch(html, /[a-f0-9]{64}/);
  } finally {
    await close();
  }
});

test('S12: body >10 kb en /admin/time devuelve 413 sin modificar config', async () => {
  const { baseUrl, close, db } = await startServer();
  try {
    const response = await fetch(
      `${baseUrl}/admin/time`,
      form({ pin: DEFAULT_PIN, time_ida: '07:00', time_vuelta: '18:00', pad: 'x'.repeat(11 * 1024) }),
    );

    assert.equal(response.status, 413);
    assert.equal(getConfig(db, CONFIG_KEYS.timeIda), '08:00');
    assert.equal(getConfig(db, CONFIG_KEYS.timeVuelta), '17:00');
  } finally {
    await close();
  }
});
