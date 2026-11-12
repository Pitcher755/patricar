export const DEFAULT_TIMEZONE = 'Europe/Madrid';

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const formatters = new Map();

function formatterFor(timeZone) {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    // Throws RangeError for an unknown time zone: better to fail than to guess.
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Civil date (`YYYY-MM-DD`) of `now` in `timeZone`. */
export function localDate(now, timeZone = DEFAULT_TIMEZONE) {
  const parts = formatterFor(timeZone).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** True for Monday..Friday of a civil date string. */
export function isWorkday(date) {
  return dayOfWeek(date) >= 1 && dayOfWeek(date) <= 5;
}

/** 0 = Sunday .. 6 = Saturday, computed in UTC so the host zone cannot shift it. */
export function dayOfWeek(date) {
  const match = DATE_PATTERN.exec(String(date));
  if (!match) throw new TypeError(`invalid civil date: ${String(date)}`);

  const [, year, month, day] = match.map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new TypeError(`invalid civil date: ${String(date)}`);
  }
  return parsed.getUTCDay();
}

/** Injectable clock: tests control time, production uses the real one. */
export function makeClock({ now = () => new Date(), timeZone = DEFAULT_TIMEZONE } = {}) {
  return {
    now,
    timeZone,
    today: () => localDate(now(), timeZone),
  };
}
