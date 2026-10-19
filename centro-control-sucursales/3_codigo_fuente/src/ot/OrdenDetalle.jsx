import { useState } from 'react';
import { useData, useToast } from '../lib/store';
import { transicion, useAhora, useCarga, useOTVivo, verOrden } from './api';
import { ABIERTAS, ESTADOS, EVENTOS, MEDIOS, PILL, coord, ddmm, ddmmhhmm, hhmm, metros, miPosicion, minDesde } from './util';
import { MapaRuta } from './MapaOT';
import { QrModal } from './Qr';

export const Estado = ({ e }) => <span className={'pill ' + PILL[e]}>{ESTADOS[e] || e}</span>;

/** Trazabilidad de la OT: cada hito con quién, cuándo y por qué medio. */
export function Trazabilidad({ eventos }) {
  if (!eventos || !eventos.length) return <p className="hint">Sin eventos registrados.</p>;
  return (
    <div className="otline">
      {eventos.map((e) => (
        <div className={'oti ev-' + e.evento} key={e.id}>
          <b>{EVENTOS[e.evento] || e.evento}</b>
          <div className="sub">{ddmmhhmm(e.creado_en)} · {MEDIOS[e.medio] || e.medio}{e.actor_nombre ? ' · ' + e.actor_nombre : ''}</div>
          {e.nota && <div style={{ fontSize: 13 }}>{e.nota}</div>}
          {e.lat != null && <div className="sub mono">📍 {coord(e.lat, e.lng)}</div>}
        </div>
      ))}
    </div>
  );
}

/** Cancelación con motivo obligatorio (queda en la trazabilidad y en la auditoría). */
export function Cancelar({ o, onClose, onHecho }) {
  const toast = useToast();
  const [motivo, setMotivo] = useState('');
  const [err, setErr] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const ok = async () => {
    setErr(''); setOcupado(true);
    try { await transicion(o.id, 'cancelar', { motivo }); toast('OT ' + o.codigo + ' cancelada. El móvil ' + o.movil_codigo + ' quedó libre.'); onHecho(); }
    catch (e) { setErr(e.message); }
    setOcupado(false);
  };
  return (
    <>
      <div className="scrim m" onClick={onClose} />
      <div className="modalbox" role="dialog" aria-label={'Cancelar ' + o.codigo}>
        <h2>Cancelar {o.codigo}</h2>
        <p className="hint" style={{ marginTop: 0 }}>{o.chofer_nombre} · {o.movil_codigo} → {o.destino_nombre}. El móvil queda libre para otra OT.</p>
        {err && <div className="warnbox">{err}</div>}
        <div className="fld"><label htmlFor="ca-m">Motivo de la cancelación</label>
          <textarea id="ca-m" rows="3" maxLength={300} autoFocus placeholder="Ej.: el cliente reprogramó la entrega" value={motivo} onChange={(e) => setMotivo(e.target.value)} /></div>
        <div className="acts"><button className="btn" onClick={onClose}>Volver</button>
          <button className="btn danger" disabled={motivo.trim().length < 3 || ocupado} onClick={ok}>Confirmar cancelación</button></div>
      </div>
    </>
  );
}

const Dato = ({ k, v }) => <div><div className="sub" style={{ textTransform: 'uppercase', letterSpacing: '.06em' }}>{k}</div><b>{v}</b></div>;

export default function OrdenDetalle({ id, mostrarQr, onVolver }) {
  const { perfil, puede } = useData();
  const toast = useToast();
  const ahora = useAhora();
  const [qr, setQr] = useState(mostrarQr ? 'salida' : null);
  const [err, setErr] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [cancelar, setCancelar] = useState(false);
  const { data: o, cargando, error, recargar } = useCarga(() => verOrden(id), [id]);
  useOTVivo(recargar);

  if (cargando && !o) return <p className="hint">Cargando la orden…</p>;
  if (!o) return <div className="card"><div className="warnbox">{error ? error.message : 'No se encontró la orden.'}</div><button className="btn" onClick={onVolver}>‹ Volver</button></div>;

  const maneja = o.chofer_id === perfil.id || puede('parametros');
  // la cancelación final la valida la base de datos según el departamento
  const puedeCancelar = ABIERTAS.includes(o.estado) && (puede('parametros') || (puede('ot_supervisar') && (!perfil.departamento_id || perfil.departamento_id === o.departamento_id)));
  const demora = o.estado === 'en_ruta' && minDesde(o.salida_en, ahora) > o.eta_min;

  const correr = async (accion, opts, msg) => {
    setErr(''); setOcupado(true);
    try { await transicion(o.id, accion, opts); toast(msg); await recargar(); } catch (e) { setErr(e.message); }
    setOcupado(false);
  };
  const conGps = async (accion, msg) => {
    setErr(''); let p;
    try { p = await miPosicion(); } catch (e) { setErr(e.message); return; }
    // aviso anticipado del geocerco (la base de datos lo valida igual)
    if (accion === 'llegar' && o.destino_lat != null) {
      const d = metros(p, { lat: o.destino_lat, lng: o.destino_lng });
      if (d > o.destino_geocerco_m) { setErr('Estás a ' + d + ' m de ' + o.destino_nombre + ' (máximo ' + o.destino_geocerco_m + ' m). Acércate al destino para marcar la llegada.'); return; }
    }
    await correr(accion, { lat: p.lat, lng: p.lng }, msg);
  };

  return (
    <div className="otcol">
      <div className="perhead">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><button className="btn" onClick={onVolver}>‹ Volver</button><h2 style={{ fontSize: 28 }}>{o.codigo}</h2></div>
        <Estado e={o.estado} />
      </div>
      {err && <div className="warnbox">{err}</div>}
      {o.estado === 'pendiente' && <div className="note">Asignada por {o.asignada_por_nombre || 'un supervisor'} para el {ddmm(o.fecha)}{o.programada_en ? ' a las ' + hhmm(o.programada_en) : ''}. Acéptala para habilitar la salida.</div>}
      {o.estado === 'cancelada' && <div className="warnbox">Cancelada por {o.cancelada_por_nombre || 'un supervisor'}{o.motivo_cancelacion ? ': ' + o.motivo_cancelacion : ''}. El móvil quedó libre.</div>}
      {demora && <div className="warnbox">Demora: superó el tiempo estimado hace {minDesde(o.salida_en, ahora) - o.eta_min} min (salió {hhmm(o.salida_en)}, estimado {o.eta_min} min).</div>}

      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
        <MapaRuta o={o} />
        <div className="two" style={{ gap: 0 }}>
          <div style={{ padding: 12, borderRight: '1px solid var(--line)' }}><div className="sub">SALIDA</div><b>{o.origen_nombre}</b><div className="sub">{o.origen_tipo}{o.salida_en ? ' · ' + hhmm(o.salida_en) : ''}</div></div>
          <div style={{ padding: 12 }}><div className="sub">DESTINO</div><b>{o.destino_nombre}</b><div className="sub">{o.destino_tipo}{o.llegada_en ? ' · ' + hhmm(o.llegada_en) : ''}</div></div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="otdatos">
          <Dato k="Chofer" v={o.chofer_nombre} /><Dato k="Móvil" v={o.movil_codigo + ' · ' + o.movil_descripcion} />
          <Dato k="Departamento" v={o.departamento_nombre} /><Dato k="Fecha" v={ddmm(o.fecha)} /><Dato k="Estimado" v={o.eta_min + ' min'} />
        </div>
        <div className="sub" style={{ marginTop: 12 }}>MOTIVO</div><b>{o.motivo}</b>
        {o.descripcion && <><div className="sub" style={{ marginTop: 10 }}>DESCRIPCIÓN</div><div style={{ whiteSpace: 'pre-wrap' }}>{o.descripcion}</div></>}
      </div>

      {maneja && o.estado === 'pendiente' && <button className="btn primary big" disabled={ocupado} onClick={() => correr('aceptar', {}, 'OT aceptada')}>Aceptar orden</button>}
      {maneja && o.estado === 'autorizada' && o.sale_de_base && (
        <><button className="btn primary big" onClick={() => setQr('salida')}>Mostrar QR de salida</button>
          <p className="hint" style={{ textAlign: 'center' }}>Sale de una base: muestra el QR en la garita para registrar la salida.</p></>
      )}
      {maneja && o.estado === 'autorizada' && !o.sale_de_base && (
        <div className="card otacc"><h3>Iniciar viaje</h3><p className="hint">Esta OT no sale de una base ({o.origen_nombre}). Marca tu salida con el GPS; no pasa por la garita.</p>
          <button className="btn primary big" disabled={ocupado} onClick={() => conGps('salir', 'Viaje iniciado')}>Iniciar viaje (salida por GPS)</button></div>
      )}
      {maneja && o.estado === 'en_ruta' && o.cierra_dia && (
        <div className="card otacc"><h3>Entrada a la base y cierre</h3><p className="hint">El destino es una base ({o.destino_nombre}). Al llegar, muestra el QR y el guardia registra tu entrada para cerrar la OT.</p>
          <button className="btn primary big" onClick={() => setQr('entrada')}>Mostrar QR de entrada</button></div>
      )}
      {maneja && o.estado === 'en_ruta' && !o.cierra_dia && (
        <div className="card otacc ok"><h3>Llegada y cierre en destino</h3><p className="hint">Esta OT no es el cierre del día. Al marcar la llegada con el GPS (a menos de {o.destino_geocerco_m} m del destino) queda cerrada, sin pasar por la garita.</p>
          <button className="btn primary big" disabled={ocupado} onClick={() => conGps('llegar', 'Llegada registrada y OT cerrada')}>Marcar llegada y cerrar OT (GPS)</button></div>
      )}
      {o.estado === 'finalizada' && <div className="card otacc ok"><h3 style={{ color: 'var(--ok)' }}>Orden cerrada</h3><div className="sub">{o.cierra_dia ? 'Entrada a la base' : 'Cierre en destino'} {ddmmhhmm(o.cerrada_en)} · viaje completo registrado</div></div>}
      {puedeCancelar && <button className="btn danger big" style={{ marginTop: 10 }} onClick={() => setCancelar(true)}>Cancelar OT y liberar el móvil</button>}

      <div className="card" style={{ marginTop: 12 }}><h2>Trazabilidad</h2><Trazabilidad eventos={o.eventos} /></div>

      {qr && <QrModal o={o} titulo={qr === 'salida' ? 'QR de salida' : 'QR de entrada a la base'} onClose={() => setQr(null)} />}
      {cancelar && <Cancelar o={o} onClose={() => setCancelar(false)} onHecho={() => { setCancelar(false); recargar(); }} />}
    </div>
  );
}
