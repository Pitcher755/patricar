# PatriCar — micro-app de asientos diarios al trabajo

Feature: reserva de las 2 plazas traseras dinámicas del coche de Patri (L-V),
horarios de ida/vuelta protegidos por PIN, reseteo automático diario.
Stack: Node.js + Express + HTMX + Tailwind (CDN) + SQLite (better-sqlite3). Entrega: un contenedor Docker.

## Specs

S1 — Vista del coche (`GET /`, 200). HTML renderizado en servidor con 5 asientos, identificados
por `position`: `driver`, `copilot`, `back_left`, `back_center`, `back_right`.
Fijos: `Patri` (piloto), `Javi` (copiloto), `Paqui` (trasero izquierdo). Dinámicos
(`back_center`, `back_right`): `Libre` cuando nadie los reservó.
La vista muestra los horarios actuales de ida y vuelta, un badge con la cantidad de asientos
ocupados y otro con la cantidad de libres, y un panel de admin plegado.

S2 — Identidad visual (del diseño aprobado, ver L4). Tema oscuro (`class="dark"`), fondo `#0b0f19`
con glows radiales teal/púrpura, tarjetas glass (blur + borde `rgba(255,255,255,.08)`), fuente
`Inter`, paleta `brand.teal #3b9e80`, `brand.tealLight #4ecdc4`, `brand.tealDark #286c57`,
`brand.purple #7c3aed`, `brand.purpleDark #4c1d95`, iconos Lucide, Tailwind por CDN.
Layout: header con marca `PatriCar`, tarjeta de horarios (ida/vuelta + botón "Modificar"),
tarjeta del coche en vista cenital (parabrisas al frente, fila delantera de 2, fila trasera de 3,
maletero al fondo) y footer con las reglas del viaje.
Todo el estado de los asientos lo manda el servidor: nada de estado de reservas en JS de cliente.

S3 — Modelo de datos SQLite.
`seats(id INTEGER PRIMARY KEY, position TEXT UNIQUE NOT NULL, name TEXT NOT NULL, is_fixed BOOLEAN NOT NULL)`.
`config(key TEXT PRIMARY KEY, value TEXT)`.
Seed: `driver`/`Patri`/1, `copilot`/`Javi`/1, `back_left`/`Paqui`/1, `back_center`/`Libre`/0,
`back_right`/`Libre`/0. Idempotente: abrir la base dos veces no duplica ni pisa nombres ya cambiados.
Claves de `config`: `time_ida`, `time_vuelta`, `last_reset_date`.

S4 — Reservar. `POST /api/book/:id` con payload `name` ocupa un asiento no fijo y retorna el
fragmento HTML del asiento actualizado (para HTMX: `hx-swap="outerHTML"` del contenedor del asiento).
Errores: `404` si el `id` no existe; `409` si el asiento es fijo; `409` si el asiento ya está
ocupado (`name <> 'Libre'`, el PRD dice reclamar asientos *libres*, no pisar al ocupante);
`400` si `name` está vacío o excede 40 caracteres después del trim. El nombre se guarda recortado.
Un `400`/`404`/`409` no modifica la base.

S5 — Liberar. `POST /api/unbook/:id` deja `name = 'Libre'` y retorna el fragmento HTML del asiento.
Sin autenticación (decisión del usuario, L2). Errores: `404` si el `id` no existe; `409` si el
asiento es fijo. Liberar un asiento ya libre es idempotente (200).

S6 — Horarios de admin. `POST /admin/time` con `pin`, `time_ida`, `time_vuelta`.
PIN correcto → persiste ambos horarios y retorna la interfaz de horarios actualizada (200).
PIN incorrecto → `401`, sin modificar `config`. Hora inválida (no `HH:MM` 24 h) → `400`,
sin modificar `config`. Defaults cuando no están configurados: `08:00` (ida) y `17:00` (vuelta).

S7 — Reseteo manual. `POST /admin/reset` con `pin`. PIN correcto → todos los asientos con
`is_fixed = 0` vuelven a `name = 'Libre'` y retorna la interfaz del coche actualizada (200).
PIN incorrecto → `401`, sin tocar la base. Los asientos fijos nunca se resetean.

S8 — Reseteo automático de lunes a viernes. En cada petición HTTP, si la fecha local
(`TIMEZONE`, default `Europe/Madrid`) difiere de `last_reset_date` **y** el día es laborable
(lunes-viernes), se ejecuta `UPDATE seats SET name = 'Libre' WHERE is_fixed = 0` y se guarda
`last_reset_date` como `YYYY-MM-DD`. Sábado y domingo no resetean ni tocan `last_reset_date`.
Una misma fecha no puede resetear dos veces.

S9 — Variables de entorno. `PORT` (default `3000`). `ADMIN_PIN`: si falta, arranca con `PatriCar`
y emite un warning en el log de arranque (L2). `DB_PATH` (default `./data/patricar.sqlite`).
`TIMEZONE` (default `Europe/Madrid`).

S10 — Docker. Un `Dockerfile` que escucha en `$PORT`, persiste la base en `/app/data` y declara
ese directorio como `VOLUME`. `docker-compose.yml` monta el volumen y define `ADMIN_PIN`.
`GET /health` responde `200` con `{"status":"ok"}` cuando la base es consultable.

S11 — CI. GitHub Actions corre la suite en cada `push` y `pull_request` sobre Node 24
(`npm ci` + `npm test`). Debe quedar en verde.

S12 — Endurecimiento y no filtración. Todo dato de usuario (nombres, horarios) se escapa al
renderizar: un nombre `<script>alert(1)</script>` aparece como texto y la respuesta **no** contiene
`<script>alert(1)</script>`. Nada de SQL concatenado: consultas parametrizadas. Body limitado a
10 kb (`413` por encima). El PIN se compara en tiempo constante. El HTML servido **nunca** incluye
el PIN real: el panel de admin solo lo pide, y el prototipo que lo mostraba ("PIN demo: 1234") es
un defecto que esta implementación no hereda.

## Tasks

| ID | Specs | Ruta | Commit |
|----|-------|------|--------|
| T1 | S1-S12 | spec + scaffolding (`package.json`, `node:test`, gitignore) | `1ac4ca6` |
| T2 | S3-S5, S7 | capa DB: esquema, seed idempotente, lecturas/escrituras | `95c99d5` |
| T3 | S8 | dominio de fecha/reset (timezone, día laborable, middleware) | `08b6e5d` |
| T4 | S1, S2, S12 | render de la vista y del asiento (diseño aprobado) + escape | `eb38c5c` |
| T5 | S4, S5 | book/unbook + validación + fragmento HTMX | `eb38c5c` |
| T6 | S6, S7 | admin time/reset con PIN | `eb38c5c` |
| T7 | S9, S10, S12 | env/config + body limit + `/health` | `eb38c5c` |
| T8 | S10 | Dockerfile, compose, .dockerignore | `87ca425` |
| T9 | S11 | CI + README | `726c159` |
| T10 | — | repo público en GitHub + push | ver Log L6 |
| T11 | — | verificación independiente + review nativa | ver Log L6 |

## Log

L1 (pedido original, verbatim):

> Hola, te voy a pasar un PRD y SRS, quiero que apliques SDD y TDD estricto. Esto debe ser una app web muy ligera y que se desarrolle en un solo día, crea un repo en gh abierto para tener actions ilimitadas, esto es una app casi de broma pero debe ser funcional, esto no quiere decir que esté mal hecha, te paso los datos y tu aplica TDD, ODD y RDD.
>
> # PatriCar - PRD & SRS
>
> ## 1. Product Requirements Document (PRD)
>
> **Nombre del Producto:** PatriCar
> **Propósito:** Micro-aplicación web funcional y de tono informal para coordinar los viajes diarios al trabajo en el coche de Patri (Lunes a Viernes). Elimina el ruido de WhatsApp permitiendo reservar visualmente las plazas traseras libres.
>
> ### 1.1. Perfiles de Usuario
> *   **Admin (Patri):** Controla los horarios y puede forzar el reseteo de plazas. Autenticación basada en un PIN simple preconfigurado.
> *   **Pasajero:** Visualiza el estado del coche y puede reclamar asientos libres introduciendo su nombre. No requiere login.
>
> ### 1.2. Casos de Uso Core
> *   **Visualización del Coche:** Interfaz gráfica simple que muestra 5 asientos.
> *   **Asientos Fijos:** 3 asientos están siempre ocupados por defecto (Piloto: Patri, Copiloto: Javi, Trasero Izquierdo: Paqui).
> *   **Asientos Dinámicos:** 2 asientos traseros (centro y derecha) aparecen como "Libres". Cualquier usuario puede tocarlos, escribir su nombre y reservarlos de forma rápida.
> *   **Gestión de Horarios:** Un formulario protegido por PIN donde Patri establece la hora de ida y de vuelta.
> *   **Reseteo Automático:** Los asientos dinámicos se vacían automáticamente cada noche para estar listos al día siguiente (operativo de Lunes a Viernes).
>
> ## 2. Software Requirements Specification (SRS)
>
> ### 2.1. Arquitectura y Stack Tecnológico
> *   **Backend:** Node.js con Express (rutas ligeras).
> *   **Frontend:** HTML renderizado en servidor + HTMX (para interacciones asíncronas sin recargar página) + Tailwind CSS (vía CDN para estilos ágiles).
> *   **Persistencia:** SQLite (`better-sqlite3`), operando sobre un único archivo local.
> *   **Despliegue:** Contenedor Docker único, con volumen montado para persistir la base de datos, listo para ser expuesto mediante Cloudflare Tunnels.
>
> ### 2.2. Modelo de Datos (SQLite)
> *   **Tabla `seats`:**
>     *   `id` (Integer, Primary Key)
>     *   `position` (Text): Identificador visual ('driver', 'copilot', 'back_left', 'back_center', 'back_right').
>     *   `name` (Text): Nombre del ocupante actual (o 'Libre').
>     *   `is_fixed` (Boolean): `true` para los 3 asientos fijos (Patri, Javi, Paqui).
> *   **Tabla `config`:**
>     *   `key` (Text, Primary Key): Almacenará 'time_ida', 'time_vuelta' y 'last_reset_date'.
>     *   `value` (Text).
>
> ### 2.3. Endpoints Principales
> *   `GET /`: Retorna la vista principal (estado del coche, horarios y formularios).
> *   `POST /api/book/:id`: Ocupa un asiento no fijo (Payload: `name`). Retorna el fragmento HTML del asiento actualizado vía HTMX.
> *   `POST /api/unbook/:id`: Libera un asiento reservado previamente.
> *   `POST /admin/time`: Actualiza los horarios. (Payload: `pin`, `time_ida`, `time_vuelta`). Retorna la interfaz actualizada si el PIN es correcto.
> *   `POST /admin/reset`: Acción manual para limpiar plazas dinámicas. (Payload: `pin`).
>
> ### 2.4. Automatización de Reseteo (Lunes a Viernes)
> *   En lugar de un cron pesado, se implementará una comprobación ligera en el middleware base: en cada petición, si la fecha actual es diferente a `last_reset_date` y es un día laborable (Lunes-Viernes), se ejecuta `UPDATE seats SET name = 'Libre' WHERE is_fixed = 0` y se actualiza la fecha de último reseteo. Esto garantiza persistencia sin procesos en segundo plano consumiendo recursos inútiles.
>
> ### 2.5. Variables de Entorno (Docker)
> *   `ADMIN_PIN`: PIN para autenticar a Patri (ej. "PatriCar").
> *   `PORT`: Puerto de escucha del servidor (por defecto 3000).

L2 (decisiones del usuario, respuestas al cuestionario previo):
- Falta `ADMIN_PIN` → arranca con el default `PatriCar` y emite un warning en el log (no fail-fast).
- `POST /api/unbook/:id` queda sin autenticación, tal cual el SRS.

L3 (decisiones de diseño del orquestador, trazables y testeables):
- `last_reset_date` se siembra vacío: el primer request en día laborable resetea (equivale al
  "cada noche" del SRS sin cron).
- `TIMEZONE` default `Europe/Madrid` para que "hoy" sea el día de Patri y no el del host.
- Horarios por defecto `08:00` / `17:00` para que la vista siempre muestre algo.
- `name` máx. 40 caracteres en servidor; el diseño limita el input a 12 (`maxlength`), que es un
  subconjunto válido del contrato HTTP.
- Reservar un asiento ya ocupado devuelve `409` en vez de pisar al ocupante; liberar uno ya libre
  es idempotente.
- El panel de conductora del prototipo no tiene botón de reseteo manual; se agrega uno
  ("Resetear plazas") en el mismo panel porque el SRS lo exige (`POST /admin/reset`).

L4 (diseño aportado por el usuario, verbatim en lo que importa): prototipo HTML estático de una
pantalla, tema oscuro glassmorphism, entregado en el chat (no como archivo). Tokens y estructura
extraídos a S2. Copy del prototipo que se conserva: badge `Viaje hoy: Centro de Trabajo · Sede Central`,
título `PatriCar`, subtítulo `Reserva tu plaza sin spam de WhatsApp 🚗💨`, `Horarios previstos`,
`Ida (Mañana)` / `Punto: Rotonda Norte`, `Vuelta (Tarde)` / `Punto: Parking Empresa`,
`Estado del Vehículo`, `Pulsa en una plaza libre para confirmar tu nombre`, `Conductora`,
`Fijo / Dueña`, `Copiloto` / `Asignado`, `Asignada`, `¡Libre!` / `Reservar`, `Reservado`,
`Fila Delantera`, `Fila Trasera`, `Frente / Parabrisas`, `Maletero`, panel `Panel de Conductora (Patri)`,
botón `Modificar`, `Actualizar Horarios`, `PIN incorrecto`, toast `¡Plaza reservada con éxito!`,
footer `Puntualidad británica requerida (máx. 5 min de espera)` y `Bizum voluntario ☕`.
Cambios deliberados respecto del prototipo: (a) se elimina el texto `PIN demo: 1234` y la
verificación de PIN en cliente (S12); (b) el estado de las reservas deja de vivir en JS y pasa a
HTMX contra el servidor (S1); (c) se agrega `Resetear plazas` (L3).
