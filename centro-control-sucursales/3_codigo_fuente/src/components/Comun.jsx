import { useData } from '../lib/store';
import { fmtMin, hora, miembrosDe, minutosDe, nombreTarea } from '../lib/util';

export function Leyenda() {
  return (
    <div className="legend">
      <span><i className="dot" style={{ background: 'var(--surface)', border: '2px solid var(--ink)' }} />Sin tareas</span>
      <span><i className="dot" style={{ background: 'var(--hazard)' }} />Pendientes (número)</span>
      <span><i className="dot" style={{ background: 'var(--cA)' }} /><i className="dot" style={{ background: 'var(--cB)' }} /><i className="dot" style={{ background: 'var(--cTI)' }} />Cuadrilla trabajando (color de la cuadrilla)</span>
      <span><i className="dot" style={{ background: 'var(--ok)' }} />Terminada hoy</span>
    </div>
  );
}

export function CuadrillasAhora() {
  const { cuadrillas, crewAhora, sucById, catById, perfiles } = useData();
  if (!cuadrillas.length) return <p className="hint">Todavía no hay cuadrillas. El administrador las crea en Parámetros.</p>;
  return cuadrillas.map((c) => {
    const n = crewAhora(c);
    const t = n.t, s = t && sucById.get(t.sucursal_id), cat = t && catById.get(t.catalogo_id);
    return (
      <div className="crewrow" key={c.id}>
        <i className="dot" style={{ background: c.color }} />
        <div>
          <span className="sub">{c.nombre}{(() => { const n = miembrosDe(c, perfiles).nombres; return n.length ? ' · ' + n.join(', ') : ''; })()}</span>
          {n.k === 'curso' && <><b>{s ? s.nombre : ''}</b><span className="sub">{nombreTarea(t, cat)} · desde {hora(t.iniciada_en)}</span></>}
          {n.k === 'next' && <><b>En camino o por empezar</b><span className="sub">Siguiente: {s ? s.nombre : ''} · {nombreTarea(t, cat)}</span></>}
          {n.k === 'libre' && <><b>Sin tarea ahora</b><span className="sub">No tiene tareas pendientes hoy</span></>}
        </div>
      </div>
    );
  });
}

export function itemsMapa({ sucursales, estadoSucursal, crewById, tareas = [], perfiles = [] }) {
  const TXT = { curso: 'Cuadrilla trabajando', pend: 'Tareas pendientes', hecha: 'Terminada hoy', libre: 'Sin tareas' };
  return sucursales.filter((s) => s.activa && s.lat != null && s.lng != null).map((s) => {
    const st = estadoSucursal(s.id);
    const crew = st.k === 'curso' ? crewById.get(st.t.cuadrilla_id) : null;
    const color = st.k === 'curso' ? (crew ? crew.color : 'var(--curso)') : st.k === 'pend' ? 'var(--hazard)' : st.k === 'hecha' ? 'var(--ok)' : 'var(--surface)';
    let ids = [];
    if (st.k === 'curso') ids = [st.t.cuadrilla_id];
    else if (st.k === 'pend') ids = tareas.filter((t) => t.sucursal_id === s.id && t.estado === 'pendiente').map((t) => t.cuadrilla_id);
    const crews = [...new Set(ids)].map((id) => crewById.get(id)).filter(Boolean);
    const equipo = crews.map((c) => { const n = miembrosDe(c, perfiles).nombres; return c.nombre + (n.length ? ': ' + n.join(', ') : ''); });
    if ((st.k === 'curso' || st.k === 'pend') && !equipo.length) equipo.push('Sin cuadrilla asignada');
    return { id: s.id, lat: s.lat, lng: s.lng, titulo: s.nombre + ' · ' + TXT[st.k], equipo, clase: st.k, color, texto: st.k === 'pend' ? String(st.n) : '' };
  });
}

export function barras(items, max, vacio = 'Sin tareas terminadas en este período.') {
  if (!items.length || !max) return <p className="hint">{vacio}</p>;
  return items.map((i) => (
    <div className="hbar" key={i.l}>
      <span>{i.l}</span>
      <div className="t"><i style={{ width: (i.v / max) * 100 + '%', background: i.c }} /></div>
      <span className="v mono">{i.v}</span>
    </div>
  ));
}

export { fmtMin, minutosDe };
