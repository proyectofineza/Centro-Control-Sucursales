import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase';
import { addDays, hoy, redimensionar } from './util';

const DataCtx = createContext(null);
const ToastCtx = createContext(() => {});
export const useData = () => useContext(DataCtx);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [msg, setMsg] = useState('');
  const [on, setOn] = useState(false);
  const h = useRef();
  const toast = useCallback((m) => {
    setMsg(m); setOn(true);
    clearTimeout(h.current);
    h.current = setTimeout(() => setOn(false), 3600);
  }, []);
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div id="toast" className={on ? 'show' : ''} role="status" aria-live="polite">{msg}</div>
    </ToastCtx.Provider>
  );
}

function errTxt(e) {
  if (!e) return 'Ocurrió un error.';
  if (e.code === '23505') return 'Ya existe un registro con ese nombre.';
  if (e.code === '23503') return 'No se puede borrar: hay datos que dependen de esto.';
  if (e.code === '42501' || /row-level security/i.test(e.message || '')) return 'Tu rol no tiene permiso para esta acción.';
  return e.message || 'Ocurrió un error.';
}

async function fetchAll(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}
const one = async (p) => { const { data, error } = await p; if (error) throw error; return data; };

const TABLA_KEY = {
  mnt_sucursales: 'sucursales', mnt_cuadrillas: 'cuadrillas', mnt_catalogo: 'catalogo',
  mnt_tipos_activo: 'tipos', mnt_perfiles: 'perfiles', mnt_parametros: 'params', mnt_tareas: 'tareas', mnt_roles: 'roles', mnt_gastos: 'gastos'
};

const loaders = {
  roles: () => one(supabase.from('mnt_roles').select('*').order('sistema', { ascending: false }).order('nombre')),
  sucursales: () => fetchAll(() => supabase.from('mnt_sucursales').select('*').order('nombre')),
  cuadrillas: () => one(supabase.from('mnt_cuadrillas').select('*').order('orden').order('nombre')),
  catalogo: () => one(supabase.from('mnt_catalogo').select('*').order('nombre')),
  tipos: () => one(supabase.from('mnt_tipos_activo').select('*').order('orden').order('etiqueta')),
  perfiles: () => one(supabase.from('mnt_perfiles').select('*').order('nombre')),
  params: async () => {
    const rows = await one(supabase.from('mnt_parametros').select('*'));
    return Object.fromEntries(rows.map((r) => [r.clave, r.valor]));
  },
  gastos: () => fetchAll(() => supabase.from('mnt_gastos').select('*').order('creado_en', { ascending: false }).order('id')),
  // departamentos de OT; si todavía no se ejecutó el SQL de la versión 4, queda vacío
  deptos: async () => {
    const { data, error } = await supabase.from('ot_departamentos').select('*').is('archivado_en', null).order('nombre');
    return error ? [] : data;
  },
  tareas: async () => {
    const desde = addDays(hoy(), -45);
    const rows = await fetchAll(() =>
      supabase.from('mnt_tareas').select('*, mnt_fotos(count)')
        .or('fecha.gte.' + desde + ',fecha.is.null,estado.neq.hecha')
        .order('creada_en').order('id'));
    return rows.map((t) => ({ ...t, fotos: t.mnt_fotos && t.mnt_fotos[0] ? t.mnt_fotos[0].count : 0 }));
  }
};

export function DataProvider({ perfil, children }) {
  const toast = useToast();
  const [d, setD] = useState({ roles: [], sucursales: [], cuadrillas: [], catalogo: [], tipos: [], perfiles: [], params: {}, tareas: [], gastos: [], deptos: [], listo: false });
  const timers = useRef({});

  const refresh = useCallback(async (key) => {
    try { const v = await loaders[key](); setD((s) => ({ ...s, [key]: v })); }
    catch (e) { toast(errTxt(e)); }
  }, [toast]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const keys = Object.keys(loaders);
        const res = await Promise.all(keys.map((k) => loaders[k]()));
        if (!vivo) return;
        setD({ ...Object.fromEntries(keys.map((k, i) => [k, res[i]])), listo: true });
      } catch (e) { toast(errTxt(e)); setD((s) => ({ ...s, listo: true })); }
    })();
    return () => { vivo = false; };
  }, [toast]);

  // Tiempo real: el director ve los cambios de las cuadrillas sin recargar
  useEffect(() => {
    const later = (key) => { clearTimeout(timers.current[key]); timers.current[key] = setTimeout(() => refresh(key), 400); };
    const ch = supabase.channel('mnt-vivo')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mnt_tareas' }, () => later('tareas'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mnt_fotos' }, () => later('tareas'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mnt_sucursales' }, () => later('sucursales'))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refresh]);

  const sucById = useMemo(() => new Map(d.sucursales.map((x) => [x.id, x])), [d.sucursales]);
  const crewById = useMemo(() => new Map(d.cuadrillas.map((x) => [x.id, x])), [d.cuadrillas]);
  const catById = useMemo(() => new Map(d.catalogo.map((x) => [x.id, x])), [d.catalogo]);
  const rolActual = useMemo(() => d.roles.find((r) => r.clave === perfil.rol) || null, [d.roles, perfil.rol]);
  const puede = useCallback((p) => Boolean(rolActual && rolActual['p_' + p]), [rolActual]);
  const veGastos = puede('gastos') || puede('panel');
  const jornada = Number(d.params.jornada_minutos) || 480;
  const unidades = Array.isArray(d.params.unidades) ? d.params.unidades : ['Baratote Minorista', 'Baratote Mayorista', 'Fineglass', 'Fineboats'];

  const estadoSucursal = useCallback((id) => {
    const ts = d.tareas.filter((t) => t.sucursal_id === id);
    const cur = ts.find((t) => t.estado === 'en_curso');
    if (cur) return { k: 'curso', t: cur };
    const pend = ts.filter((t) => t.estado === 'pendiente');
    if (pend.length) return { k: 'pend', n: pend.length };
    if (ts.some((t) => t.estado === 'hecha' && t.fecha === hoy())) return { k: 'hecha' };
    return { k: 'libre' };
  }, [d.tareas]);

  const crewAhora = useCallback((c) => {
    const cur = d.tareas.find((t) => t.cuadrilla_id === c.id && t.estado === 'en_curso');
    if (cur) return { k: 'curso', t: cur };
    const nx = d.tareas.find((t) => t.cuadrilla_id === c.id && t.fecha === hoy() && t.estado === 'pendiente');
    return nx ? { k: 'next', t: nx } : { k: 'libre' };
  }, [d.tareas]);

  const patchLocal = (id, patch) => setD((s) => ({ ...s, tareas: s.tareas.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));

  const actions = {
    refresh,
    async guardarTarea(id, valores) {
      const q = id ? supabase.from('mnt_tareas').update(valores).eq('id', id) : supabase.from('mnt_tareas').insert(valores);
      const { error } = await q;
      if (error) { toast(errTxt(error)); return false; }
      await refresh('tareas'); return true;
    },
    async eliminarTarea(id) {
      const { error } = await supabase.from('mnt_tareas').delete().eq('id', id);
      if (error) { toast(errTxt(error)); return false; }
      await refresh('tareas'); return true;
    },
    async moverTarea(id, patch) {
      patchLocal(id, patch);
      const { error } = await supabase.from('mnt_tareas').update(patch).eq('id', id);
      if (error) { toast(errTxt(error)); refresh('tareas'); return false; }
      return true;
    },
    async iniciar(id) {
      const { error } = await supabase.rpc('mnt_iniciar_tarea', { p_id: id });
      if (error) { toast(errTxt(error)); return false; }
      await refresh('tareas'); return true;
    },
    async terminar(id, inventario) {
      const { error } = await supabase.rpc('mnt_terminar_tarea', { p_id: id, p_inventario: inventario || null });
      if (error) { toast(errTxt(error)); return false; }
      await Promise.all([refresh('tareas'), inventario ? refresh('sucursales') : null]); return true;
    },
    async subirFoto(tareaId, file) {
      try {
        const blob = await redimensionar(file);
        const path = tareaId + '/' + (crypto.randomUUID ? crypto.randomUUID() : Date.now()) + '.jpg';
        const up = await supabase.storage.from('mnt-fotos').upload(path, blob, { contentType: 'image/jpeg' });
        if (up.error) { toast(errTxt(up.error)); return null; }
        const ins = await supabase.from('mnt_fotos').insert({ tarea_id: tareaId, path });
        if (ins.error) { toast(errTxt(ins.error)); return null; }
        refresh('tareas');
        return URL.createObjectURL(blob);
      } catch (e) { toast('No se pudo subir la foto.'); return null; }
    },
    async guardar(tabla, id, valores, ok) {
      const q = id ? supabase.from(tabla).update(valores).eq('id', id) : supabase.from(tabla).insert(valores);
      const { error } = await q;
      if (error) { toast(errTxt(error)); return false; }
      await refresh(TABLA_KEY[tabla]); if (ok) toast(ok); return true;
    },
    async guardarVarios(tabla, filas, conflicto, ok) {
      const { error } = await supabase.from(tabla).upsert(filas, { onConflict: conflicto });
      if (error) { toast(errTxt(error)); return false; }
      await refresh(TABLA_KEY[tabla]); if (ok) toast(ok); return true;
    },
    async borrar(tabla, id, ok) {
      const { error } = await supabase.from(tabla).delete().eq('id', id);
      if (error) { toast(errTxt(error)); return false; }
      await refresh(TABLA_KEY[tabla]); if (ok) toast(ok); return true;
    },
    async guardarParam(clave, valor) {
      const { error } = await supabase.from('mnt_parametros').upsert({ clave, valor }, { onConflict: 'clave' });
      if (error) { toast(errTxt(error)); return false; }
      await refresh('params'); return true;
    },
    async crearUsuario(v) {
      const { error } = await supabase.rpc('mnt_crear_usuario', { p_email: v.email, p_password: v.password, p_nombre: v.nombre, p_rol: v.rol, p_cuadrilla: v.cuadrilla || null, p_departamento: v.departamento || null });
      if (error) { toast(errTxt(error)); return false; }
      await refresh('perfiles'); return true;
    },
    async cambiarClave(id, password) {
      const { error } = await supabase.rpc('mnt_cambiar_clave', { p_id: id, p_password: password });
      if (error) { toast(errTxt(error)); return false; }
      return true;
    },
    async eliminarUsuario(id) {
      const { error } = await supabase.rpc('mnt_eliminar_usuario', { p_id: id });
      if (error) { toast(errTxt(error)); return false; }
      await refresh('perfiles'); return true;
    },
    // Relevamiento de trabajos de una sucursal: deja las tareas pendientes (sin asignar) al día con lo marcado
    async guardarRelevamiento(sucId, lineas) {
      const abiertas = d.tareas.filter((t) => t.sucursal_id === sucId && t.estado === 'pendiente');
      const nuevas = [], upd = [], del = [];
      for (const l of lineas) {
        const ex = abiertas.find((t) => t.catalogo_id === l.catalogo_id);
        const cant = Math.max(0, Math.floor(Number(l.cantidad) || 0));
        const nota = (l.nota || '').trim() || null;
        if (cant > 0) {
          if (!ex) nuevas.push({ sucursal_id: sucId, catalogo_id: l.catalogo_id, cantidad: cant, nota });
          else if (ex.cantidad !== cant || (ex.nota || null) !== nota) upd.push({ id: ex.id, cantidad: cant, nota });
        } else if (ex) del.push(ex.id);
      }
      try {
        if (nuevas.length) { const r = await supabase.from('mnt_tareas').insert(nuevas); if (r.error) throw r.error; }
        for (const u of upd) { const r = await supabase.from('mnt_tareas').update({ cantidad: u.cantidad, nota: u.nota }).eq('id', u.id); if (r.error) throw r.error; }
        if (del.length) { const r = await supabase.from('mnt_tareas').delete().in('id', del); if (r.error) throw r.error; }
        const r = await supabase.rpc('mnt_relevar_sucursal', { p_id: sucId }); if (r.error) throw r.error;
      } catch (e) { toast(errTxt(e)); await refresh('tareas'); return null; }
      await Promise.all([refresh('tareas'), refresh('sucursales')]);
      return { nuevas: nuevas.length, actualizadas: upd.length, quitadas: del.length };
    },
    async fotosDe(tareaId) {
      const rows = await one(supabase.from('mnt_fotos').select('path').eq('tarea_id', tareaId));
      if (!rows.length) return [];
      const { data } = await supabase.storage.from('mnt-fotos').createSignedUrls(rows.map((r) => r.path), 3600);
      return (data || []).map((x) => x.signedUrl).filter(Boolean);
    },
    async historialDe(sucId) {
      return one(supabase.from('mnt_tareas').select('*, mnt_fotos(count)').eq('sucursal_id', sucId).eq('estado', 'hecha').order('terminada_en', { ascending: false }).limit(15));
    }
  };

  // el perfil al día (por ejemplo si el administrador le cambia el departamento o la cuadrilla)
  const yo = useMemo(() => ({ ...perfil, ...(d.perfiles.find((p) => p.id === perfil.id) || {}) }), [perfil, d.perfiles]);
  const value = { ...d, perfil: yo, rolActual, puede, veGastos, jornada, unidades, sucById, crewById, catById, estadoSucursal, crewAhora, ...actions };
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}
