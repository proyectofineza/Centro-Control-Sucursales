import { useEffect, useState } from 'react';
import { useData, useToast } from '../lib/store';
import GastosSucursal from './Gastos';
import { fmtDate, fmtMin, gs, hora, minutosDe, nombreTarea } from '../lib/util';

const TXT = { curso: 'Cuadrilla trabajando', pend: 'Pendientes', hecha: 'Terminada hoy', libre: 'Sin tareas' };

function Fotos({ tarea }) {
  const { fotosDe } = useData();
  const [urls, setUrls] = useState(null);
  if (!tarea.fotos) return <span className="tag">0 fotos</span>;
  if (!urls) return <button className="btn" onClick={async () => setUrls(await fotosDe(tarea.id))}>Ver {tarea.fotos} foto(s)</button>;
  return <div className="thumbs">{urls.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="Foto de la tarea" /></a>)}</div>;
}

export default function Drawer({ sucId, tab0 = 'inv', onClose, onNueva, onEditar, onRelevar }) {
  const { sucById, tareas, gastos, tipos, catById, crewById, puede, veGastos, estadoSucursal, guardar, historialDe } = useData();
  const toast = useToast();
  const [tab, setTab] = useState(tab0);
  const [hist, setHist] = useState(null);
  const s = sucById.get(sucId);
  const puedePlanificar = puede('planificar');
  const esAdmin = puede('parametros');

  useEffect(() => { setTab(tab0); setHist(null); }, [sucId, tab0]);
  useEffect(() => { if (tab === 'his' && !hist && s) historialDe(s.id).then(setHist).catch(() => setHist([])); }, [tab, hist, s, historialDe]);
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  if (!s) return null;

  const st = estadoSucursal(s.id);
  const inv = s.inventario;
  const abiertas = tareas.filter((t) => t.sucursal_id === s.id && t.estado !== 'hecha').sort((a, b) => (a.fecha || '9').localeCompare(b.fecha || '9'));

  const costo = veGastos ? gastos.filter((g) => g.sucursal_id === s.id && g.estado !== 'comprado').reduce((a, g) => a + (Number(g.monto) || 0), 0) : 0;
  const guardarInv = async (clave, valor) => {
    const nuevo = { ...(inv || {}), [clave]: Math.max(0, parseInt(valor, 10) || 0) };
    await guardar('mnt_sucursales', s.id, { inventario: nuevo, inventario_relevado_en: new Date().toISOString() });
  };
  const programarRelevamiento = async () => {
    const rele = [...catById.values()].find((c) => c.activo && /relevar/i.test(c.nombre));
    if (!rele) { toast('Crea la tarea «Relevar inventario» en el catálogo.'); return; }
    onNueva(s.id, rele.id);
  };

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={'Ficha de ' + s.nombre}>
        <header>
          <h2>{s.nombre}<button className="xbtn" onClick={onClose} aria-label="Cerrar">×</button></h2>
          <div className="tags">
            <span className="tag">{s.unidad_negocio}</span>
            <span className="tag">{s.dias_operacion >= 7 ? 'Opera lunes a lunes' : s.dias_operacion === 6 ? 'Opera lunes a sábado' : 'Opera lunes a viernes'}</span>
            <span className={'pill ' + st.k}>{TXT[st.k]}{st.k === 'pend' ? ': ' + st.n : ''}</span>
            <span className={'tag'}>{s.trabajos_relevados_en ? 'Trabajos relevados el ' + new Date(s.trabajos_relevados_en).toLocaleDateString('es-PY') : 'Trabajos sin relevar'}</span>
            {costo > 0 && <span className="tag">Por pagar {gs(costo)}</span>}
          </div>
          {s.direccion && <div className="sub" style={{ marginTop: 6 }}>{s.direccion}</div>}
        </header>
        <div className="tabs">
          {[['inv', 'Inventario'], ['tar', 'Tareas'], ...(veGastos ? [['gas', 'Gastos']] : []), ['his', 'Historial']].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} aria-current={tab === k ? 'page' : undefined}>{l}</button>
          ))}
        </div>
        <div className="body">
          {tab === 'inv' && (
            <>
              {!inv && (
                <div className="note">Inventario sin relevar. Los técnicos cargan las cantidades en terreno con la tarea «Relevar inventario».
                  {puedePlanificar && <div><button className="btn" style={{ marginTop: 8 }} onClick={programarRelevamiento}>Programar relevamiento</button></div>}
                </div>
              )}
              <div className="invgrid">
                {tipos.map((a) => {
                  const v = inv ? (inv[a.clave] ?? 0) : null;
                  return (
                    <div className="inv" key={a.id}>
                      <span className="il">{a.etiqueta}</span>
                      {esAdmin
                        ? <input type="number" min="0" defaultValue={v ?? ''} placeholder="—" key={s.id + a.clave + String(v)} aria-label={a.etiqueta}
                            onBlur={(e) => { if (e.target.value !== '' && String(v) !== e.target.value) guardarInv(a.clave, e.target.value); }} />
                        : <span className="iv">{v === null ? '—' : v}</span>}
                    </div>
                  );
                })}
              </div>
              {s.inventario_relevado_en && <p className="hint">Último relevamiento: {new Date(s.inventario_relevado_en).toLocaleDateString('es-PY')}.</p>}
              {esAdmin && <p className="hint">Solo el administrador corrige cantidades a mano.</p>}
            </>
          )}
          {tab === 'tar' && (
            <>
              {puedePlanificar && <div className="inl" style={{ marginTop: 0, marginBottom: 10 }}>
                <button className="btn primary" onClick={() => onNueva(s.id)}>+ Programar tarea</button>
                {onRelevar && <button className="btn" onClick={() => onRelevar(s.id)}>Relevar trabajos</button>}
              </div>}
              {abiertas.length === 0 && <p className="hint">No hay tareas pendientes en esta sucursal.</p>}
              {abiertas.map((t) => {
                const c = catById.get(t.catalogo_id), cu = crewById.get(t.cuadrilla_id);
                return (
                  <div key={t.id} className={'row' + (puedePlanificar ? ' click' : '')} onClick={() => puedePlanificar && onEditar(t)}>
                    <div><b>{nombreTarea(t, c)}</b>
                      <div className="sub">{t.fecha ? fmtDate(t.fecha) + ' · ' + (cu ? cu.nombre : 'sin cuadrilla') : 'Sin asignar'} · {fmtMin(minutosDe(t, c))}</div></div>
                    <span className={'pill ' + (t.estado === 'en_curso' ? 'curso' : 'pend')}>{t.estado === 'en_curso' ? 'En curso' : 'Pendiente'}</span>
                  </div>
                );
              })}
            </>
          )}
          {tab === 'gas' && veGastos && <GastosSucursal sucId={s.id} />}
          {tab === 'his' && (
            <>
              {!hist && <p className="hint">Cargando…</p>}
              {hist && hist.length === 0 && <p className="hint">Todavía no hay trabajos terminados en esta sucursal.</p>}
              {hist && hist.map((t) => {
                const c = catById.get(t.catalogo_id), cu = crewById.get(t.cuadrilla_id);
                return (
                  <div key={t.id} className="row"><div><b>{nombreTarea(t, c)}</b>
                    <div className="sub">{t.fecha ? fmtDate(t.fecha) : ''} {hora(t.terminada_en)} · {cu ? cu.nombre : ''}</div>
                    <div style={{ marginTop: 6 }}><Fotos tarea={{ id: t.id, fotos: t.mnt_fotos && t.mnt_fotos[0] ? t.mnt_fotos[0].count : 0 }} /></div></div></div>
                );
              })}
            </>
          )}
        </div>
      </aside>
    </>
  );
}
