import { useMemo, useState } from 'react';
import { useData } from '../lib/store';
import { addDays, hoy } from '../lib/util';
import { disponibilidad, listarOrdenes, listarUbicaciones, useAhora, useCarga, useOTVivo, verOrden } from './api';
import { ABIERTAS, hhmm, minDesde } from './util';
import MapaOT, { MapaRuta } from './MapaOT';
import OrdenForm from './OrdenForm';
import OrdenDetalle, { Cancelar, Estado, Trazabilidad } from './OrdenDetalle';

const FILTROS = [
  ['activas', 'Activas', (o) => ABIERTAS.includes(o.estado)],
  ['en_ruta', 'En ruta', (o) => o.estado === 'en_ruta'],
  ['finalizada', 'Finalizadas', (o) => o.estado === 'finalizada'],
  ['cancelada', 'Canceladas', (o) => o.estado === 'cancelada'],
  ['todas', 'Todas', () => true]
];

/** Panel en vivo de quien supervisa: movimiento de la gente, alertas, OT y flota. */
export default function PanelOT() {
  const { perfil, puede, deptos } = useData();
  const veTodos = puede('parametros') || !perfil.departamento_id;
  const ahora = useAhora();
  const h = hoy();
  const [depto, setDepto] = useState(veTodos ? '' : perfil.departamento_id);
  const [filtro, setFiltro] = useState('activas');
  const [sel, setSel] = useState(null);
  const [abierta, setAbierta] = useState(null);
  const [asignar, setAsignar] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [cancelar, setCancelar] = useState(null);

  const ubic = useCarga(() => listarUbicaciones(), []);
  const ots = useCarga(() => listarOrdenes({ desde: addDays(h, -14), deptoId: depto || undefined, limite: 500 }), [depto, h]);
  const flota = useCarga(() => disponibilidad(null, h), [h]);
  const det = useCarga(() => (sel ? verOrden(sel) : Promise.resolve(null)), [sel]);
  useOTVivo(() => { ots.recargar(); flota.recargar(); if (sel) det.recargar(); });

  // abiertas de cualquier fecha + todo lo del día
  const filas = useMemo(() => (ots.data || []).filter((o) => ABIERTAS.includes(o.estado) || o.fecha === h), [ots.data, h]);
  const alertas = useMemo(() => {
    const l = [];
    for (const o of filas) {
      const tarde = o.estado === 'en_ruta' ? minDesde(o.salida_en, ahora) - o.eta_min : 0;
      if (tarde > 0) l.push({ o, tipo: 'DEMORA', color: 'var(--bad)', txt: o.chofer_nombre + ' · ' + tarde + ' min sobre lo estimado → ' + o.destino_nombre });
      const atraso = o.programada_en ? minDesde(o.programada_en, ahora) : 0;
      if (o.estado === 'autorizada' && atraso > 15) l.push({ o, tipo: 'SIN SALIR', color: 'var(--pend)', txt: o.chofer_nombre + ' · programada ' + hhmm(o.programada_en) + ', todavía no salió' });
      if (o.estado === 'pendiente' && atraso > 0) l.push({ o, tipo: 'SIN ACEPTAR', color: 'var(--cB)', txt: o.chofer_nombre + ' · no aceptó la OT de las ' + hhmm(o.programada_en) });
    }
    return l;
  }, [filas, ahora]);

  if (abierta) return <OrdenDetalle id={abierta} onVolver={() => { setAbierta(null); ots.recargar(); }} />;
  if (asignar) {
    return (
      <div className="otcol">
        <div className="perhead"><h2>Asignar orden a un chofer</h2></div>
        <OrdenForm modo="asignar" onCancelar={() => setAsignar(false)}
          onCreada={(r, x) => { setAviso({ r, ...x }); setAsignar(false); ots.recargar(); flota.recargar(); }} />
      </div>
    );
  }

  const enRuta = filas.filter((o) => o.estado === 'en_ruta');
  const lista = filas.filter(FILTROS.find((f) => f[0] === filtro)[2]);
  const flotaF = (flota.data || []).filter((v) => !depto || v.departamento_id === depto);
  const s = det.data && det.data.id === sel ? det.data : null;
  const deptoNombre = (deptos.find((d) => d.id === perfil.departamento_id) || {}).nombre;

  return (
    <>
      <div className="perhead">
        <h2>Órdenes de trabajo{!veTodos && deptoNombre ? ' · ' + deptoNombre : ''}</h2>
        <div className="inl" style={{ marginTop: 0, alignItems: 'center' }}>
          {veTodos && (
            <select value={depto} onChange={(e) => setDepto(e.target.value)} aria-label="Departamento">
              <option value="">Todos los departamentos</option>
              {deptos.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
          )}
          <button className="btn primary" onClick={() => { setAviso(null); setAsignar(true); }}>+ Asignar OT</button>
        </div>
      </div>
      {ots.error && <div className="warnbox">{ots.error.message}</div>}
      {aviso && <div className="note" style={{ background: 'var(--ok-bg)', color: 'var(--ok)' }}>OT <b>{aviso.r.codigo}</b> asignada: aparece como pendiente en la bandeja de {aviso.chofer ? aviso.chofer.nombre : 'el chofer'}. Móvil {aviso.movil ? aviso.movil.codigo : ''} reservado.</div>}

      <div className="kpis">
        <div className="kpi"><div className="n">{filas.filter((o) => ABIERTAS.includes(o.estado)).length}</div><div className="l">OT abiertas</div></div>
        <div className="kpi"><div className="n">{enRuta.length}</div><div className="l">En ruta ahora</div></div>
        <div className="kpi"><div className="n">{filas.filter((o) => o.estado === 'finalizada' && o.fecha === h).length}</div><div className="l">Finalizadas hoy</div></div>
        <div className="kpi"><div className="n" style={{ color: alertas.some((a) => a.tipo === 'DEMORA') ? 'var(--bad)' : undefined }}>{alertas.filter((a) => a.tipo === 'DEMORA').length}</div><div className="l">Demoras</div></div>
      </div>

      <div className="cols" style={{ marginTop: 16 }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <MapaOT alto={320}
            puntos={(ubic.data || []).map((u) => ({ lat: u.lat, lng: u.lng, tipo: u.es_base ? 'base' : 'dest', etiqueta: u.nombre }))
              .concat(enRuta.filter((o) => o.destino_sucursal_id).map((o) => ({ lat: o.destino_lat, lng: o.destino_lng, tipo: 'dest', etiqueta: o.destino_nombre })))}
            lineas={enRuta.map((o) => ({ de: { lat: o.origen_lat, lng: o.origen_lng }, a: { lat: o.destino_lat, lng: o.destino_lng }, demora: minDesde(o.salida_en, ahora) > o.eta_min, texto: o.codigo + ' · ' + o.chofer_nombre + ' → ' + o.destino_nombre }))} />
          <div className="legend"><span><i className="otpin base" />Base</span><span><i className="otpin dest" />Destino</span><span>– – En ruta (rojo: con demora)</span></div>
        </div>
        <div className="card">
          <h2>Alertas <span className="pill pend">{alertas.length}</span></h2>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {alertas.length ? alertas.map((a, i) => (
              <button key={i} className="otalert" style={{ borderLeftColor: a.color }} onClick={() => setSel(a.o.id)}>
                <span style={{ display: 'flex', justifyContent: 'space-between' }}><b className="mono">{a.o.codigo}</b><b style={{ color: a.color, fontSize: 11 }}>{a.tipo}</b></span>
                <span className="sub">{a.txt}</span>
              </button>
            )) : <p className="hint" style={{ margin: 0 }}>Sin alertas.</p>}
          </div>
        </div>
      </div>

      <div className={sel ? 'cols' : ''} style={{ marginTop: 16 }}>
        <div className="card">
          <div className="perhead" style={{ marginTop: 0 }}>
            <h2 style={{ margin: 0 }}>Órdenes</h2>
            <div className="seg" role="group" aria-label="Filtro">{FILTROS.map(([k, l]) => <button key={k} aria-pressed={filtro === k} onClick={() => setFiltro(k)}>{l}</button>)}</div>
          </div>
          <div className="tw"><table className="t">
            <thead><tr><th>OT</th><th>Chofer</th><th>Móvil</th><th>Trayecto</th><th>Estado</th><th>Salida</th><th>Ruta</th></tr></thead>
            <tbody>
              {lista.map((o) => {
                const min = o.estado === 'en_ruta' ? minDesde(o.salida_en, ahora) : null;
                const tarde = min !== null && min > o.eta_min;
                return (
                  <tr key={o.id} className={'otrow' + (sel === o.id ? ' sel' : '')} onClick={() => setSel(o.id)} style={tarde ? { background: 'var(--bad-bg)' } : undefined}>
                    <td className="mono"><b>{o.codigo}</b></td><td>{o.chofer_nombre}</td><td>{o.movil_codigo}</td>
                    <td>{o.origen_nombre} → {o.destino_nombre}</td><td><Estado e={o.estado} /></td><td className="mono">{hhmm(o.salida_en)}</td>
                    <td className="mono" style={{ color: tarde ? 'var(--bad)' : undefined, fontWeight: 600 }}>{min !== null ? min + ' / ' + o.eta_min + ' min' : o.estado === 'finalizada' ? 'cerró ' + hhmm(o.cerrada_en) : '—'}</td>
                  </tr>
                );
              })}
              {!lista.length && <tr><td colSpan="7" className="hint">No hay órdenes en este filtro.</td></tr>}
            </tbody>
          </table></div>
        </div>
        {sel && (
          <div className="card">
            <h2 style={{ display: 'flex', justifyContent: 'space-between' }}>Trazabilidad <button className="xbtn" aria-label="Cerrar" onClick={() => setSel(null)}>×</button></h2>
            {!s ? <p className="hint">Cargando…</p> : (
              <>
                <div className="perhead" style={{ margin: '0 0 6px' }}><b className="mono" style={{ fontSize: 20 }}>{s.codigo}</b><Estado e={s.estado} /></div>
                <div className="sub" style={{ marginBottom: 10 }}>{s.chofer_nombre} · {s.movil_codigo} · {s.departamento_nombre}</div>
                <MapaRuta o={s} alto={180} />
                <div style={{ marginTop: 12 }}><Trazabilidad eventos={s.eventos} /></div>
                <div className="acts">
                  <button className="btn" onClick={() => setAbierta(s.id)}>Ver detalle</button>
                  {ABIERTAS.includes(s.estado) && <button className="btn danger" onClick={() => setCancelar(s)}>Cancelar y liberar móvil</button>}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="perhead" style={{ marginTop: 0 }}><h2 style={{ margin: 0 }}>Flota y disponibilidad</h2><span className="sub">{flotaF.filter((v) => v.estado === 'disponible').length} de {flotaF.length} disponibles</span></div>
        <div className="tw"><table className="t">
          <thead><tr><th>Móvil</th><th>Departamento</th><th>Estado</th><th>OT · Chofer</th></tr></thead>
          <tbody>{flotaF.map((v) => (
            <tr key={v.id}><td><b>{v.codigo}</b><div className="sub">{v.descripcion}</div></td><td>{v.departamento_nombre}</td>
              <td><span className={'pill ' + (v.estado === 'disponible' ? 'hecha' : 'curso')}>{v.estado === 'disponible' ? 'Disponible' : 'En uso'}</span></td>
              <td>{v.ot_codigo ? v.ot_codigo + ' · ' + v.ot_chofer : '—'}</td></tr>
          ))}</tbody>
        </table></div>
      </div>

      {cancelar && <Cancelar o={cancelar} onClose={() => setCancelar(null)} onHecho={() => { setCancelar(null); ots.recargar(); flota.recargar(); det.recargar(); }} />}
    </>
  );
}
