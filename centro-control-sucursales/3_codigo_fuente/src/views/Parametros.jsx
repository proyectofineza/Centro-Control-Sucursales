import { useMemo, useState } from 'react';
import { useData, useToast } from '../lib/store';
import { ESPS, UNIDADES, miembrosDe, parseCSV, parseCoords } from '../lib/util';
import { Auditoria, Departamentos, Moviles, Ubicaciones } from '../ot/ConfigOT';

const sinAcentos = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const slug = (s) => sinAcentos(s).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'activo';

/* ---------- Sucursales ---------- */
function Sucursales() {
  const { sucursales, unidades, guardar, guardarVarios, borrar } = useData();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [ed, setEd] = useState(null);
  const [csv, setCsv] = useState('');
  const lista = useMemo(() => sucursales.filter((s) => sinAcentos(s.nombre).includes(sinAcentos(q))), [sucursales, q]);
  const nueva = () => setEd({ id: null, nombre: '', unidad_negocio: unidades[0] || '', dias_operacion: 7, direccion: '', coords: '', activa: true });
  const editar = (s) => setEd({ ...s, direccion: s.direccion || '', coords: s.lat != null ? s.lat + ', ' + s.lng : '' });

  const guardarEd = async () => {
    if (!ed.nombre.trim()) { toast('Escribe el nombre de la sucursal.'); return; }
    let lat = null, lng = null;
    if (ed.coords.trim()) {
      const c = parseCoords(ed.coords);
      if (!c) { toast('Coordenadas no válidas. Pega las de Google Maps, por ejemplo: -25.2820, -57.6350'); return; }
      lat = c.lat; lng = c.lng;
    }
    const ok = await guardar('mnt_sucursales', ed.id, { nombre: ed.nombre.trim(), unidad_negocio: ed.unidad_negocio.trim() || 'Sin unidad', dias_operacion: Number(ed.dias_operacion), direccion: ed.direccion.trim() || null, lat, lng, activa: ed.activa }, 'Sucursal guardada');
    if (ok) setEd(null);
  };

  const leerArchivo = (f) => { if (!f) return; const r = new FileReader(); r.onload = () => setCsv(String(r.result)); r.readAsText(f); };
  const importar = async () => {
    const filas = parseCSV(csv);
    if (filas.length < 2) { toast('El archivo no tiene filas para importar.'); return; }
    const cab = filas[0].map(sinAcentos);
    const col = (...nombres) => cab.findIndex((c) => nombres.includes(c));
    const iN = col('nombre', 'sucursal'), iU = col('unidad', 'unidad_negocio', 'unidad de negocio'), iLa = col('lat', 'latitud'), iLn = col('lng', 'lon', 'long', 'longitud'), iD = col('dias', 'dias_operacion', 'dias de operacion'), iDir = col('direccion');
    if (iN < 0) { toast('Falta la columna «nombre» en la primera fila.'); return; }
    const mapa = new Map();
    filas.slice(1).forEach((r) => {
      const nombre = (r[iN] || '').trim(); if (!nombre) return;
      const num = (v) => { const x = parseFloat(String(v || '').replace(',', '.')); return isNaN(x) ? null : x; };
      const dtxt = sinAcentos(iD >= 0 ? r[iD] : '');
      const dias = /viernes|^5$/.test(dtxt) ? 5 : /sabado|^6$/.test(dtxt) ? 6 : 7;
      const o = { nombre, unidad_negocio: ((iU >= 0 ? r[iU] : '') || '').trim() || 'Baratote Minorista', dias_operacion: dias };
      const la = iLa >= 0 ? num(r[iLa]) : null, ln = iLn >= 0 ? num(r[iLn]) : null;
      if (la != null && ln != null) { o.lat = la; o.lng = ln; }
      if (iDir >= 0 && (r[iDir] || '').trim()) o.direccion = r[iDir].trim();
      mapa.set(nombre, o);
    });
    const filasOk = [...mapa.values()];
    if (!filasOk.length) { toast('No encontré sucursales para importar.'); return; }
    if (await guardarVarios('mnt_sucursales', filasOk, 'nombre', filasOk.length + ' sucursales importadas o actualizadas')) setCsv('');
  };
  const plantilla = () => {
    const txt = 'nombre,unidad_negocio,lat,lng,dias_operacion,direccion\nBaratote Centro,Baratote Minorista,-25.2820,-57.6350,7,Palma 123\nFineglass Luque,Fineglass,-25.2680,-57.4870,5,Ruta 2 km 14\n';
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + txt], { type: 'text/csv' })); a.download = 'plantilla_sucursales.csv'; a.click();
  };

  return (
    <>
      <h2>Sucursales</h2>
      <p className="hint">Importa tu lista desde un CSV (columnas: nombre, unidad_negocio, lat, lng, dias_operacion, direccion) o agrega una por una. Si importas de nuevo, se actualizan por nombre.</p>
      <div className="inl" style={{ marginTop: 0 }}>
        <input type="search" placeholder="Buscar sucursal" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar sucursal" />
        <button className="btn primary" onClick={nueva}>+ Nueva sucursal</button>
        <button className="btn" onClick={plantilla}>Descargar plantilla CSV</button>
        <label className="btn">Elegir archivo CSV<input type="file" accept=".csv,text/csv,text/plain" hidden onChange={(e) => { leerArchivo(e.target.files[0]); e.target.value = ''; }} /></label>
      </div>
      {csv && (
        <div className="card" style={{ background: 'var(--bg)', marginTop: 12 }}>
          <b>{Math.max(0, parseCSV(csv).length - 1)} filas listas para importar</b>
          <div className="acts" style={{ justifyContent: 'flex-start' }}><button className="btn primary" onClick={importar}>Importar ahora</button><button className="btn" onClick={() => setCsv('')}>Cancelar</button></div>
        </div>
      )}
      {ed && (
        <div className="card" style={{ background: 'var(--bg)', marginTop: 12 }}>
          <h3 style={{ color: 'var(--ink)' }}>{ed.id ? 'Editar sucursal' : 'Nueva sucursal'}</h3>
          <div className="two">
            <div className="fld"><label htmlFor="s-n">Nombre</label><input id="s-n" value={ed.nombre} onChange={(e) => setEd({ ...ed, nombre: e.target.value })} /></div>
            <div className="fld"><label htmlFor="s-u">Unidad de negocio</label><input id="s-u" list="unidades-dl" value={ed.unidad_negocio} onChange={(e) => setEd({ ...ed, unidad_negocio: e.target.value })} />
              <datalist id="unidades-dl">{unidades.map((u) => <option key={u} value={u} />)}</datalist></div>
          </div>
          <div className="two">
            <div className="fld"><label htmlFor="s-d">Días de operación</label>
              <select id="s-d" value={ed.dias_operacion} onChange={(e) => setEd({ ...ed, dias_operacion: e.target.value })}>
                <option value={7}>Lunes a lunes</option><option value={6}>Lunes a sábado</option><option value={5}>Lunes a viernes</option></select></div>
            <div className="fld"><label htmlFor="s-c">Coordenadas (de Google Maps)</label><input id="s-c" placeholder="-25.2820, -57.6350" value={ed.coords} onChange={(e) => setEd({ ...ed, coords: e.target.value })} /></div>
          </div>
          <div className="fld"><label htmlFor="s-dir">Dirección</label><input id="s-dir" value={ed.direccion} onChange={(e) => setEd({ ...ed, direccion: e.target.value })} /></div>
          <label className="chk"><input type="checkbox" checked={ed.activa} onChange={(e) => setEd({ ...ed, activa: e.target.checked })} /> Sucursal activa</label>
          <div className="acts">
            {ed.id && <button className="btn danger" style={{ marginRight: 'auto' }} onClick={async () => { if (window.confirm('¿Eliminar «' + ed.nombre + '» y todas sus tareas?')) { if (await borrar('mnt_sucursales', ed.id, 'Sucursal eliminada')) setEd(null); } }}>Eliminar</button>}
            <button className="btn" onClick={() => setEd(null)}>Cancelar</button><button className="btn primary" onClick={guardarEd}>Guardar</button>
          </div>
        </div>
      )}
      <div className="tw" style={{ marginTop: 12 }}>
        <table className="t">
          <thead><tr><th>Sucursal</th><th>Unidad</th><th>Días</th><th>Ubicación</th><th>Inventario</th><th></th></tr></thead>
          <tbody>
            {lista.map((s) => (
              <tr key={s.id} style={{ opacity: s.activa ? 1 : 0.5 }}>
                <td><b>{s.nombre}</b></td><td>{s.unidad_negocio}</td>
                <td>{s.dias_operacion >= 7 ? 'L–L' : s.dias_operacion === 6 ? 'L–S' : 'L–V'}</td>
                <td>{s.lat != null ? <span className="mono">{s.lat.toFixed(4)}, {s.lng.toFixed(4)}</span> : <span className="pill pend">Falta</span>}</td>
                <td>{s.inventario ? 'Relevado' : 'Sin relevar'}</td>
                <td><button className="btn" onClick={() => editar(s)}>Editar</button></td>
              </tr>
            ))}
            {lista.length === 0 && <tr><td colSpan="6" className="hint">No hay sucursales para mostrar.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ---------- Catálogo ---------- */
function Catalogo() {
  const { catalogo, guardar } = useData();
  const toast = useToast();
  const [n, setN] = useState({ nombre: '', especialidad: 'Electricidad', unidad_medida: 'unidad', minutos: 30 });
  const activos = catalogo.filter((c) => c.activo);
  const agregar = async () => {
    if (!n.nombre.trim()) { toast('Escribe el nombre de la tarea.'); return; }
    if (await guardar('mnt_catalogo', null, { ...n, nombre: n.nombre.trim(), minutos: Math.max(1, parseInt(n.minutos, 10) || 30) }, 'Tarea agregada al catálogo')) setN({ ...n, nombre: '' });
  };
  return (
    <>
      <h2>Catálogo de tareas</h2>
      <p className="hint">El tiempo estimado por unidad alimenta la carga de cada cuadrilla en el planificador.</p>
      <div className="tw"><table className="t">
        <thead><tr><th>Tarea</th><th>Especialidad</th><th>Se cuenta por</th><th>Minutos</th><th></th></tr></thead>
        <tbody>{activos.map((c) => (
          <tr key={c.id}>
            <td><input defaultValue={c.nombre} style={{ minWidth: 190 }} aria-label="Nombre" onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== c.nombre) guardar('mnt_catalogo', c.id, { nombre: v }); }} /></td>
            <td><select value={c.especialidad} aria-label="Especialidad" onChange={(e) => guardar('mnt_catalogo', c.id, { especialidad: e.target.value })}>{ESPS.map((x) => <option key={x}>{x}</option>)}</select></td>
            <td><select value={c.unidad_medida} aria-label="Unidad" onChange={(e) => guardar('mnt_catalogo', c.id, { unidad_medida: e.target.value })}>{UNIDADES.map((x) => <option key={x}>{x}</option>)}</select></td>
            <td><input type="number" min="1" defaultValue={c.minutos} style={{ width: 80 }} aria-label="Minutos" onBlur={(e) => { const v = Math.max(1, parseInt(e.target.value, 10) || c.minutos); if (v !== c.minutos) guardar('mnt_catalogo', c.id, { minutos: v }); }} /></td>
            <td><button className="btn danger" onClick={() => guardar('mnt_catalogo', c.id, { activo: false }, 'Tarea quitada del catálogo')}>Quitar</button></td>
          </tr>))}</tbody>
      </table></div>
      <div className="inl">
        <input placeholder="Nueva tarea, por ejemplo Cambiar tubo LED" value={n.nombre} onChange={(e) => setN({ ...n, nombre: e.target.value })} aria-label="Nueva tarea" />
        <select value={n.especialidad} onChange={(e) => setN({ ...n, especialidad: e.target.value })} aria-label="Especialidad">{ESPS.map((x) => <option key={x}>{x}</option>)}</select>
        <select value={n.unidad_medida} onChange={(e) => setN({ ...n, unidad_medida: e.target.value })} aria-label="Unidad">{UNIDADES.map((x) => <option key={x}>{x}</option>)}</select>
        <input type="number" min="1" value={n.minutos} onChange={(e) => setN({ ...n, minutos: e.target.value })} aria-label="Minutos" />
        <button className="btn primary" onClick={agregar}>Agregar</button>
      </div>
    </>
  );
}

/* ---------- Tipos de activo ---------- */
function Activos() {
  const { tipos, guardar, borrar } = useData();
  const toast = useToast();
  const [t, setT] = useState('');
  const agregar = async () => {
    if (!t.trim()) { toast('Escribe el nombre del tipo de activo.'); return; }
    const clave = slug(t);
    if (tipos.some((x) => x.clave === clave)) { toast('Ese tipo de activo ya existe.'); return; }
    if (await guardar('mnt_tipos_activo', null, { clave, etiqueta: t.trim(), orden: tipos.length + 1 }, 'Tipo de activo agregado')) setT('');
  };
  return (
    <>
      <h2>Tipos de activo</h2>
      <p className="hint">Lo que se cuenta en la ficha de cada sucursal. Agrega los que necesites sin tocar código.</p>
      <div className="chips">{tipos.map((a) => <span className="achip" key={a.id}>{a.etiqueta}<button aria-label={'Quitar ' + a.etiqueta} onClick={() => borrar('mnt_tipos_activo', a.id, 'Tipo de activo quitado')}>×</button></span>)}</div>
      <div className="inl"><input placeholder="Nuevo tipo, por ejemplo Aires acondicionados" value={t} onChange={(e) => setT(e.target.value)} aria-label="Nuevo tipo de activo" /><button className="btn primary" onClick={agregar}>Agregar</button></div>
    </>
  );
}

/* ---------- Cuadrillas ---------- */
function Cuadrillas() {
  const { cuadrillas, perfiles, guardar, borrar, refresh } = useData();
  const activos = perfiles.filter((p) => p.activo);
  const agregar = async (c, id) => { if (!id) return; if (await guardar('mnt_perfiles', id, { cuadrilla_id: c.id }, 'Integrante agregado')) refresh('perfiles'); };
  const quitar = async (c, u) => { if (await guardar('mnt_perfiles', u.id, { cuadrilla_id: null }, 'Integrante quitado')) refresh('perfiles'); };
  const quitarSuelto = (c, n) => guardar('mnt_cuadrillas', c.id, { integrantes: c.integrantes.filter((x) => x !== n) });
  const nueva = () => guardar('mnt_cuadrillas', null, { nombre: 'Cuadrilla ' + (cuadrillas.length + 1), integrantes: [], especialidades: ['Electricidad'], color: '#0E5C78', orden: cuadrillas.length + 1 }, 'Cuadrilla creada');
  return (
    <>
      <h2>Cuadrillas y especialidades</h2>
      <p className="hint">Hoy Pedro y Rubén hacen solo electricidad. Cuando vuelvan a plomería y albañilería, activa esas especialidades aquí y el planificador deja de avisar.</p>
      <div className="grid-auto">
        {cuadrillas.map((c) => (
          <div className="card" style={{ background: 'var(--bg)' }} key={c.id}>
            <div className="fld"><label>Nombre</label><input defaultValue={c.nombre} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== c.nombre) guardar('mnt_cuadrillas', c.id, { nombre: v }); }} /></div>
            <div className="fld"><label>Integrantes</label>
              <div className="chips">
                {(() => { const m = miembrosDe(c, perfiles); return (<>
                  {m.usuarios.map((u) => <span className="achip" key={u.id}>{u.nombre}<button aria-label={'Quitar ' + u.nombre} onClick={() => quitar(c, u)}>×</button></span>)}
                  {m.sueltos.map((n) => <span className="achip" key={n} title="Nombre escrito a mano, sin usuario vinculado">{n} (sin usuario)<button aria-label={'Quitar ' + n} onClick={() => quitarSuelto(c, n)}>×</button></span>)}
                  {!m.usuarios.length && !m.sueltos.length && <span className="hint">Sin integrantes todavía.</span>}
                </>); })()}
              </div>
              <select value="" onChange={(e) => agregar(c, e.target.value)} aria-label={'Agregar integrante a ' + c.nombre}>
                <option value="">+ Agregar integrante del padrón…</option>
                {activos.filter((p) => p.cuadrilla_id !== c.id).map((p) => {
                  const otra = p.cuadrilla_id && cuadrillas.find((x) => x.id === p.cuadrilla_id);
                  return <option key={p.id} value={p.id}>{p.nombre}{otra ? ' (está en ' + otra.nombre + ')' : ''}</option>;
                })}
              </select>
              <p className="hint">El padrón son los empleados creados en la pestaña Empleados. Cada persona pertenece a una sola cuadrilla.</p>
            </div>
            <div className="esps">{ESPS.map((e) => (
              <label key={e}><input type="checkbox" checked={c.especialidades.includes(e)} onChange={(ev) => guardar('mnt_cuadrillas', c.id, { especialidades: ev.target.checked ? [...c.especialidades, e] : c.especialidades.filter((x) => x !== e) })} />{e}</label>))}</div>
            <div className="inl" style={{ alignItems: 'center' }}>
              <label className="chk">Color <input type="color" defaultValue={c.color} onBlur={(e) => { if (e.target.value !== c.color) guardar('mnt_cuadrillas', c.id, { color: e.target.value }); }} style={{ width: 44, padding: 0 }} /></label>
              <button className="btn danger" onClick={() => { if (window.confirm('¿Eliminar la cuadrilla «' + c.nombre + '»?')) borrar('mnt_cuadrillas', c.id, 'Cuadrilla eliminada'); }}>Eliminar</button>
            </div>
          </div>))}
      </div>
      <div className="inl"><button className="btn primary" onClick={nueva}>+ Nueva cuadrilla</button></div>
    </>
  );
}

/* ---------- Empleados ---------- */
function Empleados() {
  const { perfiles, cuadrillas, roles, perfil, deptos, guardar, crearUsuario, cambiarClave, eliminarUsuario } = useData();
  const toast = useToast();
  const vacio = { nombre: '', email: '', password: '', rol: 'tecnico', cuadrilla: '', departamento: '' };
  // el chofer necesita departamento (define sus móviles); el supervisor de OT sin departamento ve todos
  const usaDepto = (clave) => { const r = roles.find((x) => x.clave === clave); return Boolean(r && r.p_ot_chofer); };
  const [nuevo, setNuevo] = useState(null);
  const [clave, setClave] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const crear = async () => {
    if (!nuevo.nombre.trim() || !nuevo.email.trim()) { toast('Escribe el nombre y el correo.'); return; }
    if (nuevo.password.length < 6) { toast('La contraseña debe tener al menos 6 caracteres.'); return; }
    if (roles.some((r) => r.clave === nuevo.rol && r.p_ot_chofer) && !nuevo.departamento) { toast('Elige el departamento del chofer: define qué móviles puede usar.'); return; }
    setOcupado(true);
    const ok = await crearUsuario({ ...nuevo, nombre: nuevo.nombre.trim(), email: nuevo.email.trim() });
    setOcupado(false);
    if (ok) { toast('Empleado creado. Ya puede ingresar con su correo y contraseña.'); setNuevo(null); }
  };
  const guardarClave = async () => {
    if (clave.valor.length < 6) { toast('La contraseña debe tener al menos 6 caracteres.'); return; }
    if (await cambiarClave(clave.id, clave.valor)) { toast('Contraseña cambiada'); setClave(null); }
  };
  return (
    <>
      <h2>Empleados</h2>
      <p className="hint">Crea aquí a cada persona con su correo y contraseña. Entrega esos datos al empleado: con ellos ingresa al sitio. Su rol define lo que puede ver y hacer; los técnicos necesitan además una cuadrilla, y los choferes y supervisores de OT un departamento.</p>
      <div className="inl" style={{ marginTop: 0 }}>
        <button className="btn primary" onClick={() => setNuevo(vacio)}>+ Nuevo empleado</button>
      </div>
      {nuevo && (
        <div className="card" style={{ background: 'var(--bg)', marginTop: 12 }}>
          <h3 style={{ color: 'var(--ink)' }}>Nuevo empleado</h3>
          <div className="two">
            <div className="fld"><label htmlFor="e-n">Nombre</label><input id="e-n" value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} /></div>
            <div className="fld"><label htmlFor="e-c">Correo</label><input id="e-c" type="email" autoComplete="off" value={nuevo.email} onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })} /></div>
          </div>
          <div className="two">
            <div className="fld"><label htmlFor="e-p">Contraseña (mínimo 6 caracteres)</label><input id="e-p" type="text" autoComplete="off" value={nuevo.password} onChange={(e) => setNuevo({ ...nuevo, password: e.target.value })} /></div>
            <div className="fld"><label htmlFor="e-r">Rol</label>
              <select id="e-r" value={nuevo.rol} onChange={(e) => setNuevo({ ...nuevo, rol: e.target.value })}>{roles.map((r) => <option key={r.id} value={r.clave}>{r.nombre}</option>)}</select></div>
          </div>
          <div className="two">
            <div className="fld"><label htmlFor="e-q">Cuadrilla (para técnicos)</label>
              <select id="e-q" value={nuevo.cuadrilla} onChange={(e) => setNuevo({ ...nuevo, cuadrilla: e.target.value })}><option value="">Sin cuadrilla</option>{cuadrillas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div>
            <div className="fld"><label htmlFor="e-d">Departamento (choferes y supervisores de OT)</label>
              <select id="e-d" value={nuevo.departamento} onChange={(e) => setNuevo({ ...nuevo, departamento: e.target.value })}><option value="">{usaDepto(nuevo.rol) ? 'Elige el departamento…' : 'Sin departamento'}</option>{deptos.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}</select></div>
          </div>
          <div className="acts"><button className="btn" onClick={() => setNuevo(null)}>Cancelar</button><button className="btn primary" disabled={ocupado} onClick={crear}>{ocupado ? 'Creando…' : 'Crear empleado'}</button></div>
        </div>
      )}
      {clave && (
        <div className="card" style={{ background: 'var(--bg)', marginTop: 12 }}>
          <h3 style={{ color: 'var(--ink)' }}>Nueva contraseña para {clave.nombre}</h3>
          <div className="inl" style={{ marginTop: 0 }}>
            <input type="text" autoComplete="off" placeholder="Mínimo 6 caracteres" value={clave.valor} onChange={(e) => setClave({ ...clave, valor: e.target.value })} aria-label="Nueva contraseña" />
            <button className="btn primary" onClick={guardarClave}>Guardar</button><button className="btn" onClick={() => setClave(null)}>Cancelar</button>
          </div>
        </div>
      )}
      <div className="tw" style={{ marginTop: 12 }}>
        <table className="t">
          <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Cuadrilla</th><th>Departamento</th><th>Activo</th><th></th></tr></thead>
          <tbody>{perfiles.map((p) => {
            const yo = p.id === perfil.id;
            return (
              <tr key={p.id}>
                <td><input defaultValue={p.nombre} aria-label="Nombre" onBlur={(e) => { const v = e.target.value.trim(); if (v !== p.nombre) guardar('mnt_perfiles', p.id, { nombre: v }); }} /></td>
                <td>{p.email}</td>
                <td><select value={p.rol} disabled={yo} aria-label={'Rol de ' + p.nombre} onChange={(e) => guardar('mnt_perfiles', p.id, { rol: e.target.value }, 'Rol actualizado')}>{roles.map((r) => <option key={r.id} value={r.clave}>{r.nombre}</option>)}</select></td>
                <td><select value={p.cuadrilla_id || ''} aria-label={'Cuadrilla de ' + p.nombre} onChange={(e) => guardar('mnt_perfiles', p.id, { cuadrilla_id: e.target.value || null }, 'Cuadrilla actualizada')}><option value="">Sin cuadrilla</option>{cuadrillas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></td>
                <td><select value={p.departamento_id || ''} aria-label={'Departamento de ' + p.nombre} onChange={(e) => guardar('mnt_perfiles', p.id, { departamento_id: e.target.value || null }, 'Departamento actualizado')}><option value="">{usaDepto(p.rol) ? 'Falta elegir' : '—'}</option>{deptos.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}</select></td>
                <td><input type="checkbox" checked={p.activo} disabled={yo} aria-label={'Activo: ' + p.nombre} onChange={(e) => guardar('mnt_perfiles', p.id, { activo: e.target.checked }, e.target.checked ? 'Empleado activado' : 'Empleado desactivado')} /></td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn" onClick={() => setClave({ id: p.id, nombre: p.nombre || p.email, valor: '' })}>Contraseña</button>{' '}
                  <button className="btn danger" disabled={yo} onClick={async () => { if (window.confirm('¿Eliminar a ' + (p.nombre || p.email) + '? Ya no podrá ingresar. Sus tareas hechas se conservan.')) { if (await eliminarUsuario(p.id)) toast('Empleado eliminado'); } }}>Eliminar</button>
                </td>
              </tr>);
          })}</tbody>
        </table>
      </div>
      <p className="hint">Para dejar de usar a alguien sin borrarlo, desmarca «Activo». No puedes cambiar tu propio rol ni desactivarte.</p>
    </>
  );
}

/* ---------- Roles ---------- */
const PERMISOS = [
  ['p_mapa', 'Ver el mapa de sucursales y sus fichas'],
  ['p_planificar', 'Planificar y editar tareas'],
  ['p_panel', 'Ver el panel del director (solo lectura)'],
  ['p_parametros', 'Administrar parámetros, roles y empleados'],
  ['p_operar', 'Trabajar en terreno desde el celular (llegué, fotos, terminé)'],
  ['p_gastos', 'Registrar cotizaciones y gastos de materiales por sucursal (quien tiene Panel solo los ve)'],
  ['p_ot_chofer', 'OT · Manejar un móvil: generar y aceptar órdenes, QR de garita y llegada por GPS'],
  ['p_ot_guardia', 'OT · Garita: escanear el QR y registrar salidas y entradas de los móviles'],
  ['p_ot_supervisar', 'OT · Supervisar: panel en vivo, asignar y cancelar órdenes, reportes (de su departamento, o de todos si no tiene)']
];
const ROL_NUEVO = { nombre: '', descripcion: '', p_mapa: true, p_planificar: false, p_panel: false, p_parametros: false, p_operar: false, p_gastos: false, p_ot_chofer: false, p_ot_guardia: false, p_ot_supervisar: false };
function Roles() {
  const { roles, perfiles, guardar, borrar } = useData();
  const toast = useToast();
  const [n, setN] = useState(ROL_NUEVO);
  const enUso = (clave) => perfiles.filter((p) => p.rol === clave).length;
  const crear = async () => {
    const nombre = n.nombre.trim();
    if (!nombre) { toast('Escribe el nombre del rol.'); return; }
    let clave = slug(nombre), i = 2;
    while (roles.some((r) => r.clave === clave)) { clave = slug(nombre) + '_' + i++; }
    const permisos = Object.fromEntries(PERMISOS.map(([k]) => [k, n[k]]));
    if (await guardar('mnt_roles', null, { clave, nombre, descripcion: n.descripcion.trim(), ...permisos }, 'Rol creado')) setN(ROL_NUEVO);
  };
  return (
    <>
      <h2>Roles</h2>
      <p className="hint">Un rol es un conjunto de permisos. Crea los que necesites (por ejemplo «Jefe de mantenimiento») y asígnalos a cada empleado en la pestaña Empleados. El rol Administrador no se puede modificar.</p>
      <div className="grid-auto">
        {roles.map((r) => {
          const fijo = r.clave === 'admin';
          return (
            <div className="card" style={{ background: 'var(--bg)' }} key={r.id}>
              <div className="fld"><label>Nombre</label><input defaultValue={r.nombre} disabled={fijo} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== r.nombre) guardar('mnt_roles', r.id, { nombre: v }); }} /></div>
              <div className="fld"><label>Descripción (la ve cada empleado al ingresar)</label><textarea rows="2" defaultValue={r.descripcion} disabled={fijo} onBlur={(e) => { const v = e.target.value.trim(); if (v !== r.descripcion) guardar('mnt_roles', r.id, { descripcion: v }); }} /></div>
              <div className="esps" style={{ flexDirection: 'column', gap: 6 }}>
                {PERMISOS.map(([k, l]) => (
                  <label key={k}><input type="checkbox" checked={Boolean(r[k])} disabled={fijo} onChange={(e) => guardar('mnt_roles', r.id, { [k]: e.target.checked })} />{l}</label>))}
              </div>
              <div className="sub" style={{ marginBottom: 8 }}>{enUso(r.clave)} empleado(s) con este rol{r.sistema ? ' · rol del sistema' : ''}</div>
              {!r.sistema && <button className="btn danger" onClick={async () => {
                if (enUso(r.clave)) { toast('Hay empleados con este rol. Cámbiales el rol antes de borrarlo.'); return; }
                if (window.confirm('¿Eliminar el rol «' + r.nombre + '»?')) borrar('mnt_roles', r.id, 'Rol eliminado');
              }}>Eliminar rol</button>}
            </div>);
        })}
      </div>
      <div className="card" style={{ background: 'var(--bg)', marginTop: 16 }}>
        <h3 style={{ color: 'var(--ink)' }}>Nuevo rol</h3>
        <div className="two">
          <div className="fld"><label htmlFor="r-n">Nombre</label><input id="r-n" value={n.nombre} placeholder="Jefe de mantenimiento" onChange={(e) => setN({ ...n, nombre: e.target.value })} /></div>
          <div className="fld"><label htmlFor="r-d">Descripción</label><input id="r-d" value={n.descripcion} placeholder="Qué hace esta persona" onChange={(e) => setN({ ...n, descripcion: e.target.value })} /></div>
        </div>
        <div className="esps" style={{ flexDirection: 'column', gap: 6 }}>
          {PERMISOS.map(([k, l]) => <label key={k}><input type="checkbox" checked={n[k]} onChange={(e) => setN({ ...n, [k]: e.target.checked })} />{l}</label>)}
        </div>
        <div className="acts"><button className="btn primary" onClick={crear}>Crear rol</button></div>
      </div>
    </>
  );
}

/* ---------- Jornada y unidades ---------- */
function General() {
  const { jornada, unidades, guardarParam } = useData();
  const toast = useToast();
  const [u, setU] = useState('');
  return (
    <>
      <h2>Jornada y unidades de negocio</h2>
      <div className="fld" style={{ maxWidth: 280 }}>
        <label htmlFor="jor">Minutos de trabajo por día</label>
        <input id="jor" type="number" min="60" step="30" defaultValue={jornada} onBlur={(e) => { const v = Math.max(60, parseInt(e.target.value, 10) || 480); if (v !== jornada) guardarParam('jornada_minutos', v).then(() => toast('Jornada actualizada')); }} />
      </div>
      <p className="hint">Define cuándo una cuadrilla queda sobrecargada en el planificador.</p>
      <h3 style={{ marginTop: 20 }}>Unidades de negocio</h3>
      <div className="chips">{unidades.map((x) => <span className="achip" key={x}>{x}<button aria-label={'Quitar ' + x} onClick={() => guardarParam('unidades', unidades.filter((y) => y !== x))}>×</button></span>)}</div>
      <div className="inl"><input placeholder="Nueva unidad de negocio" value={u} onChange={(e) => setU(e.target.value)} aria-label="Nueva unidad" />
        <button className="btn primary" onClick={() => { const v = u.trim(); if (!v || unidades.includes(v)) return; guardarParam('unidades', [...unidades, v]).then(() => setU('')); }}>Agregar</button></div>
    </>
  );
}

export default function Parametros() {
  const [tab, setTab] = useState('suc');
  const tabs = [['suc', 'Sucursales', Sucursales], ['cat', 'Catálogo de tareas', Catalogo], ['act', 'Tipos de activo', Activos], ['cua', 'Cuadrillas', Cuadrillas], ['usr', 'Empleados', Empleados], ['rol', 'Roles', Roles], ['gen', 'Jornada', General],
    ['dep', 'Departamentos', Departamentos], ['mov', 'Móviles', Moviles], ['ubi', 'Ubicaciones OT', Ubicaciones], ['aud', 'Auditoría', Auditoria]];
  const Vista = tabs.find((t) => t[0] === tab)[2];
  return (
    <>
      <div className="tabs" role="tablist" style={{ marginTop: 0 }}>
        {tabs.map(([k, l]) => <button key={k} onClick={() => setTab(k)} aria-current={tab === k ? 'page' : undefined}>{l}</button>)}
      </div>
      <div className="card" style={{ marginTop: 16 }}><Vista /></div>
    </>
  );
}
