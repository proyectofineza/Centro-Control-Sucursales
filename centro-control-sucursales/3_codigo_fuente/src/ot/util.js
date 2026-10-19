import { pad } from '../lib/util';

export const ESTADOS = { pendiente: 'Pendiente', autorizada: 'Autorizada', en_ruta: 'En ruta', finalizada: 'Finalizada', cancelada: 'Cancelada' };
export const ABIERTAS = ['pendiente', 'autorizada', 'en_ruta'];
// clase de .pill de mantenimiento que corresponde a cada estado
export const PILL = { pendiente: 'pend', autorizada: 'aut', en_ruta: 'curso', finalizada: 'hecha', cancelada: 'libre' };
export const MOTIVOS = ['Entrega de mercadería', 'Retiro de equipos', 'Traslado de personal', 'Mantenimiento en sitio', 'Relevamiento comercial', 'Distribución'];
export const EVENTOS = { creada: 'OT creada', autorizada: 'Autorizada', salida: 'Salida', llegada: 'Llegada a destino', cierre: 'Cierre', cancelada: 'Cancelada' };
export const MEDIOS = { app: 'App', qr: 'QR en garita', manual: 'Registro manual', gps: 'GPS' };

export const hhmm = (ts) => { if (!ts) return '—'; const d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
export const ddmm = (iso) => { if (!iso) return '—'; const [, m, d] = String(iso).slice(0, 10).split('-'); return d + '/' + m; };
export const ddmmhhmm = (ts) => { if (!ts) return '—'; const d = new Date(ts); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
export const minDesde = (ts, ahora = Date.now()) => (ts ? Math.floor((ahora - new Date(ts).getTime()) / 60000) : 0);
export const coord = (lat, lng) => (lat == null || lng == null ? '—' : Number(lat).toFixed(5) + ', ' + Number(lng).toFixed(5));

/** Siguiente paso de la OT, en palabras, para la tarjeta del chofer. */
export function siguientePaso(o) {
  if (o.estado === 'pendiente') return 'Acepta la OT para habilitar la salida';
  if (o.estado === 'autorizada') return o.sale_de_base ? 'Muestra el QR en la garita para salir' : 'Inicia el viaje con el GPS';
  if (o.estado === 'en_ruta') return o.cierra_dia ? 'Al llegar a la base, muestra el QR en la garita' : 'Marca la llegada con el GPS para cerrar';
  return '';
}

/** Posición actual del dispositivo, o un Error con mensaje legible. */
export function miPosicion({ timeout = 15000 } = {}) {
  return new Promise((res, rej) => {
    if (!('geolocation' in navigator)) { rej(new Error('Este dispositivo no tiene GPS disponible.')); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude, precision: Math.round(p.coords.accuracy) }),
      (e) => rej(new Error({
        1: 'Permiso de ubicación denegado. Habilítalo en el navegador para continuar.',
        2: 'No se pudo obtener la ubicación. Prueba al aire libre.',
        3: 'El GPS tardó demasiado en responder. Intenta de nuevo.'
      }[e.code] || 'No se pudo obtener la ubicación.')),
      { enableHighAccuracy: true, timeout, maximumAge: 10000 }
    );
  });
}

/** Distancia en metros (igual que en la base de datos). */
export function metros(a, b) {
  const R = 6371000, r = (d) => (d * Math.PI) / 180;
  const s = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)));
}

/** Choferes: empleados activos cuyo rol tiene el permiso de manejar. */
export function choferesDe(perfiles, roles) {
  const cl = new Set(roles.filter((r) => r.p_ot_chofer).map((r) => r.clave));
  return perfiles.filter((p) => p.activo && cl.has(p.rol));
}

// ---------- Excel (SpreadsheetML 2003: Excel y Google Sheets lo abren con varias hojas) ----------
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function celda(v) {
  if (v === null || v === undefined || v === '') return '<Cell/>';
  const n = typeof v === 'number' && Number.isFinite(v);
  return '<Cell ss:StyleID="' + (n ? 'num' : 'b') + '"><Data ss:Type="' + (n ? 'Number' : 'String') + '">' + esc(v) + '</Data></Cell>';
}
function hoja(h) {
  const cols = h.columnas.map((c) => '<Column ss:Width="' + (c.ancho || 110) + '"/>').join('');
  const cab = '<Row>' + h.columnas.map((c) => '<Cell ss:StyleID="h"><Data ss:Type="String">' + esc(c.titulo) + '</Data></Cell>').join('') + '</Row>';
  const filas = h.filas.map((f) => '<Row>' + h.columnas.map((c) => celda(f[c.clave])).join('') + '</Row>').join('');
  return '<Worksheet ss:Name="' + esc(h.nombre).slice(0, 31) + '"><Table>' + cols + cab + filas + '</Table></Worksheet>';
}
/** hojas: [{ nombre, columnas: [{ clave, titulo, ancho? }], filas: [] }] */
export function descargarExcel(archivo, hojas) {
  const xml = '<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>'
    + '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles>'
    + '<Style ss:ID="Default" ss:Name="Normal"><Font ss:FontName="Calibri" ss:Size="11"/></Style>'
    + '<Style ss:ID="h"><Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#0E5C78" ss:Pattern="Solid"/></Style>'
    + '<Style ss:ID="b"/><Style ss:ID="num"><Alignment ss:Horizontal="Right"/></Style></Styles>'
    + hojas.map(hoja).join('') + '</Workbook>';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([xml], { type: 'application/vnd.ms-excel' }));
  a.download = archivo;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
