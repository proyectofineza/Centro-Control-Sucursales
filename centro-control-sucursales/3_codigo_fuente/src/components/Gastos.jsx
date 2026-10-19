import { useMemo, useState } from 'react';
import { useData, useToast } from '../lib/store';
import { CATEG, ESTGAS, fmtDate, gs, hoy, nombreTarea, numEs } from '../lib/util';

// Cotizaciones y gastos de una sucursal. Se usa en la ficha y en el relevamiento.
export default function GastosSucursal({ sucId }) {
  const { gastos, tareas, catById, puede, guardar, borrar } = useData();
  const toast = useToast();
  const editable = puede('gastos');
  const vacio = { concepto: '', cantidad: '1', precio: '', proveedor: '', categoria: 'material', tarea_id: '', estado: 'cotizado' };
  const [f, setF] = useState(vacio);
  const lista = useMemo(() => gastos.filter((g) => g.sucursal_id === sucId), [gastos, sucId]);
  const abiertas = tareas.filter((t) => t.sucursal_id === sucId && t.estado !== 'hecha');
  const tot = { cotizado: 0, aprobado: 0, comprado: 0 };
  lista.forEach((g) => { tot[g.estado] += Number(g.monto) || 0; });
  const total = tot.cotizado + tot.aprobado + tot.comprado;
  const tareaNombre = (id) => { const t = tareas.find((x) => x.id === id); return t ? nombreTarea(t, catById.get(t.catalogo_id)) : ''; };

  const agregar = async () => {
    const concepto = f.concepto.trim();
    const cantidad = numEs(f.cantidad), precio = numEs(f.precio);
    if (!concepto) { toast('Escribe qué se necesita (por ejemplo «Cable 2,5 mm»).'); return; }
    if (!(cantidad > 0)) { toast('La cantidad debe ser mayor que cero.'); return; }
    if (!(precio >= 0)) { toast('Escribe el precio unitario en guaraníes.'); return; }
    const ok = await guardar('mnt_gastos', null, {
      sucursal_id: sucId, concepto, categoria: f.categoria, cantidad, precio_unit: precio, estado: f.estado,
      proveedor: f.proveedor.trim() || null, tarea_id: f.tarea_id || null
    }, 'Agregado');
    if (ok) setF({ ...vacio, categoria: f.categoria, proveedor: f.proveedor, estado: f.estado });
  };
  const cambiarEstado = (g, estado) => guardar('mnt_gastos', g.id, estado === 'comprado' ? { estado, fecha: hoy() } : { estado });
  const previo = numEs(f.cantidad) * numEs(f.precio);

  return (
    <>
      <div className="kpis two-up" style={{ marginBottom: 10 }}>
        <div className="kpi"><div className="n sm">{gs(total)}</div><div className="l">Total registrado</div></div>
        <div className="kpi"><div className="n sm">{gs(tot.comprado)}</div><div className="l">Ya comprado</div></div>
      </div>
      <p className="hint" style={{ marginTop: 0 }}>Cotizado {gs(tot.cotizado)} · Aprobado {gs(tot.aprobado)} · Comprado {gs(tot.comprado)}</p>
      {lista.length === 0 && <p className="hint">Todavía no hay materiales ni gastos en esta sucursal.</p>}
      {lista.map((g) => (
        <div className="row" key={g.id}>
          <div style={{ minWidth: 0 }}>
            <b>{g.concepto}</b>
            <div className="sub">{Number(g.cantidad)} × {gs(g.precio_unit)} · {CATEG[g.categoria]}{g.proveedor ? ' · ' + g.proveedor : ''} {g.fecha ? ' · ' + fmtDate(g.fecha) : ''}</div>
            {g.tarea_id && <div className="sub">Para: {tareaNombre(g.tarea_id) || 'trabajo'}</div>}
          </div>
          <div style={{ textAlign: 'right', flex: 'none' }}>
            <b className="mono">{gs(g.monto)}</b>
            {editable ? (
              <div className="inl" style={{ marginTop: 4, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                <select value={g.estado} onChange={(e) => cambiarEstado(g, e.target.value)} aria-label="Estado" style={{ flex: '0 1 112px' }}>
                  {Object.entries(ESTGAS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <button className="btn danger" style={{ flex: 'none' }} aria-label={'Quitar ' + g.concepto} onClick={() => { if (window.confirm('¿Quitar «' + g.concepto + '»?')) borrar('mnt_gastos', g.id, 'Quitado'); }}>×</button>
              </div>
            ) : <div className={'pill ' + (g.estado === 'comprado' ? 'hecha' : 'pend')} style={{ marginTop: 4 }}>{ESTGAS[g.estado]}</div>}
          </div>
        </div>
      ))}
      {editable && (
        <div className="card" style={{ background: 'var(--bg)', marginTop: 12 }}>
          <h3 style={{ color: 'var(--ink)' }}>Agregar material o gasto</h3>
          <div className="fld"><label htmlFor="g-c">Qué se necesita</label><input id="g-c" value={f.concepto} placeholder="Cable 2,5 mm, tapa ciega, ventilador…" onChange={(e) => setF({ ...f, concepto: e.target.value })} /></div>
          <div className="two">
            <div className="fld"><label htmlFor="g-q">Cantidad</label><input id="g-q" inputMode="decimal" value={f.cantidad} onChange={(e) => setF({ ...f, cantidad: e.target.value })} /></div>
            <div className="fld"><label htmlFor="g-p">Precio unitario (Gs.)</label><input id="g-p" inputMode="numeric" value={f.precio} placeholder="12.500" onChange={(e) => setF({ ...f, precio: e.target.value })} /></div>
          </div>
          {previo > 0 && <p className="hint" style={{ marginTop: -6 }}>Total: <b>{gs(previo)}</b></p>}
          <div className="two">
            <div className="fld"><label htmlFor="g-v">Proveedor (opcional)</label><input id="g-v" value={f.proveedor} onChange={(e) => setF({ ...f, proveedor: e.target.value })} /></div>
            <div className="fld"><label htmlFor="g-k">Tipo</label>
              <select id="g-k" value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })}>{Object.entries(CATEG).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          </div>
          <div className="two">
            <div className="fld"><label htmlFor="g-t">Para el trabajo</label>
              <select id="g-t" value={f.tarea_id} onChange={(e) => setF({ ...f, tarea_id: e.target.value })}>
                <option value="">General de la sucursal</option>
                {abiertas.map((t) => <option key={t.id} value={t.id}>{nombreTarea(t, catById.get(t.catalogo_id))}</option>)}
              </select></div>
            <div className="fld"><label htmlFor="g-e">Estado</label>
              <select id="g-e" value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value })}>{Object.entries(ESTGAS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          </div>
          <button className="btn primary big" onClick={agregar}>Agregar</button>
          <p className="hint" style={{ marginBottom: 0 }}>Cotizado es el precio que te pasaron. Cuando se aprueba la compra pásalo a Aprobado, y a Comprado cuando se pagó. «Para el trabajo» solo lista tareas ya guardadas en el relevamiento.</p>
        </div>
      )}
    </>
  );
}
