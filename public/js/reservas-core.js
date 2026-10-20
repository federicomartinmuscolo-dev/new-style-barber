/* Núcleo de reservas compartido por los diseños de la plataforma de barberías.
 * Maneja datos, validación, disponibilidad y el recorrido de reserva; cada
 * diseño solo aporta su marcado (vistas) y su CSS. Todo dato que viene del
 * servidor o del usuario pasa por esc() antes de ir al HTML. */
(function () {
  'use strict';

  const TZ = 'America/Argentina/Buenos_Aires';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const money = value => '$' + new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(value);
  const parts = (date = new Date()) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  const today = (now = new Date()) => { const p = parts(now); return `${p.year}-${p.month}-${p.day}`; };
  const noon = iso => new Date(`${iso}T12:00:00-03:00`);
  const addDays = (iso, amount) => { const date = noon(iso); date.setUTCDate(date.getUTCDate() + amount); return today(date); };
  const weekday = iso => noon(iso).getUTCDay();
  const dateLabel = (iso, options = { weekday: 'long', day: 'numeric', month: 'long' }) => new Intl.DateTimeFormat('es-AR', { timeZone: TZ, ...options }).format(noon(iso));
  const hhmm = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  const CONNECTION_ERROR = 'No pudimos conectar con la barbería. Revisá tu conexión y probá de nuevo.';
  const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

  async function request(path, { method = 'GET', body } = {}) {
    let response;
    try {
      response = await fetch(path, {
        method, credentials: 'same-origin', cache: 'no-store', body: body ? JSON.stringify(body) : undefined,
        headers: body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' }
      });
    } catch (_) { throw Object.assign(new Error(CONNECTION_ERROR), { code: 'network' }); }
    let data = null;
    try { data = response.status === 204 ? {} : await response.json(); } catch (_) { /* sin cuerpo */ }
    if (!response.ok) throw Object.assign(new Error(data?.message || CONNECTION_ERROR), { status: response.status, code: data?.error });
    return data;
  }

  let sitePromise = null;
  const loadSite = () => (sitePromise ??= request('/api/site').catch(error => { sitePromise = null; throw error; }));

  async function availability(serviceId, barberId = 'any') {
    const data = await request(`/api/availability?service=${encodeURIComponent(serviceId)}&barber=${encodeURIComponent(barberId)}`);
    return new Map(data.days.map(day => [day.date, day.slots]));
  }
  function firstFree(days) {
    for (const [date, slots] of days || []) {
      const slot = slots.find(item => item.available);
      if (slot) return { date, time: slot.time };
    }
    return null;
  }

  function validateCustomer({ name, phone, email }) {
    if (name.length < 2 || name.length > 80 || !/\p{L}/u.test(name) || /[<>]/.test(name)) return { field: 'name', message: 'Contanos tu nombre (al menos 2 letras).' };
    const digits = phone.replace(/\D/g, '');
    if (!/^[+\d\s().-]+$/.test(phone) || digits.length < 8 || digits.length > 15) return { field: 'phone', message: 'Ingresá un celular válido, con código de área.' };
    if (email && !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email)) return { field: 'email', message: 'Revisá el email o dejá ese campo vacío.' };
    return null;
  }

  const deposit = (site, price) => Math.max(1, Math.round(price * site.depositPercent / 100));
  const hasDeposit = site => site.depositPercent > 0 && site.depositPercent < 100;

  function hoursText(site) {
    const open = Array.from({ length: 7 }, (_, day) => !site.hours.closedWeekdays.includes(day));
    const order = [1, 2, 3, 4, 5, 6, 0].filter(day => open[day]);
    let days = order.map(day => WEEKDAYS[day]).join(', ');
    const consecutive = order.length > 2 && order.every((day, index) => index === 0 || day === (order[index - 1] + 1) % 7);
    if (consecutive) days = `${WEEKDAYS[order[0]]} a ${WEEKDAYS[order.at(-1)]}`;
    return { days, from: hhmm(site.hours.open), to: hhmm(site.hours.close) };
  }

  function calendarFile(booking, site) {
    const start = new Date(`${booking.date}T${booking.time}:00-03:00`);
    const end = new Date(start.getTime() + booking.duration * 60000);
    const stamp = value => value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const clean = value => String(value).replace(/[\r\n,;\\]/g, ' ');
    const service = site.services.find(item => item.id === booking.serviceId);
    const text = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Barberias//Reservas//ES', 'BEGIN:VEVENT',
      `UID:${booking.id}@reservas`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
      `SUMMARY:${clean(site.name)} - ${clean(service?.short || 'Turno')}`, `DESCRIPTION:Referencia ${clean(booking.reference)}.`,
      `STATUS:${booking.status === 'confirmed' ? 'CONFIRMED' : 'TENTATIVE'}`, 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
    const anchor = Object.assign(document.createElement('a'), { href: url, download: `turno-${booking.date}.ics` });
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* Recorrido de reserva. views recibe (state, site) y devuelve HTML:
   *   choose   servicio y profesional       time     día y horario
   *   details  datos y forma de pago        confirm  pago (simulado) o confirmación
   *   result   turno reservado              loading / failure(message)
   * Los botones usan data-action / data-value; los campos, name="name|phone|email|website". */
  function mountBooking({ dialog, content, views, closeButton }) {
    let site, state, returnFocus, busy = false;

    const focusHeading = () => requestAnimationFrame(() => { content.querySelector('[data-heading]')?.focus({ preventScroll: true }); dialog.scrollTop = 0; content.scrollTop = 0; });
    const service = () => site.services.find(item => item.id === state.serviceId);
    const barberName = id => site.barbers.find(item => item.id === id)?.name || 'Primer profesional disponible';
    const amount = () => state.paymentMode === 'deposit' ? deposit(site, service().price) : service().price;
    const helpers = { esc, money, dateLabel, addDays, today, weekday, service, barberName, amount, hasDeposit: () => hasDeposit(site), deposit: price => deposit(site, price) };

    function render() {
      if (!site) { content.innerHTML = views.loading(); return; }
      const view = state.result ? 'result' : ['choose', 'time', 'details', 'confirm'][state.step - 1];
      content.innerHTML = views[view](state, site, helpers);
      const error = content.querySelector('[data-error]');
      if (error) { error.textContent = state.error; error.hidden = !state.error; }
    }

    async function loadDays({ resetDate = false } = {}) {
      const key = `${state.serviceId}|${state.barberId}`;
      state.daysKey = key; state.loading = true; state.loadError = '';
      try {
        const days = await availability(state.serviceId, state.barberId);
        if (state.daysKey !== key) return;
        state.days = days;
        if (resetDate || !state.days.has(state.date)) state.date = (firstFree(days) || { date: today() }).date;
      } catch (error) {
        if (state.daysKey === key) state.loadError = error.message;
      } finally {
        if (state.daysKey === key) state.loading = false;
      }
      if (dialog.open && state.step === 2 && !state.result) { render(); focusHeading(); }
    }
    const isFree = (date, time) => (state.days?.get(date) || []).some(slot => slot.time === time && slot.available);

    function readFields() {
      for (const field of ['name', 'phone', 'email', 'website']) {
        const input = content.querySelector(`[name="${field}"]`);
        if (input) state[field] = field === 'website' ? input.value : input.value.trim();
      }
    }

    function showError(message, field) {
      state.error = message;
      const element = content.querySelector('[data-error]');
      if (element) { element.textContent = message; element.hidden = false; }
      const input = field && content.querySelector(`[name="${field}"]`);
      if (input) { input.setAttribute('aria-invalid', 'true'); input.focus(); }
      else element?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    async function open(serviceId) {
      returnFocus = document.activeElement;
      state = { step: 1, serviceId: '', barberId: 'any', date: '', time: '', name: '', phone: '', email: '', website: '', paymentMode: 'deposit', error: '', result: null, days: null, loading: false, loadError: '' };
      site = null;
      render();
      if (!dialog.open) dialog.showModal();
      try { site = await loadSite(); } catch (error) { content.innerHTML = views.failure(error.message); return; }
      state.serviceId = site.services.some(item => item.id === serviceId) ? serviceId : site.services[0]?.id;
      state.paymentMode = hasDeposit(site) ? 'deposit' : 'full';
      render(); focusHeading();
      loadDays({ resetDate: true });
    }

    async function next() {
      if (state.step === 2) {
        if (!state.time) return showError('Elegí un horario para continuar.');
        busy = true;
        await loadDays();
        busy = false;
        if (state.loadError) return showError(state.loadError);
        if (!isFree(state.date, state.time)) { state.time = ''; render(); return showError('Ese horario ya no está disponible. Elegí otro.'); }
      }
      if (state.step === 3) {
        readFields();
        const problem = validateCustomer(state);
        if (problem) return showError(problem.message, problem.field);
      }
      state.step = Math.min(4, state.step + 1);
      state.error = '';
      render(); focusHeading();
    }

    async function pay(outcome) {
      if (busy || state.result) return;
      if (outcome === 'rejected') return showError('Pago rechazado en la simulación. Tu turno todavía no está reservado y no se cobró nada. Podés volver a intentarlo.');
      if (!['approved', 'pending'].includes(outcome)) return;
      busy = true;
      content.querySelectorAll('[data-action="pay"]').forEach(button => { button.disabled = true; });
      try {
        const { booking } = await request('/api/bookings', { method: 'POST', body: {
          serviceId: state.serviceId, barberId: state.barberId, date: state.date, time: state.time, name: state.name, phone: state.phone,
          email: state.email, paymentMode: state.paymentMode, outcome, website: state.website
        } });
        state.result = booking;
        render(); focusHeading();
      } catch (error) {
        if (error.code === 'slot_taken' || error.code === 'invalid_slot') {
          state.step = 2; state.time = ''; state.error = error.message;
          render(); focusHeading(); loadDays();
        } else { render(); showError(error.message); }
      } finally { busy = false; }
    }

    content.addEventListener('click', event => {
      const button = event.target.closest('[data-action]');
      if (!button || button.disabled || busy || !site) return;
      const { action, value } = button.dataset;
      readFields();
      state.error = '';
      if (action === 'service' && site.services.some(item => item.id === value)) { state.serviceId = value; state.time = ''; loadDays({ resetDate: true }); }
      else if (action === 'barber' && (value === 'any' || site.barbers.some(item => item.id === value))) { state.barberId = value; state.time = ''; loadDays({ resetDate: true }); }
      else if (action === 'date' && state.days?.has(value)) { state.date = value; state.time = ''; }
      else if (action === 'time' && isFree(state.date, value)) state.time = value;
      else if (action === 'payment-mode' && (value === 'full' || (value === 'deposit' && hasDeposit(site)))) state.paymentMode = value;
      else if (action === 'next') return next();
      else if (action === 'back') { state.step = Math.max(1, state.step - 1); render(); return focusHeading(); }
      else if (action === 'retry') { render(); return loadDays(); }
      else if (action === 'pay') return pay(value);
      else if (action === 'calendar' && state.result) return calendarFile(state.result, site);
      else if (action === 'close') return close();
      else return;
      const scroll = dialog.scrollTop;
      render();
      Array.from(content.querySelectorAll('[data-action]')).find(element => element.dataset.action === action && element.dataset.value === value)?.focus({ preventScroll: true });
      dialog.scrollTop = scroll;
    });
    content.addEventListener('submit', event => { event.preventDefault(); content.querySelector('[data-action="next"]')?.click(); });
    content.addEventListener('input', event => event.target.removeAttribute('aria-invalid'));
    function close() { dialog.close(); }
    dialog.addEventListener('close', () => returnFocus?.focus?.());
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
    });
    closeButton?.addEventListener('click', close);
    return { open, close };
  }

  /* Agenda del dueño (página /agenda). Marcado genérico con clases ag-*; cada
   * diseño la viste con su CSS. */
  function mountAgenda(root) {
    let scope = 'upcoming', appointments = [], error = '', email = '', confirmCancel = null, services = new Map();
    const STATUS = { confirmed: 'Confirmado', pending: 'Seña pendiente', cancelled: 'Cancelado', expired: 'Vencido' };
    const set = html => { root.innerHTML = html; };

    function loginView(message = '') {
      set(`<form class="ag-login" id="ag-login"><h1 class="ag-title" tabindex="-1" data-heading>Agenda del dueño</h1><p class="ag-sub">Ingresá con la cuenta que te dio la plataforma.</p>
        <label class="ag-field">Email<input name="email" type="email" autocomplete="username" required maxlength="254" value="${esc(email)}"></label>
        <label class="ag-field">Contraseña<input name="password" type="password" autocomplete="current-password" required maxlength="200"></label>
        <p class="ag-error" role="alert" ${message ? '' : 'hidden'}>${esc(message)}</p>
        <button class="ag-button ag-primary" type="submit">Entrar</button></form>`);
      root.querySelector(message ? '[name="password"]' : '[data-heading]')?.focus();
    }

    function listView() {
      const groups = new Map();
      for (const item of appointments) {
        if (!groups.has(item.date)) groups.set(item.date, []);
        groups.get(item.date).push(item);
      }
      const active = appointments.filter(item => ['confirmed', 'pending'].includes(item.status));
      set(`<header class="ag-head"><div><h1 class="ag-title" tabindex="-1" data-heading>Tus turnos</h1><p class="ag-sub">${active.length} activos${scope === 'upcoming' ? ' desde hoy' : ''}.</p></div>
        <div class="ag-tools"><button class="ag-button ${scope === 'upcoming' ? 'ag-primary' : ''}" data-ag="scope" data-value="upcoming" aria-pressed="${scope === 'upcoming'}">Próximos</button><button class="ag-button ${scope === 'all' ? 'ag-primary' : ''}" data-ag="scope" data-value="all" aria-pressed="${scope === 'all'}">Todos</button><button class="ag-button" data-ag="logout">Salir</button></div></header>
        <p class="ag-error" role="alert" ${error ? '' : 'hidden'}>${esc(error)}</p>
        ${groups.size ? [...groups].map(([date, items]) => `<section class="ag-day"><h2>${esc(dateLabel(date))}</h2><ul class="ag-list">${items.map(item => `
          <li class="ag-item ag-${esc(item.status)}"><span class="ag-time">${esc(item.time)}</span><span class="ag-who"><strong>${esc(item.name)}</strong><span>${esc(item.phone)}${item.email ? ' · ' + esc(item.email) : ''}</span></span>
          <span class="ag-what">${esc(services.get(item.serviceId) || 'Turno')} · ${esc(item.duration)} min · ${money(item.amount)} ${item.paymentMode === 'deposit' ? 'de seña' : 'pagado'}</span><span class="ag-status">${STATUS[item.status] || ''}</span>
          <span class="ag-actions">${item.status === 'pending' ? `<button class="ag-button" data-ag="confirm" data-id="${esc(item.id)}">Confirmar seña</button>` : ''}${['pending', 'confirmed'].includes(item.status) ? (confirmCancel === item.id ? `<button class="ag-button ag-danger" data-ag="cancel" data-id="${esc(item.id)}">Sí, cancelar</button><button class="ag-button" data-ag="keep">No</button>` : `<button class="ag-button" data-ag="ask-cancel" data-id="${esc(item.id)}">Cancelar</button>`) : ''}</span></li>`).join('')}</ul></section>`).join('') : '<p class="ag-empty">No hay turnos para mostrar. Cuando alguien reserve, aparece acá.</p>'}`);
    }

    async function load() {
      if (!services.size) {
        try { services = new Map((await loadSite()).services.map(item => [item.id, item.short || item.name])); } catch (_) { /* sin nombres de servicio */ }
      }
      try {
        appointments = (await request(`/api/admin/appointments?scope=${scope}`)).appointments;
        listView();
      } catch (problem) {
        if (problem.status === 401) loginView(); else { error = problem.message; listView(); }
      }
    }

    root.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.target;
      email = form.email.value.trim();
      try {
        await request('/api/admin/login', { method: 'POST', body: { email, password: form.password.value } });
        await load();
        root.querySelector('[data-heading]')?.focus();
      } catch (problem) { loginView(problem.message); }
    });
    root.addEventListener('click', async event => {
      const button = event.target.closest('[data-ag]');
      if (!button) return;
      const action = button.dataset.ag;
      error = '';
      if (action === 'scope') { scope = button.dataset.value === 'all' ? 'all' : 'upcoming'; confirmCancel = null; return load(); }
      if (action === 'ask-cancel') { confirmCancel = button.dataset.id; listView(); return root.querySelector('[data-ag="cancel"]')?.focus(); }
      if (action === 'keep') { confirmCancel = null; return listView(); }
      if (action === 'logout') { await request('/api/admin/logout', { method: 'POST', body: {} }).catch(() => {}); return loginView(); }
      if (action === 'confirm' || action === 'cancel') {
        button.disabled = true;
        try { await request(`/api/admin/appointments/${encodeURIComponent(button.dataset.id)}/${action}`, { method: 'POST', body: {} }); }
        catch (problem) { error = problem.message; }
        confirmCancel = null;
        return load();
      }
    });
    load();
  }

  window.Reservas = { esc, money, today, addDays, weekday, dateLabel, hhmm, loadSite, availability, firstFree, validateCustomer, deposit, hasDeposit, hoursText, mountBooking, mountAgenda };
}());
