import { useMemo, useState } from 'react';
import { useData, useToast } from '../lib/store';
import { addDays, avisos, fmtDate, fmtMin, hoy, lunesDe, minutosDe } from '../lib/util';

export default function TaskModal({ tarea, sucursalId, catalogoId, semana, onClose }) {
  const { sucursales, cuadrillas, catalogo, tareas, sucById, crewById, catById, jornada, guardarTarea, eliminarTarea } = useData();
  const toast = useToast();
  const activos = catalogo.filter((c) => c.activo || (tarea && c.id === tarea.catalogo_id));
  const [f, setF] = useState(() => ({
    sucursal_id: tarea ? tarea.sucursal_id : (sucursalId || (sucursales[0] && sucursales[0].id) || ''),
    catalogo_id: tarea ? tarea.catalogo_id : (catalogoId || (activos[0] && activos[0].id) || ''),
    cantidad: tarea ? tarea.cantidad : 1,
    cuadrilla_id: tarea ? tarea.cuadrilla_id || '' : '',
    fecha: tarea ? tarea.fecha || '' : '',
    estado: tarea ? tarea.estado : 'pendiente',
    nota: tarea ? tarea.nota || '' : ''
  }));
  const [guardando, setGuardando] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const cat = catById.get(f.catalogo_id);
  const porUnidad = cat && cat.unidad_medida === 'unidad';
  const dias = useMemo(() => {
    const l = semana || lunesDe(hoy());
    const base = Array.from({ length: 7 }, (_, i) => addDays(l, i));
    if (f.fecha && !base.includes(f.fecha)) base.unshift(f.fecha);
    if (!base.includes(hoy())) base.unshift(hoy());
    return Array.from(new Set(base)).sort();
  }, [semana, f.fecha]);

  const valores = () => {
    let cuad = f.cuadrilla_id || null, fecha = f.fecha || null;
    if (!cuad || !fecha) { cuad = null; fecha = null; }
    return { sucursal_id: f.sucursal_id, catalogo_id: f.catalogo_id, cantidad: porUnidad ? Math.max(1, parseInt(f.cantidad, 10) || 1) : 1, cuadrilla_id: cuad, fecha, estado: f.estado, nota: f.nota.trim() || null };
  };
  const v = valores();
  const w = avisos(v, { crew: crewById.get(v.cuadrilla_id), cat, suc: sucById.get(v.sucursal_id) });
  if (v.cuadrilla_id && v.fecha) {
    const m = tareas.filter((t) => t.cuadrilla_id === v.cuadrilla_id && t.fecha === v.fecha && (!tarea || t.id !== tarea.id))
      .reduce((a, t) => a + minutosDe(t, catById.get(t.catalogo_id)), 0) + minutosDe(v, cat);
    if (m > jornada) w.push('Con esta tarea la cuadrilla pasa de ' + fmtMin(jornada) + ' ese día (' + fmtMin(m) + ').');
  }

  const guardar = async () => {
    if (!f.sucursal_id || !f.catalogo_id) { toast('Elige la sucursal y la tarea.'); return; }
    const o = valores();
    if (o.estado !== 'pendiente' && !o.cuadrilla_id) { toast('Para iniciar o cerrar una tarea, asígnala a una cuadrilla y un día.'); return; }
    if (tarea) {
      if (o.estado === 'en_curso' && tarea.estado !== 'en_curso') o.iniciada_en = new Date().toISOString();
      if (o.estado === 'hecha' && tarea.estado !== 'hecha') { o.terminada_en = new Date().toISOString(); if (!tarea.iniciada_en) o.iniciada_en = o.terminada_en; }
      if (o.estado === 'pendiente') { o.iniciada_en = null; o.terminada_en = null; }
    } else {
      if (o.estado === 'en_curso') o.iniciada_en = new Date().toISOString();
      if (o.estado === 'hecha') { o.iniciada_en = o.terminada_en = new Date().toISOString(); }
    }
    setGuardando(true);
    const ok = await guardarTarea(tarea ? tarea.id : null, o);
    setGuardando(false);
    if (ok) { toast(w.length ? 'Guardado con aviso: ' + w[0] : 'Tarea guardada'); onClose(); }
  };
  const eliminar = async () => { if (await eliminarTarea(tarea.id)) { toast('Tarea eliminada'); onClose(); } };

  return (
    <>
      <div className="scrim m" onClick={onClose} />
      <form className="modalbox" role="dialog" aria-label="Tarea" onSubmit={(e) => e.preventDefault()}>
        <h2>{tarea ? 'Editar tarea' : 'Programar tarea'}</h2>
        {w.length > 0 && <div className="warnbox">{w.map((x, i) => <div key={i}>{x}</div>)}</div>}
        <div className="fld"><label htmlFor="f-suc">Sucursal</label>
          <select id="f-suc" value={f.sucursal_id} onChange={(e) => set('sucursal_id', e.target.value)}>
            {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre} · {s.unidad_negocio}</option>)}
          </select></div>
        <div className="two">
          <div className="fld"><label htmlFor="f-cat">Tarea</label>
            <select id="f-cat" value={f.catalogo_id} onChange={(e) => set('catalogo_id', e.target.value)}>
              {activos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select></div>
          <div className="fld"><label htmlFor="f-qty">Cantidad</label>
            <input id="f-qty" type="number" min="1" value={porUnidad ? f.cantidad : 1} disabled={!porUnidad} onChange={(e) => set('cantidad', e.target.value)} /></div>
        </div>
        <div className="two">
          <div className="fld"><label htmlFor="f-cua">Cuadrilla</label>
            <select id="f-cua" value={f.cuadrilla_id} onChange={(e) => set('cuadrilla_id', e.target.value)}>
              <option value="">Sin asignar</option>
              {cuadrillas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select></div>
          <div className="fld"><label htmlFor="f-fecha">Día</label>
            <select id="f-fecha" value={f.fecha} onChange={(e) => set('fecha', e.target.value)}>
              <option value="">Sin asignar</option>
              {dias.map((d) => <option key={d} value={d}>{fmtDate(d)}</option>)}
            </select></div>
        </div>
        <div className="fld"><label htmlFor="f-est">Estado</label>
          <select id="f-est" value={f.estado} onChange={(e) => set('estado', e.target.value)}>
            <option value="pendiente">Pendiente</option><option value="en_curso">En curso</option><option value="hecha">Hecha</option>
          </select></div>
        <div className="fld"><label htmlFor="f-nota">Nota</label>
          <textarea id="f-nota" rows="2" value={f.nota} placeholder="Indicaciones para la cuadrilla" onChange={(e) => set('nota', e.target.value)} /></div>
        <div className="acts">
          {tarea && <button type="button" className="btn danger" style={{ marginRight: 'auto' }} onClick={eliminar}>Eliminar</button>}
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn primary" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </>
  );
}
