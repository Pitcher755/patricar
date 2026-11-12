# PatriCar

Tiny web app to coordinate the daily ride in Patri's car (Monday to Friday).
Five seats: three always taken (driver, copilot, back-left), two back seats that
anyone can claim with their name — no WhatsApp noise, no login.

Server-rendered HTML + HTMX + Tailwind (CDN) + SQLite. One Docker container, one
SQLite file on a volume.

## Quick start (local)

```bash
npm ci
ADMIN_PIN=your-pin npm start
# http://localhost:3000
```

Requires Node 22+ (tests and CI run on Node 24).

## Quick start (Docker)

```bash
ADMIN_PIN=your-pin docker compose up --build
```

`docker-compose.yml` refuses to start without `ADMIN_PIN` and mounts the
`patricar-data` volume at `/app/data`, so the SQLite file survives rebuilds.
To expose it through Cloudflare Tunnel, point the tunnel at
`http://localhost:3000` and keep the container on the same Docker network.

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `ADMIN_PIN` | `PatriCar` (with a startup warning) | PIN that protects the schedule and reset endpoints |
| `PORT` | `3000` | HTTP port |
| `DB_PATH` | `./data/patricar.sqlite` | SQLite file; the parent directory is created on boot |
| `TIMEZONE` | `Europe/Madrid` | Zone used to decide what "today" is for the daily reset |

The fallback PIN exists so a bare `docker run` works, but it is logged as a
warning on purpose: always set `ADMIN_PIN` before exposing the app.

## HTTP contract

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| `GET` | `/` | — | Full page: seat map, schedule, admin panel |
| `POST` | `/api/book/:id` | `name` | `200` + seat fragment; `400` empty/over-40 name; `404` unknown seat; `409` fixed or already taken |
| `POST` | `/api/unbook/:id` | — | `200` + seat fragment (idempotent); `404` unknown; `409` fixed |
| `POST` | `/admin/time` | `pin`, `time_ida`, `time_vuelta` | `200` + updated UI; `400` bad time; `401` bad PIN |
| `POST` | `/admin/reset` | `pin` | `200` + updated car; `401` bad PIN |
| `GET` | `/health` | — | `200` `{"status":"ok"}` when SQLite answers |

Bodies are accepted as `application/x-www-form-urlencoded` (forms) or
`application/json`, capped at 10 kb (`413` beyond that).

## How the daily reset works

There is no cron and no background process. On every request, a tiny middleware
compares today's civil date in `TIMEZONE` with `last_reset_date`; if the date
changed and it is Monday–Friday, it sets the two dynamic seats back to `Libre`
and stores the new date. Saturday and Sunday neither reset nor advance the date,
so Friday's bookings stay visible through the weekend and are cleared on Monday.

## Tests

```bash
npm test          # node:test, no extra dependencies
```

The suite covers the SQLite layer, the workday/timezone rules, the rendered
view, every HTTP status code, HTMX fragment shape, HTML escaping of names, the
10 kb body limit, and the environment contract.

## Layout

```
src/db.js        schema, idempotent seed, seat and config operations
src/clock.js     civil date in a time zone, workday predicate
src/reset.js     one-reset-per-workday logic + Express middleware
src/security.js  constant-time PIN comparison, HH:MM validation
src/views.js     server-rendered page, seat fragments, HTMX attributes
src/app.js       Express app factory (dependencies injected)
src/config.js    environment parsing
src/server.js    bootstrap and graceful shutdown
tests/           node:test suites, one file per concern
odd/tasks/       spec-driven feature document (specs, tasks, decisions)
```

## Design notes

- All booking state lives in SQLite. The browser never decides who sits where;
  it only swaps the HTML fragment the server returns.
- Names are escaped on render, so `<script>` in a name is shown as text.
- Booking a seat that is already taken returns `409` instead of overwriting the
  current occupant.
- The PIN is compared in constant time and never rendered into the page.
