import { useState } from 'react';
import { useData, useToast } from '../lib/store';
import { hoy, parseCoords } from '../lib/util';
import { auditoria, disponibilidad, guardarDepto, guardarMovil, guardarUbicacion, listarDeptos, listarUbicaciones, useCarga } from './api';
import { coord, ddmmhhmm, miPosicion } from './util';
import MapaOT from './MapaOT';

/* ---------- Departamentos ---------- */
export function Departamentos() {
  const { perfiles, refresh } = useData();
  const toast = useToast();
  const todos = useCarga(() => listarDeptos({ archivados: true }), []);
  const mov = useCarga(() => disponibilidad(null, hoy()), []);
  const [nombre, setNombre] = useState('');
  const lista = (todos.data || []).filter((d) => !d.archivado_en);
  const recargar = () => { todos.recargar(); refresh('deptos'); };

  const agregar = async () => {
    const n = nombre.trim();
    try {
      // si existía archivado con ese nombre, se reactiva
      const viejo = (todos.data || []).find((d) => d.archivado_en && d.nombre.toLowerCase() === n.toLowerCase());
      await (viejo ? guardarDepto(viejo.id, { archivado_en: null }) : guardarDepto(null, { nombre: n }));
      toast('Departamento ' + n + (viejo ? ' reactivado' : ' creado')); setNombre(''); recargar();
    } catch (e) { toast(e.message); }
  };
  const quitar = async (d) => {
    if (!window.confirm('¿Eliminar el departamento «' + d.nombre + '»?')) return;
    try { await guardarDepto(d.id, { archivado_en: new Date().toISOString() }); toast('Departamento eliminado'); recargar(); } catch (e) { toast(e.message); }
  };

  return (
    <>
      <h2>Departamentos</h2>
      <p className="hint">Cada chofer, supervisor de OT y móvil pertenece a un departamento. El supervisor de OT solo ve lo de su departamento (si no tiene, ve todos). El departamento de cada empleado se elige en la pestaña Empleados.</p>
      {todos.error && <div className="warnbox">{todos.error.message}</div>}
      <div className="tw"><table className="t">
        <thead><tr><th>Departamento</th><th>Empleados</th><th>Móviles</th><th></th></tr></thead>
        <tbody>{lista.map((d) => {
          const nu = perfiles.filter((p) => p.activo && p.departamento_id === d.id).length;
          const nv = (mov.data || []).filter((v) => v.departamento_id === d.id).length;
          return (
            <tr key={d.id}>
              <td><input defaultValue={d.nombre} aria-label="Nombre" onBlur={async (e) => { const v = e.target.value.trim(); if (v && v !== d.nombre) { try { await guardarDepto(d.id, { nombre: v }); recargar(); } catch (er) { toast(er.message); } } }} /></td>
              <td>{nu}</td><td>{nv}</td>
              <td><button className="btn danger" disabled={nu + nv > 0} title={nu + nv > 0 ? 'Reasigna sus empleados y móviles primero' : undefined} onClick={() => quitar(d)}>Eliminar</button></td>
            </tr>);
        })}</tbody>
      </table></div>
      <div className="inl"><input placeholder="Nuevo departamento, por ejemplo Recursos Humanos" value={nombre} onChange={(e) => setNombre(e.target.value)} aria-label="Nuevo departamento" />
        <button className="btn primary" disabled={nombre.trim().length < 2} onClick={agregar}>Agregar</button></div>
    </>
  );
}

/* ---------- Móviles ---------- */
export function Moviles() {
  const { deptos } = useData();
  const toast = useToast();
  const flota = useCarga(() => disponibilidad(null, hoy()), []);
  const [filtro, setFiltro] = useState('');
  const [n, setN] = useState({ codigo: '', descripcion: '', departamento_id: '' });
  const filas = (flota.data || []).filter((v) => !filtro || v.departamento_id === filtro);

  const agregar = async () => {
    try {
      await guardarMovil(null, { codigo: n.codigo.trim().toUpperCase(), descripcion: n.descripcion.trim(), departamento_id: n.departamento_id });
      toast('Móvil ' + n.codigo.trim().toUpperCase() + ' agregado'); setN({ codigo: '', descripcion: '', departamento_id: n.departamento_id }); flota.recargar();
    } catch (e) { toast(e.message); }
  };
  const cambiar = async (v, valores, msg) => {
    try { await guardarMovil(v.id, valores); toast(msg); } catch (e) { toast(e.message); }
    flota.recargar();
  };

  return (
    <>
      <h2>Flota de móviles</h2>
      <p className="hint">Cada móvil pertenece a un departamento. Un móvil con OT abierta queda «en uso» hasta que se cierre o un supervisor la cancele; mientras tanto no se puede mover ni eliminar.</p>
      {flota.error && <div className="warnbox">{flota.error.message}</div>}
      <div className="inl" style={{ marginTop: 0 }}>
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Filtrar por departamento" style={{ flex: '0 1 260px' }}>
          <option value="">Todos los departamentos</option>{deptos.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}</select>
      </div>
      <div className="tw" style={{ marginTop: 10 }}><table className="t">
        <thead><tr><th>Móvil</th><th>Departamento</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          {filas.map((v) => {
            const uso = v.estado === 'en_uso';
            return (
              <tr key={v.id}>
                <td><b>{v.codigo}</b><div className="sub">{v.descripcion}</div></td>
                <td><select value={v.departamento_id} disabled={uso} title={uso ? 'Tiene una OT abierta' : undefined} aria-label={'Departamento de ' + v.codigo}
                  onChange={(e) => cambiar(v, { departamento_id: e.target.value }, v.codigo + ' reasignado')}>{deptos.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}</select></td>
                <td><span className={'pill ' + (uso ? 'curso' : 'hecha')}>{uso ? 'En uso · ' + v.ot_codigo : 'Disponible'}</span></td>
                <td><button className="btn danger" disabled={uso} onClick={() => { if (window.confirm('¿Eliminar ' + v.codigo + '?')) cambiar(v, { activo: false }, v.codigo + ' eliminado'); }}>Eliminar</button></td>
              </tr>);
          })}
          {!filas.length && <tr><td colSpan="4" className="hint">Sin móviles.</td></tr>}
        </tbody>
      </table></div>
      <div className="inl">
        <input placeholder="Código, ej. MOV-11" value={n.codigo} onChange={(e) => setN({ ...n, codigo: e.target.value })} aria-label="Código" />
        <input placeholder="Vehículo y chapa, ej. Fiat Ducato · XYZ 000" value={n.descripcion} onChange={(e) => setN({ ...n, descripcion: e.target.value })} aria-label="Vehículo" />
        <select value={n.departamento_id} onChange={(e) => setN({ ...n, departamento_id: e.target.value })} aria-label="Departamento"><option value="">Departamento…</option>{deptos.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}</select>
        <button className="btn primary" disabled={n.codigo.trim().length < 2 || !n.departamento_id} onClick={agregar}>Agregar móvil</button>
      </div>
    </>
  );
}

/* ---------- Ubicaciones ---------- */
const VACIA = { id: null, nombre: '', tipo: '', coords: '', geocerco_m: 200, es_base: false };
export function Ubicaciones() {
  const toast = useToast();
  const { data, error, recargar } = useCarga(() => listarUbicaciones(), []);
  const [f, setF] = useState(VACIA);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const lista = data || [];
  const punto = parseCoords(f.coords);

  const guardar = async () => {
    if (f.coords.trim() && !punto) { toast('Coordenadas no válidas. Pega las de Google Maps, por ejemplo: -25.5097, -54.6156'); return; }
    try {
      await guardarUbicacion(f.id, { nombre: f.nombre.trim(), tipo: f.tipo.trim() || 'Ubicación', es_base: f.es_base, lat: punto ? punto.lat : null, lng: punto ? punto.lng : null, geocerco_m: Math.min(5000, Math.max(20, parseInt(f.geocerco_m, 10) || 200)) });
      toast(f.id ? 'Ubicación actualizada' : 'Ubicación agregada'); setF(VACIA); recargar();
    } catch (e) { toast(e.message); }
  };
  const rapido = async (u, valores, msg) => { try { await guardarUbicacion(u.id, valores); toast(msg); recargar(); } catch (e) { toast(e.message); } };
  const gps = async () => { try { const p = await miPosicion(); set('coords', p.lat.toFixed(6) + ', ' + p.lng.toFixed(6)); } catch (e) { toast(e.message); } };

  return (
    <>
      <h2>Ubicaciones y bases</h2>
      <p className="hint">Las sucursales ya sirven como salida o destino de las OT (se toman de la pestaña Sucursales). Aquí van los otros lugares: depósitos, plantas, oficinas. Las marcadas como <b>base</b> exigen el QR del guardia para salir y entrar. El radio define a qué distancia se acepta la llegada por GPS.</p>
      {error && <div className="warnbox">{error.message}</div>}
      <div className="cols">
        <div className="tw"><table className="t">
          <thead><tr><th>Ubicación</th><th>GPS · radio</th><th>Base</th><th></th></tr></thead>
          <tbody>{lista.map((u) => (
            <tr key={u.id} style={f.id === u.id ? { background: 'var(--curso-bg)' } : undefined}>
              <td><b>{u.nombre}</b><div className="sub">{u.tipo}</div></td>
              <td className="mono sub">{coord(u.lat, u.lng)}<div>{u.geocerco_m} m</div></td>
              <td><label className="chk"><input type="checkbox" checked={u.es_base} onChange={() => rapido(u, { es_base: !u.es_base }, u.nombre + (u.es_base ? ': ya no es base' : ': ahora es base'))} />{u.es_base ? 'Base' : 'No'}</label></td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button className="btn" onClick={() => setF({ id: u.id, nombre: u.nombre, tipo: u.tipo, coords: u.lat != null ? u.lat + ', ' + u.lng : '', geocerco_m: u.geocerco_m, es_base: u.es_base })}>Editar</button>{' '}
                <button className="btn danger" onClick={() => { if (window.confirm('¿Eliminar ' + u.nombre + '? Las OT anteriores la conservan.')) rapido(u, { activa: false }, 'Ubicación eliminada'); }}>Eliminar</button>
              </td>
            </tr>))}
            {!lista.length && <tr><td colSpan="4" className="hint">Sin ubicaciones.</td></tr>}</tbody>
        </table></div>
        <div className="card" style={{ background: 'var(--bg)' }}>
          <h3 style={{ color: 'var(--ink)' }}>{f.id ? 'Editar ubicación' : 'Nueva ubicación'}</h3>
          <div className="two">
            <div className="fld"><label htmlFor="u-n">Nombre</label><input id="u-n" placeholder="Depósito Sur" value={f.nombre} onChange={(e) => set('nombre', e.target.value)} /></div>
            <div className="fld"><label htmlFor="u-t">Tipo</label><input id="u-t" placeholder="Planta, oficina…" value={f.tipo} onChange={(e) => set('tipo', e.target.value)} /></div>
          </div>
          <div className="fld"><label htmlFor="u-c">Coordenadas (de Google Maps o del mapa)</label>
            <div className="inl" style={{ marginTop: 0 }}><input id="u-c" placeholder="-25.5000, -54.6000" value={f.coords} onChange={(e) => set('coords', e.target.value)} /><button type="button" className="btn" onClick={gps}>GPS</button></div></div>
          <MapaOT alto={200} onPick={(p) => set('coords', p.lat.toFixed(6) + ', ' + p.lng.toFixed(6))}
            puntos={[...lista.filter((u) => u.id !== f.id).map((u) => ({ lat: u.lat, lng: u.lng, tipo: u.es_base ? 'base' : 'dest', etiqueta: u.nombre })), ...(punto ? [{ ...punto, tipo: 'ahora', etiqueta: f.nombre || 'Nuevo punto' }] : [])]} />
          <div className="sub" style={{ marginBottom: 10 }}>Toca el mapa para fijar el punto.</div>
          <div className="two">
            <div className="fld"><label htmlFor="u-r">Radio de llegada (metros)</label><input id="u-r" type="number" min="20" max="5000" value={f.geocerco_m} onChange={(e) => set('geocerco_m', e.target.value)} /></div>
            <label className="chk" style={{ alignSelf: 'center' }}><input type="checkbox" checked={f.es_base} onChange={(e) => set('es_base', e.target.checked)} />Es una base (garita con QR)</label>
          </div>
          <div className="acts">{f.id && <button className="btn" onClick={() => setF(VACIA)}>Cancelar</button>}
            <button className="btn primary" disabled={f.nombre.trim().length < 2} onClick={guardar}>{f.id ? 'Guardar cambios' : 'Agregar ubicación'}</button></div>
        </div>
      </div>
    </>
  );
}

/* ---------- Auditoría ---------- */
function resumen(a) {
  const m = a.meta || {};
  if (m.codigo) return [m.codigo, m.motivo, m.movimiento, m.manual ? 'manual' : null].filter(Boolean).join(' · ');
  const f = m.despues || m.fila;
  return f ? f.nombre || f.codigo || f.email || '' : '';
}
export function Auditoria() {
  const { perfiles } = useData();
  const { data, error } = useCarga(() => auditoria(200), []);
  const nombre = (id) => (perfiles.find((p) => p.id === id) || {}).nombre;
  return (
    <>
      <h2>Auditoría</h2>
      <p className="hint">Últimos 200 eventos: altas y cambios de empleados, roles, departamentos, móviles y ubicaciones; creación, salidas, llegadas y cancelaciones de OT, y registros manuales en la garita.</p>
      {error && <div className="warnbox">{error.message}</div>}
      <div className="tw"><table className="t">
        <thead><tr><th>Fecha</th><th>Acción</th><th>Usuario</th><th>Detalle</th></tr></thead>
        <tbody>{(data || []).map((a) => (
          <tr key={a.id}>
            <td className="mono sub" style={{ whiteSpace: 'nowrap' }}>{ddmmhhmm(a.creado_en)}</td>
            <td><code style={{ color: /manual|cancel/.test(a.accion) ? 'var(--bad)' : undefined }}>{a.accion}</code></td>
            <td>{a.actor_id ? nombre(a.actor_id) || '—' : <span className="sub">sistema</span>}</td>
            <td>{resumen(a)}</td>
          </tr>))}
          {data && !data.length && <tr><td colSpan="4" className="hint">Sin eventos.</td></tr>}</tbody>
      </table></div>
    </>
  );
}
