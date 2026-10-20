/* New Style: un turnero de "sacá número" que muestra en vivo el próximo
 * horario libre. Arma los tickets de servicios y las vistas de la reserva. */
(function () {
  'use strict';
  const R = window.Reservas;
  const $ = selector => document.querySelector(selector);
  const $$ = selector => Array.from(document.querySelectorAll(selector));
  const { esc, money } = R;

  // Display de siete segmentos en SVG (con clases, sin estilos en línea).
  const SEGMENTS = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g' };
  function digitShapes(char, x) {
    const w = 44, h = 88, t = 9, half = h / 2;
    const rects = {
      a: [t, 0, w - 2 * t, t], b: [w - t, t, t, half - t - 2], c: [w - t, half + 2, t, half - t - 2], d: [t, h - t, w - 2 * t, t],
      e: [0, half + 2, t, half - t - 2], f: [0, t, t, half - t - 2], g: [t, half - t / 2, w - 2 * t, t]
    };
    const on = SEGMENTS[char] || '';
    return `<g transform="translate(${x} 6) skewX(-6)">${Object.entries(rects).map(([name, [rx, ry, rw, rh]]) => `<rect class="seg${on.includes(name) ? ' on' : ''}" x="${rx}" y="${ry}" width="${rw}" height="${rh}" rx="3"/>`).join('')}</g>`;
  }
  function showTime(text) {
    const [hh, mm] = /^\d{2}:\d{2}$/.test(text) ? text.split(':') : ['--', '--'];
    $('[data-digits]').innerHTML = digitShapes(hh[0], 8) + digitShapes(hh[1], 62) +
      `<rect class="seg on colon" x="119" y="30" width="9" height="9" rx="2"/><rect class="seg on colon" x="116" y="62" width="9" height="9" rx="2"/>` +
      digitShapes(mm[0], 138) + digitShapes(mm[1], 192);
  }

  const head = (number, text, sub) => `<p class="step">Paso ${number} de 4</p><h2 class="booking-title" tabindex="-1" data-heading>${text}</h2>${sub ? `<p class="booking-sub">${sub}</p>` : ''}`;
  const errorBox = '<p class="form-error" role="alert" data-error hidden></p>';
  const nav = (label, { back = true, action = 'next' } = {}) => `<div class="booking-nav">${back ? '<button class="btn btn-soft" type="button" data-action="back">Atrás</button>' : '<span></span>'}<button class="btn btn-pink" type="button" data-action="${action}">${label}</button></div>`;

  const views = {
    loading: () => '<p class="booking-wait" role="status">Prendiendo el turnero…</p>',
    failure: message => `<h2 class="booking-title" tabindex="-1" data-heading>No pudimos abrir la agenda</h2><p class="booking-sub">${esc(message)}</p>` + nav('Cerrar', { back: false, action: 'close' }),
    choose(state, site) {
      return head(1, '¿Qué te hacés?', 'Elegí el servicio y quién te atiende.') +
        `<div class="options" role="group" aria-label="Servicio">${site.services.map(item => `<button type="button" class="option ${state.serviceId === item.id ? 'is-on' : ''}" data-action="service" data-value="${esc(item.id)}" aria-pressed="${state.serviceId === item.id}"><strong>${esc(item.name)}</strong><span>${esc(item.duration)} min</span><b>${money(item.price)}</b></button>`).join('')}</div>
        <h3 class="booking-h3">Con quién</h3>
        <div class="pills" role="group" aria-label="Profesional">${[{ id: 'any', name: 'El que esté libre' }, ...site.barbers].map(item => `<button type="button" class="pill ${state.barberId === item.id ? 'is-on' : ''}" data-action="barber" data-value="${esc(item.id)}" aria-pressed="${state.barberId === item.id}">${esc(item.name)}</button>`).join('')}</div>` +
        errorBox + nav('Ver horarios', { back: false });
    },
    time(state, site, h) {
      const top = head(2, '¿A qué hora?', `${esc(h.service().name)} · ${esc(h.service().duration)} min · ${esc(h.barberName(state.barberId))}`);
      if (state.loadError) return top + `<p class="form-error" role="alert">${esc(state.loadError)}</p>` + nav('Reintentar', { action: 'retry' });
      if (state.loading || !state.days) return top + '<p class="booking-wait" role="status">Mirando la agenda…</p>' + nav('Continuar');
      const slots = state.days.get(state.date) || [];
      return top + `<div class="dates" role="group" aria-label="Día">${[...state.days.keys()].map(date => {
          const closed = site.hours.closedWeekdays.includes(h.weekday(date));
          return `<button type="button" class="date ${state.date === date ? 'is-on' : ''}" data-action="date" data-value="${date}" aria-pressed="${state.date === date}" aria-label="${esc(h.dateLabel(date))}${closed ? ', cerrado' : ''}" ${closed ? 'disabled' : ''}><span>${esc(h.dateLabel(date, { weekday: 'short' }))}</span><b>${date.slice(-2)}</b></button>`;
        }).join('')}</div>
        <h3 class="booking-h3">${esc(h.dateLabel(state.date))}</h3>
        ${slots.some(slot => slot.available) ? `<div class="leds" role="group" aria-label="Horario">${slots.map(slot => `<button type="button" class="led ${state.time === slot.time ? 'is-on' : ''}" data-action="time" data-value="${slot.time}" aria-pressed="${state.time === slot.time}" ${slot.available ? '' : 'disabled'} aria-label="${slot.time}, ${slot.available ? 'libre' : 'ocupado'}">${slot.time}</button>`).join('')}</div>` : '<p class="booking-wait">Para ese día ya no hay números. Probá otro.</p>'}` +
        errorBox + nav('Continuar');
    },
    details(state, site, h) {
      const price = h.service().price;
      return head(3, 'Tus datos', 'Solo para avisarte si cambia algo.') +
        `<form class="form" novalidate>
          <label class="field">Nombre y apellido<input name="name" autocomplete="name" maxlength="80" required value="${esc(state.name)}"></label>
          <label class="field">Celular<input name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="30" required placeholder="11 2345 6789" value="${esc(state.phone)}"></label>
          <label class="field">Email <span class="muted">(opcional)</span><input name="email" type="email" autocomplete="email" maxlength="254" value="${esc(state.email)}"></label>
          <div class="trap" aria-hidden="true"><label>No completar<input name="website" tabindex="-1" autocomplete="off"></label></div>
        </form>
        <h3 class="booking-h3">Pago</h3>
        <div class="options" role="group" aria-label="Forma de pago">
          ${h.hasDeposit() ? `<button type="button" class="option ${state.paymentMode === 'deposit' ? 'is-on' : ''}" data-action="payment-mode" data-value="deposit" aria-pressed="${state.paymentMode === 'deposit'}"><strong>Seña ahora</strong><span>${esc(site.depositPercent)}%, el resto en el local</span><b>${money(h.deposit(price))}</b></button>` : ''}
          <button type="button" class="option ${state.paymentMode === 'full' ? 'is-on' : ''}" data-action="payment-mode" data-value="full" aria-pressed="${state.paymentMode === 'full'}"><strong>Todo ahora</strong><span>y listo</span><b>${money(price)}</b></button>
        </div>` + errorBox + nav('Revisar');
    },
    confirm(state, site, h) {
      const ticket = `<div class="print"><span class="print-label">Tu número</span><strong class="print-time">${esc(state.time)}</strong><span>${esc(h.dateLabel(state.date))}</span><span>${esc(h.service().name)} con ${esc(h.barberName(state.barberId))}</span><span>${state.paymentMode === 'deposit' ? 'Seña' : 'Total'}: ${money(h.amount())}</span></div>`;
      if (site.payments === 'manual') return head(4, 'Confirmá', 'Te confirmamos la seña por mensaje.') + ticket + errorBox +
        '<div class="booking-nav"><button class="btn btn-soft" type="button" data-action="back">Atrás</button><button class="btn btn-pink" type="button" data-action="pay" data-value="pending">Sacar número</button></div>';
      return head(4, 'Pagá y listo', 'Pago de prueba: no se cobra nada ni se piden tarjetas.') + ticket +
        '<div class="sim"><button class="btn btn-pink" type="button" data-action="pay" data-value="approved">Simular pago aprobado</button><button class="btn btn-soft" type="button" data-action="pay" data-value="pending">Pendiente</button><button class="btn btn-soft" type="button" data-action="pay" data-value="rejected">Rechazo</button></div>' +
        errorBox + '<div class="booking-nav"><button class="btn btn-soft" type="button" data-action="back">Atrás</button><span></span></div>';
    },
    result(state, site, h) {
      const booking = state.result;
      const ok = booking.status === 'confirmed';
      return `<div class="print print-done"><span class="print-label">${ok ? 'Número confirmado' : 'Número apartado'}</span><strong class="print-time">${esc(booking.time)}</strong><span>${esc(h.dateLabel(booking.date))}</span><span>Ref. ${esc(booking.reference)}</span></div>
        <h2 class="booking-title" tabindex="-1" data-heading>${ok ? 'Listo, tenés número.' : 'Te guardamos el lugar.'}</h2>
        <p class="booking-sub">${esc(h.barberName(booking.barberId))} te espera a las ${esc(booking.time)}. ${ok ? 'Llegá cinco minutos antes.' : 'Te confirmamos cuando entre la seña.'}</p>
        <div class="booking-nav"><button class="btn btn-soft" type="button" data-action="calendar">Agregar al calendario</button><button class="btn btn-pink" type="button" data-action="close">Listo</button></div>`;
    }
  };

  function renderSite(site) {
    $$('[data-site-name]').forEach(element => { element.textContent = site.name; });
    document.title = `${site.name} · Sacá número`;
    $('[data-services]').innerHTML = site.services.map(item => `<li class="ticket"><span class="ticket-price">${money(item.price)}</span><h3>${esc(item.name)}</h3><p>${esc(item.duration)} min${item.description ? ` · ${esc(item.description)}` : ''}</p><button class="btn btn-ink" type="button" data-book data-service="${esc(item.id)}">Sacar número</button></li>`).join('');
    $('[data-deposit-note]').textContent = R.hasDeposit(site) ? `Reservás con el ${site.depositPercent}% de seña. El resto, en el local.` : 'El turno se paga al reservar.';
    $('[data-barbers]').innerHTML = site.barbers.map(item => `<li><span class="team-name">${esc(item.name)}</span><button class="btn btn-soft" type="button" data-book data-barber="${esc(item.id)}">Turno con ${esc(item.name)}</button></li>`).join('');
    const hours = R.hoursText(site);
    $('[data-hours-days]').textContent = hours.days.charAt(0).toUpperCase() + hours.days.slice(1);
    $('[data-hours-range]').textContent = `${hours.from} a ${hours.to} h`;
    const contact = [site.contact.address, site.contact.phone].filter(Boolean).map(esc);
    if (site.contact.instagram) contact.push(`<a href="https://instagram.com/${encodeURIComponent(site.contact.instagram)}" rel="noopener noreferrer" target="_blank">@${esc(site.contact.instagram)}</a>`);
    $('[data-contact]').innerHTML = contact.join('<br>');
  }

  async function updateTurnero(site) {
    try {
      const free = R.firstFree(await R.availability(site.services[0].id));
      showTime(free ? free.time : '--:--');
      $('[data-ticket-time]').textContent = free ? free.time : '--:--';
      $('[data-turnero-day]').textContent = free ? (free.date === R.today() ? 'Hoy' : R.dateLabel(free.date, { weekday: 'long', day: 'numeric' })) : 'Agenda completa';
    } catch (_) {
      showTime('--:--');
      $('[data-turnero-day]').textContent = 'Sin conexión';
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    showTime('--:--');
    const flow = R.mountBooking({ dialog: $('#booking'), content: $('#booking-body'), views, closeButton: $('#booking-close') });
    document.addEventListener('click', event => {
      const trigger = event.target.closest('[data-book]');
      if (!trigger) return;
      event.preventDefault();
      flow.open(trigger.dataset.service).then(() => {
        if (trigger.dataset.barber) document.querySelector(`#booking-body [data-action="barber"][data-value="${CSS.escape(trigger.dataset.barber)}"]`)?.click();
      });
    });
    try {
      const site = await R.loadSite();
      renderSite(site);
      await updateTurnero(site);
      $('[data-display]').classList.add('is-on');
      setInterval(() => updateTurnero(site), 60_000);
    } catch (_) {
      $('[data-services]').innerHTML = '<li class="ticket"><h3>No pudimos cargar los servicios</h3><p>Probá en un rato.</p></li>';
      $('[data-turnero-day]').textContent = 'Sin conexión';
    }
  });
}());
