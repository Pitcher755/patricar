export const DEFAULT_ADMIN_PIN = 'PatriCar';
export const DEFAULT_PORT = 3000;
export const DEFAULT_DB_PATH = './data/patricar.sqlite';
export const DEFAULT_TIMEZONE = 'Europe/Madrid';

const PORT_MIN = 1;
const PORT_MAX = 65535;

function parsePort(raw, logger) {
  if (raw === undefined || raw === '') return DEFAULT_PORT;

  const port = Number(raw);
  if (!Number.isInteger(port) || port < PORT_MIN || port > PORT_MAX) {
    logger?.warn?.(`[patricar] PORT inválido (${raw}): usando ${DEFAULT_PORT}.`);
    return DEFAULT_PORT;
  }
  return port;
}

/**
 * S9: environment contract. A missing ADMIN_PIN never blocks the boot, but it
 * must be loud: the app is meant to be exposed through a tunnel.
 */
export function loadConfig(env = {}, logger = console) {
  const pin = typeof env.ADMIN_PIN === 'string' ? env.ADMIN_PIN.trim() : '';

  if (!pin) {
    logger?.warn?.(
      `[patricar] ADMIN_PIN no está definido: usando el PIN por defecto "${DEFAULT_ADMIN_PIN}". ` +
        'Cambialo antes de exponer la app.',
    );
  }

  return {
    adminPin: pin || DEFAULT_ADMIN_PIN,
    port: parsePort(env.PORT, logger),
    dbPath: env.DB_PATH?.trim() || DEFAULT_DB_PATH,
    timeZone: env.TIMEZONE?.trim() || DEFAULT_TIMEZONE,
    usingDefaultPin: pin.length === 0,
  };
}
