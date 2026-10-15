// Configuración y utilidades del control de tragamonedas.

// Horarios de control (hora Paraguay). Si algún día cambian, alcanza con
// editar esta lista — el resto de la app y la base de datos la toman de acá.
// ---------------------------------------------------------------------
// Horarios de control. Se guardan en la base (tabla slot_schedule) y el
// Administrador los edita desde "Horarios tragamonedas". La app los carga
// al iniciar sesión (lib/schedule.jsx). Si no se pueden cargar (por ejemplo
// si falta correr la migración 0012) se usan estos valores de respaldo.
//   on_weekdays = lunes a viernes | on_weekend = sábados y domingos
//   valid_from / valid_to = fechas (inclusive) en que rige el horario
// ---------------------------------------------------------------------
export const DEFAULT_SCHEDULE = [
  { slot: '11:00', on_weekdays: false, on_weekend: true, valid_from: '2026-10-10', valid_to: null },
  { slot: '15:30', on_weekdays: true, on_weekend: true, valid_from: '2026-10-09', valid_to: null },
  { slot: '18:00', on_weekdays: true, on_weekend: true, valid_from: '2000-01-01', valid_to: null },
  { slot: '22:00', on_weekdays: true, on_weekend: true, valid_from: '2000-01-01', valid_to: null },
  { slot: '23:30', on_weekdays: true, on_weekend: true, valid_from: '2000-01-01', valid_to: null },
];

let schedule = DEFAULT_SCHEDULE;

export function setSchedule(rows) {
  schedule = rows && rows.length ? rows.map((r) => ({ ...r, valid_to: r.valid_to || null })) : DEFAULT_SCHEDULE;
}

export function getSchedule() {
  return schedule;
}

// Horarios que corresponden a una fecha puntual, ordenados.
export function slotTimesFor(isoDate) {
  const dow = new Date(`${isoDate}T12:00:00Z`).getUTCDay(); // 0 domingo, 6 sábado
  const weekend = dow === 0 || dow === 6;
  const set = new Set(
    schedule
      .filter((r) => (weekend ? r.on_weekend : r.on_weekdays) && r.valid_from <= isoDate && (!r.valid_to || r.valid_to >= isoDate))
      .map((r) => r.slot)
  );
  return [...set].sort();
}

// Todos los horarios que existen (o existieron) en la configuración.
export function allSlotTimes() {
  return [...new Set(schedule.map((r) => r.slot))].sort();
}

// Los tres puntos que se verifican en cada tragamonedas.
// "ok" = cómo debe estar; "bad" = cómo se registra el problema.
// Los TRES problemas (Sin sacar, Cerca del ATC y Apagado) cuentan como
// incidencia: la máquina queda marcada y se arrastra como "sin resolver"
// hasta que un control posterior la marque OK.
// `issueKey` es el nombre que usa la base de datos (vista slot_open_issues).
export const SLOT_CHECKS = [
  { key: 'is_outside', issueKey: 'inside', label: 'Afuera del local', ok: 'Afuera', bad: 'Sin sacar', issue: 'Sin sacar' },
  { key: 'far_from_atc', issueKey: 'near_atc', label: 'Alejada del ATC', ok: 'Alejada', bad: 'Cerca del ATC', issue: 'Cerca del ATC' },
  { key: 'is_operating', issueKey: 'not_operating', label: 'En funcionamiento', ok: 'Funcionando', bad: 'Apagado', issue: 'Apagado' },
];

// Penalidades: cuántos DÍAS en el mes puede tener una sucursal cada problema
// antes de entrar en penalidad. Para cambiar un límite, editar el número.
// (Un día cuenta una sola vez aunque el problema aparezca en varios controles.)
export const PENALTY_LIMITS = { inside: 3, near_atc: 3, not_operating: 3 };

// Problemas de una máquina según el contexto del control:
//  - rain:  llueve → "Sin sacar" queda justificado si la máquina está encendida.
//  - fixed: la máquina tiene regla ("siempre adentro" / "junto al ATC") → solo cuenta "Apagado".
// Devuelve las entradas de SLOT_CHECKS que cuentan como problema.
export function issuesEff(item, { rain = false, fixed = false } = {}) {
  const on = item.is_operating !== false;
  return SLOT_CHECKS.filter((c) => {
    if (c.key === 'is_operating') return !on;
    if (fixed) return false;
    if (c.key === 'is_outside') return item.is_outside === false && !(rain && on);
    return item.far_from_atc === false;
  });
}

// ¿Este "Sin sacar" quedó justificado por la lluvia?
export const isRainExcused = (item, rain, fixed = false) =>
  !!rain && !fixed && item.is_outside === false && item.is_operating !== false;

// Reglas por máquina (se guardan solo 'adentro' y 'atc'; sin regla = 'afuera').
export const MACHINE_RULES = [
  { value: 'afuera', label: 'Afuera (normal)' },
  { value: 'adentro', label: 'Siempre adentro' },
  { value: 'atc', label: 'Junto al ATC' },
];
export const RULE_LABEL = { adentro: 'Siempre adentro', atc: 'Junto al ATC' };

export const EXCUSE_LABEL = { lluvia: 'Justificado por lluvia', regla_sucursal: 'Permitido en esta sucursal' };

export const ISSUE_BY_KEY = Object.fromEntries(SLOT_CHECKS.map((c) => [c.issueKey, c]));

// Tiempo (segundos) que tiene quien reporta para editar el informe. Lo
// aplica la base de datos; este valor es solo informativo para la pantalla.
export const EDIT_WINDOW_SECONDS = 60;

// Resumen legible de los cambios de una edición (para el historial).
export function describeChanges(h) {
  const out = [];
  if (h.before_count !== h.after_count) out.push(`Cantidad de tragamonedas: ${h.before_count} → ${h.after_count}`);
  const before = Object.fromEntries((h.before_items || []).map((x) => [x.machine_no, x]));
  const after = Object.fromEntries((h.after_items || []).map((x) => [x.machine_no, x]));
  const nums = [...new Set([...Object.keys(before), ...Object.keys(after)])].map(Number).sort((a, b) => a - b);
  nums.forEach((n) => {
    const b = before[n];
    const a = after[n];
    if (!b) return out.push(`#${n}: máquina agregada`);
    if (!a) return out.push(`#${n}: máquina quitada`);
    SLOT_CHECKS.forEach((c) => {
      if (b[c.key] !== a[c.key]) out.push(`#${n}: ${c.issue} ${b[c.key] ? 'no estaba marcado → ahora SÍ (problema)' : 'estaba marcado → ahora OK'}`);
    });
    if ((b.inside_excuse || '') !== (a.inside_excuse || '')) out.push(`#${n}: ${a.inside_excuse ? `Sin sacar ${EXCUSE_LABEL[a.inside_excuse].toLowerCase()}` : 'Sin sacar ya no está justificado'}`);
    if ((b.observation || '') !== (a.observation || '')) out.push(`#${n}: observación modificada`);
  });
  if (h.before_rain !== h.after_rain && h.before_rain != null && h.after_rain != null) out.push(`Lluvia: ${h.before_rain ? 'sí' : 'no'} → ${h.after_rain ? 'sí' : 'no'}`);
  if ((h.before_notes || '') !== (h.after_notes || '')) out.push('Observación general modificada');
  return out.length ? out : ['Sin diferencias visibles'];
}

// Fecha y hora corta en hora de Paraguay, ej. "06/10 18:02"
export function fmtDateTimePy(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-PY', { timeZone: 'America/Asuncion', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}

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
  const times = slotTimesFor(currentControlDate());
  if (times.length === 0) return '';
  if (p.hour < 6) return times[times.length - 1];
  const nowMin = p.hour * 60 + p.minute;
  let chosen = times[0];
  times.forEach((s) => {
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

// Lista de problemas de una máquina, en texto: ["Apagado", "Cerca del ATC"]
export function issuesOf(item) {
  return SLOT_CHECKS.filter((c) => item[c.key] === false).map((c) => c.issue);
}

// ---------------------------------------------------------------------
// Períodos (semana / mes) para el panel de resúmenes
// ---------------------------------------------------------------------
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Lunes de la semana que contiene la fecha dada (semana lunes a domingo).
export function startOfWeek(isoDate) {
  const dow = new Date(`${isoDate}T12:00:00Z`).getUTCDay(); // 0 = domingo
  return addDays(isoDate, -((dow + 6) % 7));
}

export function weekRange(isoDate) {
  const from = startOfWeek(isoDate);
  return { from, to: addDays(from, 6) };
}

// ym = 'YYYY-MM'
export function monthRange(ym) {
  const [y, m] = ym.split('-').map(Number);
  const from = `${ym}-01`;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from, to: `${ym}-${String(last).padStart(2, '0')}` };
}

export function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function fmtMonthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  const name = MESES[m - 1];
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`;
}

export function fmtShortDate(isoDate) {
  const [, m, d] = isoDate.split('-');
  return `${d}/${m}`;
}

// Fechas del rango [from, to] que ya empezaron (no incluye días futuros).
export function datesUpToToday(from, to) {
  const today = currentControlDate();
  const out = [];
  let d = from;
  while (d <= to && d <= today) {
    out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

// Cuántos controles se esperaban por sucursal en el rango: 3 horarios por
// día, y para hoy solo los horarios que ya arrancaron.
export function expectedChecksPerBranch(from, to) {
  return datesUpToToday(from, to).reduce((sum, d) => sum + slotTimesFor(d).filter((s) => !isSlotInFuture(d, s)).length, 0);
}

// Igual, pero para un horario puntual: días del rango en los que ese horario ya arrancó.
export function expectedDaysForSlot(from, to, slot) {
  return datesUpToToday(from, to).filter((d) => slotTimesFor(d).includes(slot) && !isSlotInFuture(d, slot)).length;
}
