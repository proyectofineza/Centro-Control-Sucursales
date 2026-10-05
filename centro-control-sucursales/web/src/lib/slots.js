// Configuración y utilidades del control de tragamonedas.

// Horarios de control (hora Paraguay). Si algún día cambian, alcanza con
// editar esta lista — el resto de la app y la base de datos la toman de acá.
export const SLOT_TIMES = ['18:00', '22:00', '23:30'];

// Los tres puntos que se verifican en cada tragamonedas.
// "ok" = cómo debe estar; "bad" = cómo se registra la incidencia.
export const SLOT_CHECKS = [
  { key: 'is_outside', label: 'Afuera del local', ok: 'Está afuera', bad: 'Está adentro', issue: 'Adentro del local' },
  { key: 'far_from_atc', label: 'Alejada del ATC', ok: 'Alejada', bad: 'Cerca del ATC', issue: 'Cerca del ATC' },
  { key: 'is_operating', label: 'En funcionamiento', ok: 'Funciona', bad: 'No opera', issue: 'No opera' },
];

const TZ = 'America/Asuncion';

function partsInParaguay(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const p = {};
  fmt.formatToParts(date).forEach((x) => (p[x.type] = x.value));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24, minute: Number(p.minute) };
}

function shiftDate(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Fecha de control vigente. Los controles terminan a las 23:30, así que
// hasta las 06:00 todavía se considera la fecha del día anterior (por si
// un control se carga pasada la medianoche).
export function currentControlDate() {
  const p = partsInParaguay();
  return p.hour < 6 ? shiftDate(p.date, -1) : p.date;
}

export function addDays(isoDate, days) {
  return shiftDate(isoDate, days);
}

// Horario sugerido: el último que ya arrancó; antes de las 18:00 sugiere
// el primero. Pasada la medianoche (hasta las 06:00) sugiere el último.
export function suggestedSlot() {
  const p = partsInParaguay();
  if (p.hour < 6) return SLOT_TIMES[SLOT_TIMES.length - 1];
  const nowMin = p.hour * 60 + p.minute;
  let chosen = SLOT_TIMES[0];
  SLOT_TIMES.forEach((s) => {
    const [h, m] = s.split(':').map(Number);
    if (nowMin >= h * 60 + m) chosen = s;
  });
  return chosen;
}

// ¿Todavía no llegó la hora de este horario para la fecha dada?
export function isSlotInFuture(controlDate, slot) {
  const p = partsInParaguay();
  const today = p.hour < 6 ? shiftDate(p.date, -1) : p.date;
  if (controlDate > today) return true;
  if (controlDate < today) return false;
  if (p.hour < 6) return false;
  const [h, m] = slot.split(':').map(Number);
  return p.hour * 60 + p.minute < h * 60 + m;
}

export function fmtControlDate(isoDate) {
  if (!isoDate) return '—';
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

// Lista de problemas de una máquina, en texto: ["No opera", "Cerca del ATC"]
export function issuesOf(item) {
  return SLOT_CHECKS.filter((c) => item[c.key] === false).map((c) => c.issue);
}
