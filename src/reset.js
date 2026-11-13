import { isWorkday } from './clock.js';
import { CONFIG_KEYS, getConfig, resetDynamicSeats, restoreFixedSeats, setConfig } from './db.js';

/**
 * S8: at most one reset per workday, checked on every request.
 * Weekends neither reset nor advance `last_reset_date`.
 */
export function maybeDailyReset(db, clock) {
  const today = clock.today();

  if (!isWorkday(today)) {
    return { status: 'skipped', reason: 'weekend', today };
  }

  if (getConfig(db, CONFIG_KEYS.lastResetDate) === today) {
    return { status: 'skipped', reason: 'already_reset', today };
  }

  const restored = restoreFixedSeats(db);
  const cleared = resetDynamicSeats(db);
  setConfig(db, CONFIG_KEYS.lastResetDate, today);
  return { status: 'reset', cleared, restored, today };
}

/** Express middleware wrapper; a reset must never break the request itself. */
export function dailyResetMiddleware(db, clock, onError = () => {}) {
  return function dailyReset(req, res, next) {
    try {
      maybeDailyReset(db, clock);
    } catch (error) {
      onError(error);
    }
    next();
  };
}
