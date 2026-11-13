import { FREE } from './db.js';

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

const MAX_INPUT_LENGTH = 12; // límite del diseño; el servidor acepta hasta 40

const FIXED_SEAT_STYLE = {
  driver: {
    badge: 'Conductora',
    icon: 'steering-wheel',
    hint: 'Fijo / Dueña',
    card: 'from-emerald-950/70 via-slate-900/90 to-slate-900 border-emerald-500/40 shadow-glow-teal',
    iconBox: 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300',
    hintColor: 'text-emerald-300',
    nameColor: 'text-white',
    hintIcon: 'check-circle-2',
  },
  copilot: {
    badge: 'Copiloto',
    icon: 'user-check',
    hint: 'Asignado',
    card: 'from-slate-800/40 to-slate-800/30 border-slate-700/60',
    iconBox: 'bg-slate-700/40 border-slate-600/40 text-slate-300',
    hintColor: 'text-slate-400',
    nameColor: 'text-slate-200',
    hintIcon: 'lock',
  },
  back_left: {
    badge: null,
    icon: 'user-check',
    hint: 'Asignada',
    card: 'from-slate-800/40 to-slate-800/30 border-slate-700/60',
    iconBox: 'bg-purple-500/20 border-purple-500/30 text-purple-300',
    hintColor: 'text-purple-300/80',
    nameColor: 'text-slate-200',
    hintIcon: null,
  },
};

function icon(name, className) {
  return `<i data-lucide="${escapeHtml(name)}" class="${className}"></i>`;
}

function fixedSeat(seat) {
  const style = FIXED_SEAT_STYLE[seat.position];
  const badge = style.badge
    ? `<div class="absolute -top-2 -right-1.5 px-2 py-0.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 font-extrabold text-[9px] uppercase tracking-wider shadow">${escapeHtml(style.badge)}</div>`
    : '';
  const hintIcon = style.hintIcon ? icon(style.hintIcon, 'w-3 h-3') : '';

  return `
    <div id="seat-${seat.position}" data-seat="${seat.position}" data-state="fixed" class="relative rounded-2xl p-3.5 bg-gradient-to-br ${style.card} border flex flex-col items-center justify-center text-center">
      ${badge}
      <div class="w-9 h-9 md:w-10 md:h-10 rounded-2xl border ${style.iconBox} flex items-center justify-center mb-1.5">
        ${icon(style.icon, 'w-4 h-4 md:w-5 md:h-5')}
      </div>
      <div class="font-semibold text-xs md:text-sm ${style.nameColor} truncate max-w-full">${escapeHtml(seat.name)}</div>
      <div class="text-[10px] font-medium flex items-center gap-1 mt-0.5 ${style.hintColor}">
        ${hintIcon} ${escapeHtml(style.hint)}
      </div>
    </div>`;
}

function errorBanner(message) {
  if (!message) return '';
  return `
      <div role="alert" data-seat-error class="mt-1.5 rounded-lg bg-rose-950/70 border border-rose-500/40 px-1.5 py-1 text-[9px] leading-tight text-rose-200 text-center">
        ${escapeHtml(message)}
      </div>`;
}

function freeDynamicSeat(seat, error) {
  return `
    <div id="seat-${seat.position}" data-seat="${seat.position}" data-state="free" class="relative">
      <button type="button" data-seat-open="seat-${seat.position}" aria-label="Reservar asiento libre"
        class="w-full h-full min-h-[96px] rounded-2xl p-2.5 bg-gradient-to-b from-emerald-950/40 to-slate-900/70 border-2 border-dashed border-[#3b9e80] hover:border-emerald-300 shadow-glow-teal animate-pulse-subtle flex flex-col items-center justify-center text-center transition-all duration-200 hover:scale-[1.03] active:scale-95 group cursor-pointer">
        <div class="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-300 mb-1.5 group-hover:bg-emerald-500 group-hover:text-slate-950 transition-colors">
          ${icon('user-plus', 'w-4 h-4')}
        </div>
        <span class="text-xs font-bold text-emerald-300 tracking-wide">¡Libre!</span>
        <span class="text-[9px] text-slate-400 mt-0.5 group-hover:text-slate-200">Reservar</span>
      </button>

      <form data-seat-form="seat-${seat.position}" hx-post="/api/book/${seat.id}" hx-target="#seat-${seat.position}" hx-swap="outerHTML"
        class="hidden w-full min-h-[96px] rounded-2xl p-2 bg-slate-900 border-2 border-emerald-400 shadow-glow-teal flex-col justify-between">
        <label class="text-[9px] font-bold uppercase text-emerald-400 text-center" for="name-${seat.position}">Tu Nombre</label>
        <input id="name-${seat.position}" name="name" type="text" required maxlength="${MAX_INPUT_LENGTH}" placeholder="Ej. Ana" autocomplete="off"
          class="w-full bg-slate-800 text-white text-xs px-2 py-1 rounded-lg border border-slate-700 focus:outline-none focus:border-emerald-400 text-center font-medium placeholder-slate-500">
        <div class="flex items-center gap-1 mt-1">
          <button type="button" data-seat-cancel="seat-${seat.position}" class="flex-1 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 text-[10px] font-semibold transition-colors" title="Cancelar">✕</button>
          <button type="submit" class="flex-1 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[10px] font-bold flex items-center justify-center shadow transition-colors" title="Confirmar plaza">✓</button>
        </div>
      </form>${errorBanner(error)}
    </div>`;
}

function bookedDynamicSeat(seat) {
  return `
    <div id="seat-${seat.position}" data-seat="${seat.position}" data-state="booked" class="relative">
      <div class="w-full min-h-[96px] rounded-2xl p-2.5 bg-gradient-to-br from-emerald-950/60 to-slate-900 border border-emerald-400/60 flex flex-col items-center justify-center text-center relative">
        <button type="button" hx-post="/api/unbook/${seat.id}" hx-target="#seat-${seat.position}" hx-swap="outerHTML"
          aria-label="Liberar plaza de ${escapeHtml(seat.name)}" title="Liberar plaza"
          class="absolute top-1 right-1 w-5 h-5 rounded-full bg-slate-800/80 hover:bg-rose-500/80 text-slate-400 hover:text-white flex items-center justify-center text-[10px] transition-colors">✕</button>
        <div class="w-7 h-7 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-300 mb-1">
          ${icon('user', 'w-4 h-4')}
        </div>
        <div class="font-bold text-xs text-white truncate max-w-[70px]">${escapeHtml(seat.name)}</div>
        <div class="text-[8px] text-emerald-300 font-medium">Reservado</div>
      </div>
    </div>`;
}

/** One seat container; also the HTMX response body for book/unbook. */
export function renderSeat(seat, { error = null } = {}) {
  if (seat.is_fixed === 1) return fixedSeat(seat);
  if (seat.name === FREE) return freeDynamicSeat(seat, error);
  return bookedDynamicSeat(seat);
}

export function renderSeatsGrid(seats) {
  const front = seats.filter((seat) => seat.position === 'driver' || seat.position === 'copilot');
  const back = seats.filter((seat) =>
    ['back_left', 'back_center', 'back_right'].includes(seat.position),
  );
  const free = seats.filter((seat) => seat.is_fixed === 0 && seat.name === FREE).length;
  const occupied = seats.length - free;

  return `
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
      <div>
        <h2 class="text-base font-bold text-white flex items-center gap-2">
          ${icon('users', 'w-4 h-4 text-emerald-400')} Estado del Vehículo
        </h2>
        <p class="text-xs text-slate-400">Pulsa en una plaza libre para confirmar tu nombre</p>
      </div>
      <div class="flex items-center gap-2 self-start sm:self-auto">
        <span id="badge-occupied" data-count="${occupied}" class="px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-[11px] font-medium text-slate-300 flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full bg-purple-400"></span> ${occupied} Ocupadas
        </span>
        <span id="badge-free" data-count="${free}" class="px-2.5 py-1 rounded-full ${free === 0 ? 'bg-rose-950/70 border-rose-500/40 text-rose-300' : 'bg-emerald-950/70 border-emerald-500/40 text-emerald-300'} border text-[11px] font-semibold flex items-center gap-1.5 shadow-sm">
          <span class="w-2 h-2 rounded-full ${free === 0 ? 'bg-rose-400' : 'bg-emerald-400 animate-pulse'}"></span>
          ${free === 0 ? '¡Coche lleno!' : `${free} ${free === 1 ? 'Libre' : 'Libres'}`}
        </span>
      </div>
    </div>

    <div class="relative w-full max-w-md mx-auto py-6 px-4" id="seat-map">
      <div class="relative rounded-[50px] border-2 border-slate-700/80 bg-gradient-to-b from-slate-900 via-slate-900/95 to-slate-950 p-6 md:p-8 shadow-2xl overflow-hidden backdrop-blur-xl">
        <div class="absolute -top-1 left-8 w-12 h-3 bg-cyan-400/40 rounded-full blur-sm"></div>
        <div class="absolute -top-1 right-8 w-12 h-3 bg-cyan-400/40 rounded-full blur-sm"></div>
        <div class="absolute -bottom-1 left-8 w-12 h-3 bg-rose-500/40 rounded-full blur-sm"></div>
        <div class="absolute -bottom-1 right-8 w-12 h-3 bg-rose-500/40 rounded-full blur-sm"></div>

        <div class="w-3/4 mx-auto h-7 rounded-t-2xl border-t border-x border-cyan-400/20 bg-gradient-to-b from-cyan-500/10 to-transparent mb-5 flex items-center justify-center">
          <span class="text-[9px] uppercase tracking-widest text-slate-500 font-semibold flex items-center gap-1">
            ${icon('compass', 'w-2.5 h-2.5 text-cyan-400/60')} Frente / Parabrisas
          </span>
        </div>

        <div class="space-y-6">
          <div>
            <div class="flex items-center justify-between text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2 px-1">
              <span>Fila Delantera</span>
              <span class="text-emerald-400/80 font-mono">2 / 2</span>
            </div>
            <div class="grid grid-cols-2 gap-3.5">
              ${front.map((seat) => renderSeat(seat)).join('\n')}
            </div>
          </div>

          <div>
            <div class="flex items-center justify-between text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2 px-1">
              <span>Fila Trasera</span>
              <span class="text-slate-400 font-mono">1 Ocupado · ${free} ${free === 1 ? 'Libre' : 'Libres'}</span>
            </div>
            <div class="grid grid-cols-3 gap-2.5">
              ${back.map((seat) => renderSeat(seat)).join('\n')}
            </div>
          </div>
        </div>

        <div class="w-3/5 mx-auto h-4 rounded-b-xl border-b border-x border-slate-700/60 bg-slate-800/20 mt-6 flex items-center justify-center">
          <span class="text-[8px] uppercase tracking-wider text-slate-600 font-medium">Maletero</span>
        </div>
      </div>
    </div>`;
}

function noticeBanner(notice) {
  if (!notice) return '';
  return `
        <div role="status" class="mt-4 rounded-2xl bg-emerald-900/60 border border-emerald-500/40 px-3 py-2 text-xs text-emerald-200 flex items-center gap-2">
          ${icon('check-circle', 'w-4 h-4 text-emerald-400')} ${escapeHtml(notice)}
        </div>`;
}

export function renderScheduleCard({
  timeIda,
  timeVuelta,
  tripTitle = '',
  puntoIda = 'Bar Cruiff',
  puntoVuelta = 'Parking Empresa',
  releasable = [],
  adminOpen = false,
  error = null,
  notice = null,
}) {
  return `
    <section id="schedule-card" class="glass-card rounded-3xl p-5 md:p-6 shadow-glass relative overflow-hidden transition-all duration-300">
      <div class="flex items-center justify-between pb-3 mb-4 border-b border-white/5">
        <div class="flex items-center gap-2">
          <div class="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">${icon('clock', 'w-4 h-4')}</div>
          <span class="text-xs uppercase font-bold tracking-wider text-slate-400">Horarios previstos</span>
        </div>
        <button type="button" data-admin-toggle onclick="toggleDriverConfig()" class="group flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 text-xs text-slate-300 hover:text-emerald-300 transition-all duration-200 active:scale-95" title="Gestión conductora (Patri)">
          ${icon('lock', 'w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-400 transition-colors')}
          <span class="font-medium" data-admin-toggle-text>${adminOpen ? 'Cerrar' : 'Modificar'}</span>
        </button>
      </div>

      <div class="grid grid-cols-2 gap-3.5">
        <div class="glass-inner rounded-2xl p-4 flex flex-col items-center justify-center text-center relative overflow-hidden group hover:border-emerald-500/30 transition-colors">
          <div class="absolute -top-6 -right-6 w-16 h-16 bg-emerald-500/10 rounded-full blur-xl group-hover:bg-emerald-500/20 transition-all"></div>
          <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1 mb-1">
            ${icon('arrow-up-right', 'w-3 h-3 text-emerald-400')} Ida (Mañana)
          </span>
          <div id="ida-display" class="text-2xl md:text-3xl font-bold tracking-tight text-white font-mono">${escapeHtml(timeIda)}</div>
          <span class="text-[10px] text-emerald-400/90 mt-1 flex items-center gap-1">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Punto: ${escapeHtml(puntoIda)}
          </span>
        </div>

        <div class="glass-inner rounded-2xl p-4 flex flex-col items-center justify-center text-center relative overflow-hidden group hover:border-purple-500/30 transition-colors">
          <div class="absolute -top-6 -right-6 w-16 h-16 bg-purple-500/10 rounded-full blur-xl group-hover:bg-purple-500/20 transition-all"></div>
          <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1 mb-1">
            ${icon('arrow-down-left', 'w-3 h-3 text-purple-400')} Vuelta (Tarde)
          </span>
          <div id="vuelta-display" class="text-2xl md:text-3xl font-bold tracking-tight text-white font-mono">${escapeHtml(timeVuelta)}</div>
          <span class="text-[10px] text-purple-300/90 mt-1 flex items-center gap-1">
            <span class="w-1.5 h-1.5 rounded-full bg-purple-400"></span> Punto: ${escapeHtml(puntoVuelta)}
          </span>
        </div>
      </div>
      ${noticeBanner(notice)}

      <div id="driver-form" class="${adminOpen ? '' : 'hidden'} mt-4 pt-4 border-t border-white/10">
        <div class="space-y-3.5 bg-slate-900/90 p-4 rounded-2xl border border-emerald-500/30 shadow-inner">
          <div class="flex items-center justify-between">
            <h4 class="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
              ${icon('shield-check', 'w-3.5 h-3.5')} Panel de Conductora (Patri)
            </h4>
          </div>

          <form hx-post="/admin/time" hx-target="#app-main" hx-swap="outerHTML" class="space-y-3">
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label class="block text-[11px] text-slate-400 mb-1 font-medium" for="pin-input">PIN de Seguridad</label>
                <input id="pin-input" name="pin" type="password" required autocomplete="current-password" placeholder="****"
                  class="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-center font-mono text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500">
              </div>
              <div>
                <label class="block text-[11px] text-slate-400 mb-1 font-medium" for="ida-input">Hora de Ida</label>
                <input id="ida-input" name="time_ida" type="time" value="${escapeHtml(timeIda)}" required
                  class="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500">
              </div>
              <div>
                <label class="block text-[11px] text-slate-400 mb-1 font-medium" for="vuelta-input">Hora de Vuelta</label>
                <input id="vuelta-input" name="time_vuelta" type="time" value="${escapeHtml(timeVuelta)}" required
                  class="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500">
              </div>
            </div>
            ${errorBanner(error)}
            <div class="flex items-center justify-end gap-2 pt-1">
              <button type="button" data-admin-toggle onclick="toggleDriverConfig(false)" class="px-3 py-1.5 text-xs text-slate-400 hover:text-white rounded-lg transition-colors">Cancelar</button>
              <button type="submit" class="px-4 py-1.5 bg-gradient-to-r from-[#3b9e80] to-emerald-600 hover:brightness-110 text-white font-medium text-xs rounded-xl shadow-glow-teal transition-all active:scale-95 flex items-center gap-1.5">
                ${icon('save', 'w-3.5 h-3.5')} Actualizar Horarios
              </button>
            </div>
          </form>

          <form hx-post="/admin/text" hx-target="#app-main" hx-swap="outerHTML" class="space-y-3 pt-3 border-t border-white/5">
            <p class="text-[11px] font-medium text-slate-300">Textos del viaje</p>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label class="block text-[11px] text-slate-400 mb-1 font-medium" for="trip-title-input">Viaje hoy</label>
                <input id="trip-title-input" name="trip_title" type="text" required maxlength="60" value="${escapeHtml(tripTitle)}"
                  class="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500">
              </div>
              <div>
                <label class="block text-[11px] text-slate-400 mb-1 font-medium" for="punto-ida-input">Punto de ida</label>
                <input id="punto-ida-input" name="punto_ida" type="text" required maxlength="60" value="${escapeHtml(puntoIda)}"
                  class="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500">
              </div>
              <div>
                <label class="block text-[11px] text-slate-400 mb-1 font-medium" for="punto-vuelta-input">Punto de vuelta</label>
                <input id="punto-vuelta-input" name="punto_vuelta" type="text" required maxlength="60" value="${escapeHtml(puntoVuelta)}"
                  class="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500">
              </div>
            </div>
            <div class="flex items-center justify-end gap-2">
              <input name="pin" type="password" required autocomplete="current-password" placeholder="PIN" aria-label="PIN para editar los textos"
                class="w-24 bg-slate-800/90 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-center font-mono text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500">
              <button type="submit" class="px-3 py-1.5 bg-gradient-to-r from-[#3b9e80] to-emerald-600 hover:brightness-110 text-white font-medium text-xs rounded-xl transition-all active:scale-95 flex items-center gap-1.5">
                ${icon('save', 'w-3.5 h-3.5')} Guardar textos
              </button>
            </div>
          </form>

          <form hx-post="/admin/release" hx-target="#app-main" hx-swap="outerHTML" class="pt-3 border-t border-white/5 space-y-2">
            <div>
              <p class="text-[11px] font-medium text-slate-300">Liberar plaza fija</p>
              <p class="text-[10px] text-slate-500">Queda libre y reservable. Vuelve a su dueño el próximo día laborable.</p>
            </div>
            ${
              releasable.length === 0
                ? '<p class="text-[10px] text-slate-500">No hay plazas fijas para liberar.</p>'
                : `<div class="flex flex-wrap items-center gap-2">
              <input name="pin" type="password" required autocomplete="current-password" placeholder="PIN" aria-label="PIN para liberar plazas"
                class="w-24 bg-slate-800/90 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-center font-mono text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400">
              ${releasable
                .map(
                  (seat) => `<button type="submit" name="seat_id" value="${seat.id}"
                class="px-3 py-1.5 rounded-xl bg-amber-950/70 hover:bg-amber-900/80 border border-amber-500/40 text-amber-200 text-xs font-medium transition-colors flex items-center gap-1">
                ${icon('user-minus', 'w-3.5 h-3.5')} Liberar ${escapeHtml(seat.name)}
              </button>`,
                )
                .join('')}
            </div>`
            }
          </form>

          <form hx-post="/admin/reset" hx-target="#app-main" hx-swap="outerHTML" class="pt-3 border-t border-white/5 flex items-center justify-between gap-3">
            <div>
              <p class="text-[11px] font-medium text-slate-300">Resetear plazas</p>
              <p class="text-[10px] text-slate-500">Vacía las 2 plazas libres ahora mismo.</p>
            </div>
            <input name="pin" type="password" required autocomplete="current-password" placeholder="PIN"
              aria-label="PIN para resetear plazas"
              class="w-24 bg-slate-800/90 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-center font-mono text-white placeholder-slate-500 focus:outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-400">
            <button type="submit" class="px-3 py-1.5 rounded-xl bg-rose-950/70 hover:bg-rose-900/80 border border-rose-500/40 text-rose-200 text-xs font-medium transition-colors flex items-center gap-1">
              ${icon('rotate-ccw', 'w-3.5 h-3.5')} Resetear
            </button>
          </form>
        </div>
      </div>
    </section>`;
}

export function renderCarCard(seats) {
  return `
    <section id="car-card" class="glass-card-elevated rounded-3xl p-5 md:p-7 shadow-glass relative">
      ${renderSeatsGrid(seats)}
    </section>`;
}

export function renderToast() {
  return `
    <div id="notification-toast" class="hidden transition-all duration-300 transform translate-y-2 opacity-0 mt-3 p-3 rounded-2xl bg-emerald-900/60 border border-emerald-500/40 text-xs text-emerald-200 flex items-center justify-between">
      <div class="flex items-center gap-2">
        ${icon('check-circle', 'w-4 h-4 text-emerald-400')}
        <span id="notification-text">¡Plaza reservada con éxito!</span>
      </div>
      <button type="button" data-toast-dismiss class="text-emerald-400 hover:text-white text-xs">Cerrar</button>
    </div>`;
}

/** Fragment replaced via `hx-target="#app-main"` by the admin endpoints. */
export function renderMain(state) {
  const { seats, timeIda, timeVuelta, tripTitle, puntoIda, puntoVuelta } = state;
  const { adminOpen = false, error = null, notice = null } = state;
  const releasable = seats.filter((seat) => seat.is_fixed === 1 && seat.position !== 'driver');
  return `<main id="app-main" class="flex flex-col gap-6">
    <header class="text-center space-y-2">
      <div class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full glass-inner text-xs font-medium text-emerald-300 mb-1 border border-emerald-500/20 shadow-sm">
        <span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
        <span>Viaje hoy: ${escapeHtml(tripTitle)}</span>
      </div>

      <div class="flex items-center justify-center gap-3">
        <div class="p-2.5 rounded-2xl bg-gradient-to-br from-[#3b9e80] to-purple-600 shadow-glow-teal flex items-center justify-center text-white">
          ${icon('car', 'w-7 h-7 stroke-[2.2]')}
        </div>
        <h1 class="text-4xl md:text-5xl font-black tracking-tight bg-gradient-to-r from-white via-emerald-200 to-[#3b9e80] bg-clip-text text-transparent">PatriCar</h1>
      </div>

      <p class="text-sm md:text-base text-slate-400 font-normal">Reserva tu plaza sin spam de WhatsApp 🚗💨</p>
    </header>

    ${renderScheduleCard({ timeIda, timeVuelta, tripTitle, puntoIda, puntoVuelta, releasable, adminOpen, error, notice })}
    <div id="car-card-region">
      ${renderCarCard(seats)}
      ${renderToast()}
    </div>
    <footer class="space-y-4">
      <div class="glass-card rounded-2xl p-4 flex items-center justify-between text-xs text-slate-400">
        <div class="flex items-center gap-2">
          ${icon('coffee', 'w-4 h-4 text-purple-400')}
          <span>Puntualidad británica requerida (máx. 5 min de espera)</span>
        </div>
        <span class="hidden sm:inline-block text-[11px] text-emerald-400 font-medium">Bizum voluntario ☕</span>
      </div>
      <div class="text-center text-[11px] text-slate-500 pb-4">
        PatriCar · Hecho con Express + HTMX + SQLite
      </div>
    </footer>
  </main>`;
}

const PAGE_SCRIPTS = `
    <script>
      if (window.htmx) {
        htmx.config.responseHandling = [
          { code: '204', swap: false },
          { code: '409', swap: true },
          { code: '401', swap: true },
          { code: '[23]..', swap: true },
          { code: '[45]..', swap: false, error: true },
        ];
      }

      document.addEventListener('click', (event) => {
        const open = event.target.closest('[data-seat-open]');
        if (open) {
          const id = open.getAttribute('data-seat-open');
          open.classList.add('hidden');
          const form = document.querySelector('[data-seat-form="' + id + '"]');
          if (form) {
            form.classList.remove('hidden');
            form.classList.add('flex');
            const input = form.querySelector('input[name="name"]');
            if (input) { input.value = ''; input.focus(); }
          }
          return;
        }
        const cancel = event.target.closest('[data-seat-cancel]');
        if (cancel) {
          const id = cancel.getAttribute('data-seat-cancel');
          const form = document.querySelector('[data-seat-form="' + id + '"]');
          if (form) { form.classList.add('hidden'); form.classList.remove('flex'); }
          const button = document.querySelector('[data-seat-open="' + id + '"]');
          if (button) button.classList.remove('hidden');
          return;
        }
        if (event.target.closest('[data-toast-dismiss]')) dismissNotification();
      });

      const driverPanelOpen = () => {
        const panel = document.getElementById('driver-form');
        return panel ? !panel.classList.contains('hidden') : false;
      };

      function toggleDriverConfig(forceState) {
        const panel = document.getElementById('driver-form');
        if (!panel) return;
        const show = forceState !== undefined ? forceState : !driverPanelOpen();
        panel.classList.toggle('hidden', !show);
        const label = document.querySelector('[data-admin-toggle-text]');
        if (label) label.textContent = show ? 'Cerrar' : 'Modificar';
        if (show) {
          const pin = document.getElementById('pin-input');
          if (pin) pin.focus();
          if (window.lucide) lucide.createIcons();
        }
      }

      function showNotification(text) {
        const toast = document.getElementById('notification-toast');
        const message = document.getElementById('notification-text');
        if (!toast || !message) return;
        message.textContent = text;
        toast.classList.remove('hidden');
        requestAnimationFrame(() => {
          toast.classList.remove('opacity-0', 'translate-y-2');
          toast.classList.add('opacity-100', 'translate-y-0');
        });
        clearTimeout(window.__patricarToast);
        window.__patricarToast = setTimeout(dismissNotification, 4000);
      }

      function dismissNotification() {
        const toast = document.getElementById('notification-toast');
        if (!toast) return;
        toast.classList.add('opacity-0', 'translate-y-2');
        toast.classList.remove('opacity-100', 'translate-y-0');
        setTimeout(() => toast.classList.add('hidden'), 300);
      }

      document.body.addEventListener('patricar:toast', (event) => {
        showNotification(event.detail && event.detail.message ? event.detail.message : '¡Plaza reservada con éxito!');
      });

      document.addEventListener('htmx:afterSwap', () => {
        if (window.lucide) lucide.createIcons();
      });
      document.addEventListener('DOMContentLoaded', () => {
        if (window.lucide) lucide.createIcons();
      });
    </script>`;

export function renderPage(state) {
  return `<!DOCTYPE html>
<html lang="es" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PatriCar - Comparte coche al trabajo sin spam</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <script src="https://unpkg.com/htmx.org@2.0.4"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            brand: {
              teal: '#3b9e80',
              tealLight: '#4ecdc4',
              tealDark: '#286c57',
              purple: '#7c3aed',
              purpleDark: '#4c1d95',
            },
          },
          fontFamily: {
            sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
          },
          boxShadow: {
            'glow-teal': '0 0 25px -5px rgba(59, 158, 128, 0.45)',
            'glow-purple': '0 0 25px -5px rgba(124, 58, 237, 0.35)',
            'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
          },
          animation: {
            'pulse-subtle': 'pulseSubtle 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
          },
          keyframes: {
            pulseSubtle: {
              '0%, 100%': { opacity: '1', transform: 'scale(1)' },
              '50%': { opacity: '.9', transform: 'scale(1.02)' },
            },
          },
        },
      },
    };
  </script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

    body {
      font-family: 'Inter', sans-serif;
      background-color: #0b0f19;
      background-image:
        radial-gradient(at 0% 0%, rgba(59, 158, 128, 0.15) 0px, transparent 50%),
        radial-gradient(at 100% 100%, rgba(124, 58, 237, 0.18) 0px, transparent 50%),
        radial-gradient(at 50% 50%, rgba(30, 41, 59, 0.5) 0px, transparent 100%);
      background-attachment: fixed;
    }

    .glass-card {
      background: rgba(18, 24, 38, 0.65);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }

    .glass-card-elevated {
      background: rgba(26, 34, 53, 0.75);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.12);
    }

    .glass-inner {
      background: rgba(15, 23, 42, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.05);
    }
  </style>
</head>
<body class="min-h-screen text-slate-100 flex flex-col justify-between antialiased selection:bg-emerald-500/30 selection:text-emerald-200">
  <div class="fixed inset-0 pointer-events-none overflow-hidden z-0">
    <div class="absolute -top-32 -left-32 w-96 h-96 bg-[#3b9e80]/15 rounded-full blur-[120px]"></div>
    <div class="absolute -bottom-32 -right-32 w-96 h-96 bg-[#7c3aed]/15 rounded-full blur-[120px]"></div>
    <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-slate-800/20 rounded-full blur-[140px]"></div>
  </div>

  <div class="relative z-10 w-full max-w-xl mx-auto px-4 py-6 md:py-10 flex flex-col gap-6">
    ${renderMain(state)}
  </div>

  ${PAGE_SCRIPTS}
</body>
</html>`;
}
