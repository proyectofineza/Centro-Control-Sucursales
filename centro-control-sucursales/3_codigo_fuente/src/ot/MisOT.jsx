import { useState } from 'react';
import { useData, useToast } from '../lib/store';
import { addDays, hoy } from '../lib/util';
import { listarOrdenes, useAhora, useCarga, useOTVivo } from './api';
import { ddmm, hhmm, minDesde, siguientePaso } from './util';
import OrdenForm from './OrdenForm';
import OrdenDetalle, { Estado } from './OrdenDetalle';

function Tarjeta({ o, ahora, onAbrir }) {
  const demora = o.estado === 'en_ruta' && minDesde(o.salida_en, ahora) > o.eta_min;
  return (
    <button className={'otcard' + (o.estado === 'pendiente' ? ' pend' : '')} onClick={() => onAbrir(o.id)}>
      <span className="otcard-h"><b className="mono">{o.codigo}</b><Estado e={o.estado} /></span>
      <b>{o.motivo}</b>
      <span className="sub">{o.origen_nombre} → <b style={{ color: 'var(--ink)' }}>{o.destino_nombre}</b></span>
      {o.estado === 'pendiente'
        ? <span className="sub">Programada {ddmm(o.fecha)}{o.programada_en ? ' · ' + hhmm(o.programada_en) : ''} · {o.movil_codigo}{o.asignada_por_nombre ? ' · asignó ' + o.asignada_por_nombre : ''}</span>
        : demora ? <span className="pill" style={{ background: 'var(--bad-bg)', color: 'var(--bad)' }}>Demora: {minDesde(o.salida_en, ahora) - o.eta_min} min sobre lo estimado</span>
          : <span style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 13 }}>{siguientePaso(o)}</span>}
    </button>
  );
}

/** Bandeja del chofer: pendientes asignadas, activas e historial. */
export default function MisOT() {
  const { perfil } = useData();
  const toast = useToast();
  const ahora = useAhora();
  const [vista, setVista] = useState({ k: 'lista' });
  const { data, cargando, error, recargar } = useCarga(() => listarOrdenes({ choferId: perfil.id, desde: addDays(hoy(), -30) }), [perfil.id]);
  useOTVivo(recargar);

  if (vista.k === 'nueva') {
    return (
      <div className="otcol">
        <div className="perhead"><h2>Nueva orden de trabajo</h2></div>
        <OrdenForm modo="propia" onCancelar={() => setVista({ k: 'lista' })}
          onCreada={(r) => { toast('OT ' + r.codigo + ' generada'); recargar(); setVista({ k: 'ver', id: r.id, qr: r.sale_de_base }); }} />
      </div>
    );
  }
  if (vista.k === 'ver') return <OrdenDetalle id={vista.id} mostrarQr={vista.qr} onVolver={() => { setVista({ k: 'lista' }); recargar(); }} />;

  const ots = data || [];
  const pend = ots.filter((o) => o.estado === 'pendiente');
  const act = ots.filter((o) => o.estado === 'autorizada' || o.estado === 'en_ruta');
  const hist = ots.filter((o) => o.estado === 'finalizada' || o.estado === 'cancelada').slice(0, 10);
  const abrir = (id) => setVista({ k: 'ver', id });

  return (
    <div className="otcol">
      <div className="perhead">
        <h2>Hola, {(perfil.nombre || '').split(' ')[0]}</h2>
        <button className="btn primary" onClick={() => setVista({ k: 'nueva' })}>+ Nueva OT</button>
      </div>
      {error && <div className="warnbox">{error.message}</div>}
      {cargando && !data && <p className="hint">Cargando tus órdenes…</p>}
      <div className="kpis">
        <div className="kpi"><div className="n">{pend.length}</div><div className="l">Pendientes</div></div>
        <div className="kpi"><div className="n">{act.length}</div><div className="l">Activas</div></div>
        <div className="kpi"><div className="n">{act.filter((o) => o.estado === 'en_ruta').length}</div><div className="l">En ruta</div></div>
        <div className="kpi"><div className="n">{hist.length}</div><div className="l">Cerradas (30 días)</div></div>
      </div>
      {pend.length > 0 && (<><h3 className="otsec">Pendientes asignadas</h3><div className="otlist">{pend.map((o) => <Tarjeta key={o.id} o={o} ahora={ahora} onAbrir={abrir} />)}</div></>)}
      <h3 className="otsec">Órdenes activas</h3>
      {act.length ? <div className="otlist">{act.map((o) => <Tarjeta key={o.id} o={o} ahora={ahora} onAbrir={abrir} />)}</div>
        : <div className="card hint" style={{ margin: 0 }}>No tienes órdenes activas. Genera una nueva o acepta una pendiente.</div>}
      <h3 className="otsec">Historial reciente</h3>
      <div className="card">
        {hist.length ? hist.map((o) => (
          <div className="row click" key={o.id} onClick={() => abrir(o.id)}>
            <div><b>{o.codigo} · {o.destino_nombre}</b><div className="sub">{o.motivo}</div></div>
            <div style={{ textAlign: 'right' }}><Estado e={o.estado} /><div className="sub mono">{ddmm(o.fecha)} {hhmm(o.cerrada_en)}</div></div>
          </div>
        )) : <p className="hint" style={{ margin: 0 }}>Todavía no hay órdenes cerradas.</p>}
      </div>
    </div>
  );
}
