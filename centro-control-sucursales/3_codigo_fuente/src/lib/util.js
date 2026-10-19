export const pad = (n) => String(n).padStart(2, '0');
export const isoLocal = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
export const hoy = () => isoLocal(new Date());
export const parse = (iso) => new Date(iso + 'T12:00:00');
export const addDays = (iso, n) => { const d = parse(iso); d.setDate(d.getDate() + n); return isoLocal(d); };
export const dow = (iso) => (parse(iso).getDay() + 6) % 7; // 0 = lunes
export const lunesDe = (iso) => addDays(iso, -dow(iso));
export const DN = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const DNL = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
export const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const MESL = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const fmtDate = (iso) => DN[dow(iso)] + ' ' + Number(iso.slice(8)) + ' ' + MES[Number(iso.slice(5, 7)) - 1];
export const fmtDateLong = (iso) => DNL[dow(iso)] + ' ' + Number(iso.slice(8)) + ' de ' + MESL[Number(iso.slice(5, 7)) - 1];
export const fmtMin = (m) => {
  m = Math.round(m);
  const h = Math.floor(m / 60), r = m % 60;
  return h ? (r ? h + ' h ' + r + ' min' : h + ' h') : r + ' min';
};
export const hora = (ts) => (ts ? new Date(ts).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit', hour12: false }) : '');
export const fechaDeTs = (ts) => (ts ? isoLocal(new Date(ts)) : null);
export const ESPS = ['Electricidad', 'Plomería', 'Albañilería', 'TI'];
export const ROLES = { admin: 'Administrador', supervisor: 'Supervisor', director: 'Director', tecnico: 'Técnico' };
export const UNIDADES = ['unidad', 'sucursal', 'visita'];

export const minutosDe = (t, cat) => (cat ? cat.minutos * (cat.unidad_medida === 'unidad' ? t.cantidad : 1) : 0);
export const nombreTarea = (t, cat) => (cat ? cat.nombre + (cat.unidad_medida === 'unidad' ? ' · ' + t.cantidad + ' u.' : '') : 'Tarea');

export function avisos(t, { crew, cat, suc }) {
  const w = [];
  if (crew && cat && !crew.especialidades.includes(cat.especialidad)) w.push(crew.nombre + ' hoy no hace ' + cat.especialidad.toLowerCase() + '.');
  if (t.fecha && suc && suc.dias_operacion <= 5 && dow(t.fecha) >= 5) w.push(suc.nombre + ' no opera sábados ni domingos.');
  return w;
}

export function parseCoords(txt) {
  const m = String(txt || '').replace(/;/g, ',').match(/(-?\d+(?:[.,]\d+)?)\s*[, ]\s*(-?\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  const lat = parseFloat(m[1].replace(',', '.')), lng = parseFloat(m[2].replace(',', '.'));
  if (isNaN(lat) || isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

export function parseCSV(text) {
  const t = text.replace(/^﻿/, '').replace(/\r/g, '');
  const first = t.split('\n')[0] || '';
  const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : (first.includes('\t') ? '\t' : ',');
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"' && t[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export async function redimensionar(file, max = 1280) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.8));
  } finally { URL.revokeObjectURL(url); }
}

// Integrantes de una cuadrilla: usuarios vinculados (padrón) + nombres antiguos escritos a mano que no coinciden con ningún usuario
export function miembrosDe(c, perfiles) {
  const usuarios = (perfiles || []).filter((p) => p.activo && p.cuadrilla_id === c.id);
  const norm = (x) => String(x || '').trim().toLowerCase();
  const sueltos = (c.integrantes || []).filter((n) => {
    const k = norm(n); if (!k) return false;
    return !(perfiles || []).some((p) => p.activo && (norm(p.nombre) === k || norm(p.nombre).startsWith(k + ' ')));
  });
  return { usuarios, sueltos, nombres: [...usuarios.map((u) => u.nombre), ...sueltos] };
}

// Guaraníes: sin decimales y con punto de miles
export const gs = (n) => 'Gs. ' + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
// Lee números escritos a la paraguaya: 12.500 o 2,5
export function numEs(v) {
  const t = String(v == null ? '' : v).trim().replace(/\s/g, '');
  if (!t) return NaN;
  if (t.includes(',')) return Number(t.replace(/\./g, '').replace(',', '.'));
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ''));
  return Number(t);
}
export function kmEntre(la1, ln1, la2, ln2) {
  const r = Math.PI / 180, dLa = (la2 - la1) * r, dLn = (ln2 - ln1) * r;
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dLn / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}
export const CATEG = { material: 'Material', mano_obra: 'Mano de obra', transporte: 'Transporte', otro: 'Otro' };
export const ESTGAS = { cotizado: 'Cotizado', aprobado: 'Aprobado', comprado: 'Comprado' };
