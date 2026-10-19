import { useEffect, useMemo, useState } from 'react';
import { useData } from '../lib/store';
import { hoy } from '../lib/util';
import { crearOrden, disponibilidad, listarUbicaciones, useCarga } from './api';
import { MOTIVOS, choferesDe, coord, miPosicion } from './util';
import MapaOT from './MapaOT';

// Lugar elegido en una lista: «u:<id>» ubicación de OT, «s:<id>» sucursal, «mapa» punto marcado
const lugar = (v, ubic, sucById) => {
  if (!v || v === 'mapa') return null;
  const [t, id] = [v.slice(0, 1), v.slice(2)];
  if (t === 'u') { const u = ubic.find((x) => x.id === id); return u && { nombre: u.nombre, base: u.es_base, lat: u.lat, lng: u.lng }; }
  const s = sucById.get(id); return s && { nombre: s.nombre, base: false, lat: s.lat, lng: s.lng };
};

function Lugares({ id, valor, onChange, ubic, sucursales, excluir, conMapa, vacio }) {
  return (
    <select id={id} value={valor} onChange={(e) => onChange(e.target.value)}>
      {vacio && <option value="">{vacio}</option>}
      {conMapa && <option value="mapa">📍 Marcar un punto en el mapa</option>}
      <optgroup label="Bases y ubicaciones">
        {ubic.filter((u) => 'u:' + u.id !== excluir).map((u) => <option key={u.id} value={'u:' + u.id}>{u.nombre}{u.es_base ? ' · Base' : ' · ' + u.tipo}</option>)}
      </optgroup>
      <optgroup label="Sucursales">
        {sucursales.filter((s) => 's:' + s.id !== excluir).map((s) => <option key={s.id} value={'s:' + s.id}>{s.nombre} · {s.unidad_negocio}</option>)}
      </optgroup>
    </select>
  );
}

/**
 * Alta de OT.
 *  modo="propia"  → el chofer la genera para sí (queda autorizada)
 *  modo="asignar" → quien supervisa la asigna a un chofer (queda pendiente)
 */
export default function OrdenForm({ modo, destinoInicial, onCreada, onCancelar }) {
  const { perfil, perfiles, roles, sucursales, sucById, puede, deptos } = useData();
  const asignar = modo === 'asignar';
  const vacio = { choferId: asignar ? '' : perfil.id, fecha: hoy(), hora: '', movilId: '', origen: '', destino: destinoInicial || '', punto: null, puntoNombre: '', motivo: '', eta: 30, descripcion: '' };
  const [f, setF] = useState(vacio);
  const [err, setErr] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const ubicC = useCarga(() => listarUbicaciones(), []);
  const ubic = ubicC.data || [];
  const sucs = useMemo(() => sucursales.filter((s) => s.activa), [sucursales]);
  const deptoNombre = (id) => (deptos.find((d) => d.id === id) || {}).nombre || 'sin departamento';

  // a quién puede asignar: todos si administra o supervisa sin departamento; si no, los de su departamento
  const choferes = useMemo(() => {
    const todos = choferesDe(perfiles, roles).filter((p) => p.id !== perfil.id || !asignar);
    if (!asignar || puede('parametros') || !perfil.departamento_id) return todos;
    return todos.filter((p) => p.departamento_id === perfil.departamento_id);
  }, [perfiles, roles, perfil, asignar, puede]);
  const chofer = asignar ? choferes.find((c) => c.id === f.choferId) : perfil;

  const movC = useCarga(() => (f.choferId ? disponibilidad(f.choferId, f.fecha) : Promise.resolve([])), [f.choferId, f.fecha]);
  const moviles = useMemo(() => (movC.data || []).filter((v) => chofer && v.departamento_id === chofer.departamento_id && v.elegible), [movC.data, chofer]);

  // salida por defecto: la primera base
  useEffect(() => { if (!f.origen && ubic.length) set('origen', 'u:' + (ubic.find((u) => u.es_base) || ubic[0]).id); }, [ubic, f.origen]);
  // si el móvil elegido deja de estar disponible (cambió chofer o fecha), se limpia
  useEffect(() => { if (f.movilId && movC.data && !moviles.some((v) => v.id === f.movilId)) set('movilId', ''); }, [moviles, movC.data, f.movilId]);

  if (ubicC.cargando) return <p className="hint">Cargando ubicaciones…</p>;

  const ori = lugar(f.origen, ubic, sucById);
  const des = f.destino === 'mapa' ? (f.punto && { nombre: f.puntoNombre || 'Punto GPS', base: false, ...f.punto }) : lugar(f.destino, ubic, sucById);
  const invalido = !f.choferId || !f.movilId || !f.origen || !des || !f.motivo || f.origen === f.destino || !f.fecha;

  const gps = async () => {
    setErr('');
    try { const p = await miPosicion(); set('punto', { lat: p.lat, lng: p.lng }); } catch (e) { setErr(e.message); }
  };

  const enviar = async () => {
    setErr(''); setOcupado(true);
    const t = (v) => v.slice(0, 1), id = (v) => v.slice(2);
    try {
      const r = await crearOrden({
        choferId: asignar ? f.choferId : null,
        movilId: f.movilId,
        origenId: t(f.origen) === 'u' ? id(f.origen) : null, origenSuc: t(f.origen) === 's' ? id(f.origen) : null,
        destinoId: f.destino.startsWith('u:') ? id(f.destino) : null, destinoSuc: f.destino.startsWith('s:') ? id(f.destino) : null,
        destLat: f.destino === 'mapa' ? f.punto.lat : null, destLng: f.destino === 'mapa' ? f.punto.lng : null,
        destNombre: f.destino === 'mapa' ? f.puntoNombre : null,
        motivo: f.motivo, descripcion: f.descripcion, fecha: f.fecha, eta: Number(f.eta) || 30,
        programada: asignar && f.hora ? new Date(f.fecha + 'T' + f.hora).toISOString() : null
      });
      onCreada(r, { chofer, movil: moviles.find((v) => v.id === f.movilId) });
      if (asignar) setF({ ...vacio, origen: f.origen });
    } catch (e) { setErr(e.message); movC.recargar(); }
    setOcupado(false);
  };

  return (
    <div className="card">
      {(err || ubicC.error || movC.error) && <div className="warnbox">{err || (ubicC.error || movC.error).message}</div>}
      {asignar ? (
        <div className="fld"><label htmlFor="of-ch">Responsable (chofer a cargo)</label>
          <select id="of-ch" value={f.choferId} onChange={(e) => set('choferId', e.target.value)}>
            <option value="">Elige el chofer…</option>
            {choferes.map((c) => <option key={c.id} value={c.id} disabled={!c.departamento_id}>{c.nombre} · {deptoNombre(c.departamento_id)}</option>)}
          </select>
          {choferes.length === 0 && <div className="note" style={{ marginTop: 6 }}>No hay choferes activos{perfil.departamento_id && !puede('parametros') ? ' en tu departamento' : ''}. Se crean en Parámetros &gt; Empleados con un rol que tenga el permiso de manejar.</div>}
        </div>
      ) : (
        <div className="fld"><label>Chofer</label><div className="sub" style={{ fontSize: 14 }}><b style={{ color: 'var(--ink)' }}>{perfil.nombre}</b> · {deptoNombre(perfil.departamento_id)}</div>
          {!perfil.departamento_id && <div className="warnbox" style={{ marginTop: 6 }}>Tu usuario no tiene departamento. Pídele al administrador que te lo asigne en Parámetros &gt; Empleados.</div>}
        </div>
      )}

      <div className="two">
        <div className="fld"><label htmlFor="of-f">Fecha de trabajo</label><input id="of-f" type="date" min={hoy()} value={f.fecha} onChange={(e) => set('fecha', e.target.value)} /></div>
        {asignar
          ? <div className="fld"><label htmlFor="of-h">Hora (opcional)</label><input id="of-h" type="time" value={f.hora} onChange={(e) => set('hora', e.target.value)} /></div>
          : <div className="fld"><label htmlFor="of-e">Tiempo estimado de viaje (min)</label><input id="of-e" type="number" min="5" max="600" value={f.eta} onChange={(e) => set('eta', e.target.value)} /></div>}
      </div>

      <div className="fld"><label htmlFor="of-m">Móvil (del departamento del chofer)</label>
        <select id="of-m" value={f.movilId} disabled={!f.choferId || movC.cargando} onChange={(e) => set('movilId', e.target.value)}>
          <option value="">{f.choferId ? 'Elige un móvil disponible…' : 'Elige primero el chofer'}</option>
          {moviles.map((v) => <option key={v.id} value={v.id}>{v.codigo} · {v.descripcion}{v.reservado_chofer ? ' · ya asignado en ' + v.ot_codigo : ''}</option>)}
        </select>
        {f.choferId && !movC.cargando && moviles.length === 0 && <div className="note" style={{ marginTop: 6 }}>No hay móviles disponibles en el departamento: todos tienen una OT abierta.</div>}
        {moviles.length > 0 && <div className="sub">{moviles.length} disponible(s). Los móviles con OT abierta de otro chofer no aparecen.</div>}
      </div>

      <div className="fld"><label htmlFor="of-o">Salida</label>
        <Lugares id="of-o" valor={f.origen} onChange={(v) => set('origen', v)} ubic={ubic} sucursales={sucs} />
        {ori && <div className={'otnote ' + (ori.base ? 'base' : 'gps')}>{ori.base ? '◆ Sale de una base: el guardia registra la salida con el QR.' : '⊕ Sale fuera de base: el chofer inicia el viaje con el GPS, sin garita.'}</div>}
      </div>

      <div className="fld"><label htmlFor="of-d">Destino</label>
        <Lugares id="of-d" valor={f.destino} onChange={(v) => set('destino', v)} ubic={ubic} sucursales={sucs} excluir={f.origen} conMapa vacio="Elige el destino…" />
        {f.destino === 'mapa' && (
          <div style={{ marginTop: 8 }}>
            <MapaOT alto={240} onPick={(p) => set('punto', p)}
              puntos={[...ubic.map((u) => ({ lat: u.lat, lng: u.lng, tipo: u.es_base ? 'base' : 'dest', etiqueta: u.nombre })), ...(f.punto ? [{ ...f.punto, tipo: 'ahora', etiqueta: 'Destino' }] : [])]} />
            <div className="inl"><button type="button" className="btn" onClick={gps}>Usar mi ubicación actual (GPS)</button>
              {f.punto && <input placeholder="Nombre de referencia (opcional), ej. Cliente Gómez" maxLength={120} value={f.puntoNombre} onChange={(e) => set('puntoNombre', e.target.value)} aria-label="Nombre del punto" />}</div>
            <div className="sub">{f.punto ? '📍 Destino fijado: ' + coord(f.punto.lat, f.punto.lng) : 'Toca el mapa para marcar el destino.'}</div>
          </div>
        )}
        {des && <div className={'otnote ' + (des.base ? 'gps' : 'ok')}>{des.base ? '◆ Destino base: es la OT de cierre del día; al llegar, el guardia registra la entrada con el QR.' : '⊕ Destino intermedio: se cierra al marcar la llegada con el GPS, sin garita.'}{des.lat == null ? ' Este destino no tiene coordenadas: la llegada se acepta en cualquier lugar.' : ''}</div>}
      </div>

      <div className="two">
        <div className="fld"><label htmlFor="of-mo">Motivo</label>
          <select id="of-mo" value={f.motivo} onChange={(e) => set('motivo', e.target.value)}><option value="">Elige el motivo…</option>{MOTIVOS.map((m) => <option key={m}>{m}</option>)}</select></div>
        {asignar && <div className="fld"><label htmlFor="of-e2">Tiempo estimado de viaje (min)</label><input id="of-e2" type="number" min="5" max="600" value={f.eta} onChange={(e) => set('eta', e.target.value)} /></div>}
      </div>
      <div className="fld"><label htmlFor="of-de">Descripción del trabajo</label>
        <textarea id="of-de" rows="3" maxLength={2000} placeholder={asignar ? 'Indicaciones para el chofer…' : 'Detalle de la tarea, carga, contactos…'} value={f.descripcion} onChange={(e) => set('descripcion', e.target.value)} /></div>

      <div className="acts">
        {onCancelar && <button className="btn" onClick={onCancelar}>Cancelar</button>}
        <button className="btn primary" disabled={invalido || ocupado} onClick={enviar}>
          {ocupado ? 'Guardando…' : asignar ? 'Asignar OT como pendiente' : ori && ori.base ? 'Generar orden y QR de salida' : 'Generar orden'}
        </button>
      </div>
      <p className="hint" style={{ marginBottom: 0, textAlign: 'right' }}>
        {asignar ? 'El chofer la verá en su bandeja y deberá aceptarla.' : ori && ori.base ? 'La OT queda autorizada: muestra el QR en la garita para salir.' : 'La OT queda autorizada: inicia el viaje con el GPS desde el detalle.'}
      </p>
    </div>
  );
}
