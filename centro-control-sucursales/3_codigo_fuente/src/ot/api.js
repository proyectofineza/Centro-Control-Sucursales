import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

// Órdenes de trabajo (OT) de los móviles: lecturas por vistas y toda escritura por funciones ot_*.

function fallo(error) {
  if (!error) return;
  let m = error.message || 'Ocurrió un error.';
  if (error.code === '23505') m = 'Ya existe un registro con ese nombre o código.';
  else if (error.code === '23503') m = 'Está en uso y no se puede borrar.';
  else if (error.code === '42501' && /permission denied|row-level security/i.test(m)) m = 'Tu rol no tiene permiso para esta acción.';
  throw new Error(m);
}
async function rpc(nombre, args) { const { data, error } = await supabase.rpc(nombre, args); fallo(error); return data; }
async function q(builder) { const { data, error } = await builder; fallo(error); return data; }

// ---------- Órdenes ----------
export function listarOrdenes({ estados, desde, hasta, choferId, deptoId, limite = 300 } = {}) {
  let b = supabase.from('ot_vista').select('*');
  if (estados && estados.length) b = b.in('estado', estados);
  if (desde) b = b.gte('fecha', desde);
  if (hasta) b = b.lte('fecha', hasta);
  if (choferId) b = b.eq('chofer_id', choferId);
  if (deptoId) b = b.eq('departamento_id', deptoId);
  return q(b.order('fecha', { ascending: false }).order('creada_en', { ascending: false }).limit(limite));
}
export async function verOrden(id) {
  const [o, eventos] = await Promise.all([
    q(supabase.from('ot_vista').select('*').eq('id', id).maybeSingle()),
    q(supabase.from('ot_eventos_vista').select('*').eq('orden_id', id).order('creado_en').order('id'))
  ]);
  if (!o) throw new Error('Orden de trabajo no encontrada.');
  return { ...o, eventos };
}
export const crearOrden = (f) => rpc('ot_crear', {
  p_movil: f.movilId, p_motivo: f.motivo, p_fecha: f.fecha,
  p_origen: f.origenId || null, p_origen_suc: f.origenSuc || null,
  p_destino: f.destinoId || null, p_destino_suc: f.destinoSuc || null,
  p_dest_lat: f.destLat ?? null, p_dest_lng: f.destLng ?? null, p_dest_nombre: f.destNombre || null,
  p_descripcion: f.descripcion || '', p_eta: f.eta || 30,
  p_chofer: f.choferId || null, p_programada: f.programada || null
});
export const transicion = (id, accion, { lat = null, lng = null, motivo = null } = {}) =>
  rpc('ot_transicion', { p_orden: id, p_accion: accion, p_lat: lat, p_lng: lng, p_motivo: motivo });

// ---------- Garita ----------
export const garitaVer = (codigo) => rpc('ot_garita_ver', { p_codigo: codigo });
export const garitaRegistrar = (codigo, mov, { manual = false, nota = null } = {}) =>
  rpc('ot_garita_registrar', { p_codigo: codigo, p_movimiento: mov, p_manual: manual, p_nota: nota });
export const bitacora = (desde, hasta) => rpc('ot_bitacora', { p_desde: desde.toISOString(), p_hasta: hasta.toISOString() });

// ---------- Catálogos ----------
export const disponibilidad = (choferId, fecha) => rpc('ot_disponibilidad', { p_chofer: choferId || null, p_fecha: fecha || null });
export const listarUbicaciones = () =>
  q(supabase.from('ot_ubicaciones').select('*').eq('activa', true).eq('adhoc', false).is('sucursal_id', null)
    .order('es_base', { ascending: false }).order('nombre'));
export const guardarUbicacion = (id, v) =>
  q(id ? supabase.from('ot_ubicaciones').update(v).eq('id', id) : supabase.from('ot_ubicaciones').insert(v));
export const listarDeptos = ({ archivados = false } = {}) => {
  let b = supabase.from('ot_departamentos').select('*');
  if (!archivados) b = b.is('archivado_en', null);
  return q(b.order('nombre'));
};
export const guardarDepto = (id, v) =>
  q(id ? supabase.from('ot_departamentos').update(v).eq('id', id) : supabase.from('ot_departamentos').insert(v));
export const guardarMovil = (id, v) =>
  q(id ? supabase.from('ot_moviles').update(v).eq('id', id) : supabase.from('ot_moviles').insert(v));
export const reporte = (desde, hasta, deptoId) => rpc('ot_reporte', { p_desde: desde, p_hasta: hasta, p_depto: deptoId || null });
export const auditoria = (limite = 200) =>
  q(supabase.from('ot_auditoria').select('*').order('creado_en', { ascending: false }).limit(limite));

// ---------- Hooks ----------
/** Carga asíncrona con estado y `recargar`. */
export function useCarga(fn, deps) {
  const [st, setSt] = useState({ data: null, cargando: true, error: null });
  const ref = useRef(fn);
  ref.current = fn;
  const recargar = useCallback(async () => {
    try { const data = await ref.current(); setSt({ data, cargando: false, error: null }); return data; }
    catch (error) { setSt((s) => ({ ...s, cargando: false, error })); return null; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { setSt((s) => ({ ...s, cargando: true })); recargar(); }, [recargar]);
  return { ...st, recargar };
}

/** Llama a `fn` cuando cambia cualquier OT visible (tiempo real), agrupando ráfagas. */
export function useOTVivo(fn) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    let t;
    const ch = supabase.channel('ot-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ot_ordenes' }, () => { clearTimeout(t); t = setTimeout(() => ref.current(), 300); })
      .subscribe();
    return () => { clearTimeout(t); supabase.removeChannel(ch); };
  }, []);
}

/** Hora actual que se actualiza sola (para demoras y ETA). */
export function useAhora(ms = 30000) {
  const [n, setN] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setN(Date.now()), ms); return () => clearInterval(i); }, [ms]);
  return n;
}
