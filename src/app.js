import express from 'express';

import {
  CONFIG_KEYS,
  getConfig,
  getSeat,
  getSeats,
  bookSeat,
  unbookSeat,
  resetDynamicSeats,
  setConfig,
} from './db.js';
import { dailyResetMiddleware } from './reset.js';
import { pinMatches, isValidTime } from './security.js';
import { renderPage, renderMain, renderSeat } from './views.js';

export const BODY_LIMIT = '10kb';

export const PIN_ERROR = 'PIN incorrecto. Probá otra vez.';
export const TIME_ERROR = 'Las horas van en formato HH:MM (24 h).';

/**
 * Builds the Express app. Dependencies are injected so tests can control the
 * clock, the PIN and the database without touching global state.
 */
export function createApp({ db, adminPin, clock, logger = console }) {
  const app = express();
  app.disable('x-powered-by');

  app.use(express.urlencoded({ extended: false, limit: BODY_LIMIT }));
  app.use(express.json({ limit: BODY_LIMIT }));
  app.use(dailyResetMiddleware(db, clock, (error) => logger.error?.(error)));

  app.get('/health', (req, res) => {
    try {
      db.prepare('SELECT 1 AS ok').get();
      res.json({ status: 'ok' });
    } catch (error) {
      logger.error?.(error);
      res.status(503).json({ status: 'unavailable' });
    }
  });

  app.get('/', (req, res) => {
    res.type('html').send(renderPage(viewState(db)));
  });

  app.post('/api/book/:id', (req, res) => {
    const id = parseSeatId(req.params.id);
    if (id === null) return res.status(404).type('text').send('Seat not found');

    const result = bookSeat(db, id, req.body?.name);
    if (result.ok) {
      return sendFragment(res, 200, renderSeat(result.seat), '¡Plaza reservada con éxito!');
    }
    if (!result.seat) return res.status(404).type('text').send('Seat not found');
    return sendFragment(res, result.code, renderSeat(result.seat, { error: messageFor(result) }));
  });

  app.post('/api/unbook/:id', (req, res) => {
    const id = parseSeatId(req.params.id);
    if (id === null) return res.status(404).type('text').send('Seat not found');

    const result = unbookSeat(db, id);
    if (result.ok) {
      return sendFragment(res, 200, renderSeat(result.seat), 'Has liberado la plaza.');
    }
    if (!result.seat) return res.status(404).type('text').send('Seat not found');
    return sendFragment(res, result.code, renderSeat(result.seat, { error: messageFor(result) }));
  });

  app.post('/admin/time', (req, res) => {
    const { pin, time_ida: timeIda, time_vuelta: timeVuelta } = req.body ?? {};

    if (!pinMatches(pin, adminPin)) {
      return res
        .status(401)
        .type('html')
        .send(renderMain(viewState(db, { adminOpen: true, error: PIN_ERROR })));
    }
    if (!isValidTime(timeIda) || !isValidTime(timeVuelta)) {
      return res
        .status(400)
        .type('html')
        .send(renderMain(viewState(db, { adminOpen: true, error: TIME_ERROR })));
    }

    setConfig(db, CONFIG_KEYS.timeIda, timeIda);
    setConfig(db, CONFIG_KEYS.timeVuelta, timeVuelta);

    return res
      .status(200)
      .type('html')
      .send(
        renderMain(
          viewState(db, { adminOpen: true, notice: `Horarios actualizados: ${timeIda} / ${timeVuelta}.` }),
        ),
      );
  });

  app.post('/admin/reset', (req, res) => {
    const { pin } = req.body ?? {};

    if (!pinMatches(pin, adminPin)) {
      return res
        .status(401)
        .type('html')
        .send(renderMain(viewState(db, { adminOpen: true, error: PIN_ERROR })));
    }

    const cleared = resetDynamicSeats(db);

    return res.status(200).type('html').send(
      renderMain(
        viewState(db, {
          adminOpen: true,
          notice:
            cleared === 0
              ? 'No había plazas ocupadas que liberar.'
              : `Plazas liberadas: ${cleared}.`,
        }),
      ),
    );
  });

  app.use((req, res) => {
    res.status(404).type('text').send('Not found');
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error?.type === 'entity.too.large') {
      return res.status(413).type('text').send('Payload too large');
    }
    if (error instanceof SyntaxError && 'body' in error) {
      return res.status(400).type('text').send('Invalid JSON body');
    }
    logger.error?.(error);
    return res.status(500).type('text').send('Internal error');
  });

  return app;
}

export function viewState(db, extra = {}) {
  return {
    seats: getSeats(db),
    timeIda: getConfig(db, CONFIG_KEYS.timeIda),
    timeVuelta: getConfig(db, CONFIG_KEYS.timeVuelta),
    ...extra,
  };
}

/** Only positive integer ids reach the database. */
function parseSeatId(raw) {
  return /^\d+$/.test(raw ?? '') ? Number(raw) : null;
}

function messageFor(result) {
  if (result.error === 'fixed_seat') return 'Esa plaza es fija, no se puede tocar.';
  if (result.error === 'seat_taken') return `Esa plaza ya es de ${result.seat?.name ?? 'otra persona'}.`;
  return 'Poné un nombre de hasta 40 caracteres.';
}

function sendFragment(res, status, html, toast) {
  res.type('html');
  if (toast) {
    res.set('HX-Trigger', JSON.stringify({ 'patricar:toast': { message: toast } }));
  }
  return res.status(status).send(html);
}
