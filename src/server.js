import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { createApp } from './app.js';
import { makeClock } from './clock.js';
import { loadConfig } from './config.js';
import { openDb } from './db.js';

const config = loadConfig(process.env);

if (config.dbPath !== ':memory:') {
  mkdirSync(dirname(config.dbPath), { recursive: true });
}

const db = openDb(config.dbPath);
const clock = makeClock({ timeZone: config.timeZone });
const app = createApp({ db, adminPin: config.adminPin, clock });

const server = app.listen(config.port, () => {
  console.log(
    `[patricar] escuchando en http://localhost:${config.port} · TZ ${config.timeZone} · DB ${config.dbPath}`,
  );
});

function shutdown(signal) {
  console.log(`[patricar] ${signal} recibido: cerrando.`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
