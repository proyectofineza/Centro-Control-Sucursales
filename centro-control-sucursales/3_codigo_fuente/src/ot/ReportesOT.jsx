import { useState } from 'react';
import { barras } from '../components/Comun';
import { useData } from '../lib/store';
import { addDays, hoy } from '../lib/util';
import { listarOrdenes, reporte, useCarga } from './api';
import { ESTADOS, ddmmhhmm, descargarExcel } from './util';

const COLOR = { pendiente: 'var(--cB)', autorizada: 'var(--hazard)', en_ruta: 'var(--curso)', finalizada: 'var(--ok)', cancelada: 'var(--muted)' };

export default function ReportesOT() {
  const { perfil, puede, deptos } = useData();
  const veTodos = puede('parametros') || !perfil.departamento_id;
  const h = hoy();
  const [desde, setDesde] = useState(addDays(h, -29));
  const [hasta, setHasta] = useState(h);
  const [depto, setDepto] = useState('');
  const [err, setErr] = useState('');
  const rep = useCarga(() => reporte(desde, hasta, depto || null), [desde, hasta, depto]);
  const r = rep.data, k = r && r.kpis;

  const excel = async () => {
    setErr('');
    try {
      const det = await listarOrdenes({ desde, hasta, deptoId: depto || undefined, limite: 5000 });
      descargarExcel('OT_' + desde + '_' + hasta + '.xls', [
        { nombre: 'Resumen', columnas: [{ clave: 'k', titulo: 'Indicador', ancho: 220 }, { clave: 'v', titulo: 'Valor', ancho: 120 }], filas: [
          { k: 'Período', v: desde + ' a ' + hasta }, { k: 'OT totales', v: k.total }, { k: 'Finalizadas', v: k.finalizadas },
          { k: 'Canceladas', v: k.canceladas }, { k: 'Abiertas', v: k.abiertas }, { k: 'Con demora', v: k.con_demora },
          { k: 'Cumplimiento %', v: Number(k.cumplimiento_pct) }, { k: 'Puntualidad %', v: Number(k.puntualidad_pct) },
          { k: 'Tiempo promedio de viaje (min)', v: k.min_prom_viaje ?? '' }] },
        { nombre: 'Detalle OT', columnas: [
          { clave: 'codigo', titulo: 'OT', ancho: 80 }, { clave: 'fecha', titulo: 'Fecha', ancho: 85 }, { clave: 'est', titulo: 'Estado', ancho: 90 },
          { clave: 'chofer_nombre', titulo: 'Chofer', ancho: 140 }, { clave: 'departamento_nombre', titulo: 'Departamento', ancho: 130 },
          { clave: 'movil_codigo', titulo: 'Móvil', ancho: 80 }, { clave: 'origen_nombre', titulo: 'Salida', ancho: 140 },
          { clave: 'destino_nombre', titulo: 'Destino', ancho: 140 }, { clave: 'motivo', titulo: 'Motivo', ancho: 160 },
          { clave: 'sal', titulo: 'Hora salida', ancho: 110 }, { clave: 'cie', titulo: 'Hora cierre', ancho: 110 },
          { clave: 'min', titulo: 'Minutos de viaje', ancho: 100 }, { clave: 'eta_min', titulo: 'Estimado (min)', ancho: 90 },
          { clave: 'dem', titulo: 'Demora', ancho: 70 }, { clave: 'motivo_cancelacion', titulo: 'Motivo de cancelación', ancho: 180 }],
          filas: det.map((o) => ({ ...o, est: ESTADOS[o.estado], sal: o.salida_en ? ddmmhhmm(o.salida_en) : '', cie: o.cerrada_en ? ddmmhhmm(o.cerrada_en) : '',
            min: o.salida_en && o.llegada_en ? Math.round((new Date(o.llegada_en) - new Date(o.salida_en)) / 60000) : '', dem: o.demorada ? 'Sí' : '' })) },
        { nombre: 'Por chofer', columnas: [
          { clave: 'chofer', titulo: 'Chofer', ancho: 150 }, { clave: 'departamento', titulo: 'Departamento', ancho: 130 }, { clave: 'total', titulo: 'Total' },
          { clave: 'finalizadas', titulo: 'Finalizadas' }, { clave: 'en_curso', titulo: 'En curso' }, { clave: 'canceladas', titulo: 'Canceladas' },
          { clave: 'demoras', titulo: 'Demoras' }, { clave: 'min_prom', titulo: 'Min. promedio' }, { clave: 'moviles', titulo: 'Móviles usados' }], filas: r.por_chofer },
        { nombre: 'Por móvil', columnas: [
          { clave: 'movil', titulo: 'Móvil', ancho: 80 }, { clave: 'descripcion', titulo: 'Vehículo', ancho: 180 }, { clave: 'departamento', titulo: 'Departamento', ancho: 130 },
          { clave: 'viajes', titulo: 'Viajes' }, { clave: 'choferes', titulo: 'Choferes' }, { clave: 'minutos_en_ruta', titulo: 'Minutos en ruta' }], filas: r.por_movil }
      ]);
    } catch (e) { setErr(e.message); }
  };

  const maxCh = r ? Math.max(0, ...r.por_chofer.map((d) => d.total)) : 0;
  const est = r ? Object.keys(ESTADOS).filter((e) => r.por_estado[e]).map((e) => ({ l: ESTADOS[e], v: r.por_estado[e], c: COLOR[e] })) : [];
  const dest = r ? r.por_destino.slice(0, 8).map((d) => ({ l: d.destino, v: d.visitas, c: 'var(--cA)' })) : [];

  return (
    <>
      <div className="perhead">
        <h2>Reportes de OT</h2>
        <div className="inl" style={{ marginTop: 0, alignItems: 'center' }}>
          <input type="date" aria-label="Desde" value={desde} max={hasta} onChange={(e) => e.target.value && setDesde(e.target.value)} />
          <input type="date" aria-label="Hasta" value={hasta} min={desde} onChange={(e) => e.target.value && setHasta(e.target.value)} />
          {veTodos && <select value={depto} aria-label="Departamento" onChange={(e) => setDepto(e.target.value)}><option value="">Todos los departamentos</option>{deptos.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}</select>}
          <button className="btn primary" disabled={!r} onClick={excel}>Descargar Excel</button>
        </div>
      </div>
      {(err || rep.error) && <div className="warnbox">{err || rep.error.message}</div>}
      {!r ? <p className="hint">Cargando…</p> : (
        <>
          <div className="kpis">
            <div className="kpi"><div className="n">{k.total}</div><div className="l">OT del período · {k.abiertas} abiertas</div></div>
            <div className="kpi"><div className="n">{k.cumplimiento_pct}%</div><div className="l">Cumplimiento · {k.finalizadas} finalizadas</div></div>
            <div className="kpi"><div className="n">{k.puntualidad_pct}%</div><div className="l">Puntualidad · {k.con_demora} con demora</div></div>
            <div className="kpi"><div className="n">{k.min_prom_viaje ?? '—'}</div><div className="l">Minutos promedio de viaje</div></div>
          </div>
          <div className="grid-auto" style={{ marginTop: 16, alignItems: 'start' }}>
            <div className="card"><h2>OT por chofer</h2>{barras(r.por_chofer.slice(0, 10).map((d) => ({ l: d.chofer, v: d.total, c: 'var(--accent)' })), maxCh, 'Sin OT en el período.')}</div>
            <div className="card"><h2>OT por estado</h2>{barras(est, Math.max(0, ...est.map((x) => x.v)), 'Sin OT en el período.')}</div>
            <div className="card"><h2>Destinos frecuentes</h2>{barras(dest, Math.max(0, ...dest.map((x) => x.v)), 'Sin OT en el período.')}</div>
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <h2>Rendimiento por chofer</h2>
            <div className="tw"><table className="t">
              <thead><tr><th>Chofer</th><th>Depto.</th><th>Total</th><th>Finalizadas</th><th>En curso</th><th>Canceladas</th><th>Demoras</th><th>Tiempo prom.</th><th>Cumplimiento</th></tr></thead>
              <tbody>
                {r.por_chofer.map((d) => {
                  const pct = d.total ? Math.round((d.finalizadas / d.total) * 100) : 0;
                  return (
                    <tr key={d.chofer + d.departamento}>
                      <td><b>{d.chofer}</b></td><td className="sub">{d.departamento}</td><td>{d.total}</td><td style={{ color: 'var(--ok)', fontWeight: 600 }}>{d.finalizadas}</td>
                      <td>{d.en_curso}</td><td>{d.canceladas}</td><td style={{ color: d.demoras ? 'var(--bad)' : undefined, fontWeight: 600 }}>{d.demoras}</td>
                      <td className="mono">{d.min_prom != null ? d.min_prom + ' min' : '—'}</td>
                      <td><div className="hbar" style={{ gridTemplateColumns: 'minmax(60px,1fr) 40px', margin: 0 }}><div className="t"><i style={{ width: pct + '%', background: 'var(--ok)' }} /></div><span className="v mono">{pct}%</span></div></td>
                    </tr>
                  );
                })}
                {!r.por_chofer.length && <tr><td colSpan="9" className="hint">Sin OT en el período.</td></tr>}
              </tbody>
            </table></div>
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <h2>Uso de móviles</h2>
            <div className="tw"><table className="t">
              <thead><tr><th>Móvil</th><th>Departamento</th><th>Viajes</th><th>Choferes</th><th>Min. en ruta</th></tr></thead>
              <tbody>{r.por_movil.map((v) => <tr key={v.movil}><td><b>{v.movil}</b><div className="sub">{v.descripcion}</div></td><td>{v.departamento}</td><td>{v.viajes}</td><td>{v.choferes}</td><td className="mono">{v.minutos_en_ruta ?? '—'}</td></tr>)}
                {!r.por_movil.length && <tr><td colSpan="5" className="hint">Sin viajes en el período.</td></tr>}</tbody>
            </table></div>
          </div>
          <p className="hint">El Excel trae el resumen, el detalle de cada OT y el rendimiento por chofer y por móvil del período.</p>
        </>
      )}
    </>
  );
}
