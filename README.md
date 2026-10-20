# New Style · sitio de turnos

Diseño **Turnero de "sacá número"** para la plataforma de barberías
([barbers-admin](https://github.com/federicomartinmuscolo-dev/barbers-admin)).
En la plataforma es el diseño `newstyle`.

Un turnero rosa con display de siete segmentos muestra en vivo el próximo horario libre y "imprime" el ticket. Escala de fade del 0 al 8 y servicios como tickets de papel.

## Cómo funciona

`public/` es una web estática sin build. Todo el contenido que cambia
(nombre, servicios, precios, duración, equipo, horarios, seña, contacto) lo
carga desde la API de la plataforma (`/api/site`), así que se edita desde el
dashboard sin tocar código. El mismo diseño puede usarse para otra barbería:
alcanza con darla de alta eligiendo este diseño.

- `public/index.html`, `public/css/styles.css`, `public/js/site.js`: el diseño
  y sus vistas del recorrido de reserva.
- `public/js/reservas-core.js`: núcleo compartido de reservas (datos, validación,
  disponibilidad, recorrido y agenda del dueño). La copia de referencia está en
  `barbers-admin/shared/`; actualizala con `scripts/sync-core.sh` de la plataforma.
- `public/agenda.html`: agenda del dueño del sitio (login, ver, confirmar seña y
  cancelar turnos).

## Probarlo

Se sirve desde la plataforma (ver su README): con el stack levantado en tu
máquina, este sitio queda en `http://newstyle.localhost:8090`.

## Seguridad

Sin scripts ni estilos inline (la plataforma aplica una CSP estricta). Todo dato
del servidor o del usuario pasa por `esc()` antes de llegar al HTML. Precios y
disponibilidad los decide el servidor.

## Dirección visual

- Concepto: Turnero de "sacá número".
- Paleta: Menta #e3f3ec, pino #0f3a33, rosa #ff4f7b, LED #ff4a2a sobre pantalla #160b09.
- Tipografía: Unbounded (ancha, para títulos y números) y Onest para lectura.
- Movimiento: Los dígitos del turnero parpadean una vez al encender; se actualizan cada minuto con la agenda real.
