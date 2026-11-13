import Database from 'better-sqlite3';

export const CONFIG_KEYS = Object.freeze({
  timeIda: 'time_ida',
  timeVuelta: 'time_vuelta',
  lastResetDate: 'last_reset_date',
  tripTitle: 'trip_title',
  puntoIda: 'punto_ida',
  puntoVuelta: 'punto_vuelta',
});

export const CONFIG_DEFAULTS = Object.freeze({
  [CONFIG_KEYS.timeIda]: '08:00',
  [CONFIG_KEYS.timeVuelta]: '17:00',
  [CONFIG_KEYS.lastResetDate]: '',
  [CONFIG_KEYS.tripTitle]: 'Centro de Trabajo · Sede Central',
  [CONFIG_KEYS.puntoIda]: 'Bar Cruiff',
  [CONFIG_KEYS.puntoVuelta]: 'Parking Empresa',
});

export const FREE = 'Libre';
export const MAX_NAME_LENGTH = 40;
export const MAX_TEXT_LENGTH = 60;

/** Fixed seats that admin may release; the driver's seat never is. */
export const RELEASABLE_POSITIONS = Object.freeze(['copilot', 'back_left']);

const SEED_SEATS = [
  { position: 'driver', name: 'Patri', isFixed: 1 },
  { position: 'copilot', name: 'Javi', isFixed: 1 },
  { position: 'back_left', name: 'Paqui', isFixed: 1 },
  { position: 'back_center', name: FREE, isFixed: 0 },
  { position: 'back_right', name: FREE, isFixed: 0 },
];

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS seats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    position TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    is_fixed INTEGER NOT NULL DEFAULT 0 CHECK (is_fixed IN (0, 1))
  );
  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

/**
 * Opens (or adopts) the SQLite database and guarantees schema + seed.
 * `opts.db` reuses an already open connection, which keeps the call idempotent.
 */
export function openDb(path = ':memory:', opts = {}) {
  const db = opts.db ?? new Database(path);
  if (!opts.db) {
    db.pragma('journal_mode = WAL');
  }
  db.exec(SCHEMA);
  seed(db);
  return db;
}

/** Idempotent seed: never duplicates and never overwrites a name already stored. */
export function seed(db) {
  const insert = db.prepare(
    'INSERT OR IGNORE INTO seats (position, name, is_fixed) VALUES (?, ?, ?)',
  );
  const run = db.transaction((rows) => {
    for (const row of rows) insert.run(row.position, row.name, row.isFixed);
  });
  run(SEED_SEATS);
}

const SEAT_COLUMNS = 'id, position, name, is_fixed';

export function getSeats(db) {
  return db.prepare(`SELECT ${SEAT_COLUMNS} FROM seats ORDER BY id`).all();
}

export function getSeat(db, id) {
  return db.prepare(`SELECT ${SEAT_COLUMNS} FROM seats WHERE id = ?`).get(id) ?? null;
}

export function getSeatByPosition(db, position) {
  return db
    .prepare(`SELECT ${SEAT_COLUMNS} FROM seats WHERE position = ?`)
    .get(position) ?? null;
}

export function getConfig(db, key) {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
  if (row) return row.value;
  return Object.hasOwn(CONFIG_DEFAULTS, key) ? CONFIG_DEFAULTS[key] : null;
}

export function setConfig(db, key, value) {
  db.prepare(
    `INSERT INTO config (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, String(value));
}

export function normalizeName(rawName) {
  if (typeof rawName !== 'string') return '';
  return rawName.trim();
}

export function bookSeat(db, id, rawName) {
  const seat = getSeat(db, id);
  if (!seat) return { ok: false, code: 404, error: 'not_found' };
  if (seat.is_fixed === 1) return { ok: false, code: 409, error: 'fixed_seat', seat };

  const name = normalizeName(rawName);
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
    return { ok: false, code: 400, error: 'invalid_name', seat };
  }
  if (seat.name !== FREE) return { ok: false, code: 409, error: 'seat_taken', seat };

  db.prepare('UPDATE seats SET name = ? WHERE id = ? AND is_fixed = 0').run(name, id);
  return { ok: true, seat: getSeat(db, id) };
}

export function unbookSeat(db, id) {
  const seat = getSeat(db, id);
  if (!seat) return { ok: false, code: 404, error: 'not_found' };
  if (seat.is_fixed === 1) return { ok: false, code: 409, error: 'fixed_seat', seat };

  db.prepare('UPDATE seats SET name = ? WHERE id = ? AND is_fixed = 0').run(FREE, id);
  return { ok: true, seat: getSeat(db, id) };
}

/** Clears only dynamic seats; returns how many rows actually changed. */
export function resetDynamicSeats(db) {
  const info = db
    .prepare('UPDATE seats SET name = ? WHERE is_fixed = 0 AND name <> ?')
    .run(FREE, FREE);
  return info.changes;
}

/**
 * S13: admin frees a fixed seat so anyone can book it. The daily reset puts the
 * owner back, so "Javi no viene hoy" never costs him the seat for good.
 */
export function releaseFixedSeat(db, id) {
  const seat = getSeat(db, id);
  if (!seat) return { ok: false, code: 404, error: 'not_found' };
  if (seat.is_fixed !== 1) return { ok: false, code: 409, error: 'not_fixed_seat', seat };
  if (!RELEASABLE_POSITIONS.includes(seat.position)) {
    return { ok: false, code: 409, error: 'driver_seat', seat };
  }

  db.prepare('UPDATE seats SET name = ?, is_fixed = 0 WHERE id = ?').run(FREE, id);
  return { ok: true, seat: getSeat(db, id) };
}

/** S13: puts every fixed seat back to its seed owner before the daily cleanup. */
export function restoreFixedSeats(db) {
  const update = db.prepare('UPDATE seats SET name = ?, is_fixed = 1 WHERE position = ?');
  let changed = 0;
  const run = db.transaction((rows) => {
    for (const row of rows) {
      if (row.isFixed === 1) changed += update.run(row.name, row.position).changes;
    }
  });
  run(SEED_SEATS);
  return changed;
}

/** S14: admin-editable copy, trimmed and length-checked by the caller. */
export function setTexts(db, { tripTitle, puntoIda, puntoVuelta }) {
  const run = db.transaction(() => {
    setConfig(db, CONFIG_KEYS.tripTitle, tripTitle);
    setConfig(db, CONFIG_KEYS.puntoIda, puntoIda);
    setConfig(db, CONFIG_KEYS.puntoVuelta, puntoVuelta);
  });
  run();
}
