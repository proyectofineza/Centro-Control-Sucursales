import { useEffect, useMemo, useRef, useState } from 'react';
import { useData, useToast } from '../lib/store';
import GastosSucursal from '../components/Gastos';
import { fmtMin, gs, kmEntre, minutosDe } from '../lib/util';

const clave = (id) => 'mnt_borrador_' + id;
const leer = (id) => { try { return JSON.parse(localStorage.getItem(clave(id)) || 'null'); } catch (e) { return null; } };
const escribir = (id, v) => { try { localStorage.setItem(clave(id), JSON.stringify(v)); } catch (e) { /* sin almacenamiento: no pasa nada */ } };
const limpiar = (id) => { try { localStorage.removeItem(clave(id)); } catch (e) { /* idem */ } };

function Relevar({ s, onVolver }) {
  const { catalogo, tareas, tipos, catById, veGastos, guardarRelevamiento } = useData();
  const toast = useToast();
  const items = useMemo(() => catalogo.filter((c) => c.activo), [catalogo]);
  const existentes = useMemo(() => tareas.filter((t) => t.sucursal_id === s.id && t.estado === 'pendiente'), [tareas, s.id]);
  const inicial = () => {
    const base = {};
    existentes.forEach((t) => { if (!base[t.catalogo_id]) base[t.catalogo_id] = { cantidad: t.cantidad, nota: t.nota || '' }; });
    const b = leer(s.id);
    return b && b.l ? { ...base, ...b.l } : base;
  };
  const [lin, setLin] = useState(inicial);
  const [borrador, setBorrador] = useState(() => Boolean(leer(s.id)));
  const [guardando, setGuardando] = useState(false);
  const [paso, setPaso] = useState('trabajos');

  const tocado = useRef(false);
  const cambiar = (id, patch) => setLin((l) => {
    const cur = { cantidad: 0, nota: '', ...(l[id] || {}) };
    tocado.current = true;
    return { ...l, [id]: { ...cur, ...(typeof patch === 'function' ? patch(cur) : patch) } };
  });
  useEffect(() => { if (tocado.current) { escribir(s.id, { l: lin }); setBorrador(true); } }, [lin, s.id]);
  const cant = (id) => Math.max(0, Math.floor(Number((lin[id] || {}).cantidad) || 0));
  const marcados = items.filter((c) => cant(c.id) > 0);
  const minutos = marcados.reduce((a, c) => a + minutosDe({ cantidad: cant(c.id) }, c), 0);
  const faltaNota = marcados.find((c) => /^otro trabajo/i.test(c.nombre) && !((lin[c.id] || {}).nota || '').trim());

  const guardar = async () => {
    if (faltaNota) { toast('Describe el «Otro trabajo» en el detalle.'); return; }
    setGuardando(true);
    const r = await guardarRelevamiento(s.id, items.map((c) => ({ catalogo_id: c.id, cantidad: cant(c.id), nota: (lin[c.id] || {}).nota })));
    setGuardando(false);
    if (!r) return;
    tocado.current = false; limpiar(s.id); setBorrador(false);
    toast('Relevamiento guardado: ' + marcados.length + ' trabajo(s) listos para asignar.');
    setPaso('materiales');
  };

  const grupos = {};
  items.forEach((c) => { (grupos[c.especialidad] = grupos[c.especialidad] || []).push(c); });
  const inv = s.inventario;
  const invTxt = inv ? tipos.filter((a) => inv[a.clave] > 0).map((a) => inv[a.clave] + ' ' + a.etiqueta.toLowerCase()).join(' · ') : '';

  return (
    <>
      <button className="btn" onClick={onVolver} style={{ marginBottom: 10 }}>← Sucursales</button>
      <div className="card">
        <h2 style={{ marginBottom: 4 }}>{s.nombre}</h2>
        <div className="sub">{s.unidad_negocio}{s.direccion ? ' · ' + s.direccion : ''}</div>
        <p className="hint" style={{ marginBottom: 0 }}>{inv ? 'Inventario: ' + (invTxt || 'sin cantidades cargadas') : 'Inventario sin relevar.'}</p>
      </div>
      <div className="tabs" role="tablist" aria-label="Pasos del relevamiento">
        <button onClick={() => setPaso('trabajos')} aria-current={paso === 'trabajos' ? 'page' : undefined}>1 · Trabajos</button>
        {veGastos && <button onClick={() => setPaso('materiales')} aria-current={paso === 'materiales' ? 'page' : undefined}>2 · Materiales</button>}
      </div>
      {paso === 'trabajos' && (
        <>
          {borrador && <div className="note">Tienes cambios sin guardar en esta sucursal (quedan en este teléfono hasta que guardes).</div>}
          {Object.keys(grupos).map((esp) => (
            <div className="card" style={{ marginBottom: 12 }} key={esp}>
              <h3>{esp}</h3>
              {grupos[esp].map((c) => {
                const n = cant(c.id), porUnidad = c.unidad_medida === 'unidad';
                const ya = existentes.find((t) => t.catalogo_id === c.id);
                return (
                  <div key={c.id} style={{ borderTop: '1px solid var(--line)', paddingBlock: 8 }}>
                    <div className="stepper" style={{ border: 0, padding: 0 }}>
                      <span><b>{c.nombre}</b><span className="sub" style={{ display: 'block' }}>{porUnidad ? fmtMin(c.minutos) + ' por unidad' : fmtMin(c.minutos) + (c.unidad_medida === 'sucursal' ? ' por sucursal' : ' por visita')}{ya && ya.cuadrilla_id ? ' · ya programada' : ''}</span></span>
                      {porUnidad ? (
                        <div>
                          <button aria-label={'Menos ' + c.nombre} onClick={() => cambiar(c.id, (x) => ({ cantidad: Math.max(0, (Math.floor(Number(x.cantidad)) || 0) - 1) }))}>−</button>
                          <input type="number" inputMode="numeric" min="0" value={n || ''} placeholder="0" aria-label={'Cantidad de ' + c.nombre} onChange={(e) => cambiar(c.id, { cantidad: e.target.value })} />
                          <button aria-label={'Más ' + c.nombre} onClick={() => cambiar(c.id, (x) => ({ cantidad: (Math.floor(Number(x.cantidad)) || 0) + 1 }))}>+</button>
                        </div>
                      ) : (
                        <button className={'btn' + (n ? ' primary' : '')} aria-pressed={n > 0} onClick={() => cambiar(c.id, { cantidad: n ? 0 : 1 })}>{n ? '✓ Hace falta' : 'Hace falta'}</button>
                      )}
                    </div>
                    {n > 0 && <input style={{ width: '100%', marginTop: 8 }} placeholder={/^otro trabajo/i.test(c.nombre) ? 'Describe el trabajo (obligatorio)' : 'Detalle o dónde (opcional)'} value={(lin[c.id] || {}).nota || ''} onChange={(e) => cambiar(c.id, { nota: e.target.value })} aria-label={'Detalle de ' + c.nombre} />}
                  </div>
                );
              })}
            </div>
          ))}
          <div className="stickybar">
            <div><b>{marcados.length}</b> trabajo(s) · <b>{fmtMin(minutos)}</b> estimadas</div>
            <button className="btn primary" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar relevamiento'}</button>
          </div>
        </>
      )}
      {paso === 'materiales' && veGastos && <GastosSucursal sucId={s.id} />}
    </>
  );
}

export default function Relevamiento({ selId, onSel }) {
  const { sucursales, tareas, gastos, veGastos, sucById } = useData();
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState('todas');
  const [pos, setPos] = useState(null);
  const toast = useToast();
  useEffect(() => { window.scrollTo(0, 0); }, [selId]);

  const pend = useMemo(() => {
    const m = new Map();
    tareas.forEach((t) => { if (t.estado === 'pendiente') m.set(t.sucursal_id, (m.get(t.sucursal_id) || 0) + 1); });
    return m;
  }, [tareas]);
  const cot = useMemo(() => {
    const m = new Map();
    gastos.forEach((g) => { if (g.estado !== 'comprado') m.set(g.sucursal_id, (m.get(g.sucursal_id) || 0) + (Number(g.monto) || 0)); });
    return m;
  }, [gastos]);
  const norm = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const activas = sucursales.filter((s) => s.activa);
  const hechas = activas.filter((s) => s.trabajos_relevados_en).length;
  const lista = useMemo(() => {
    let l = activas.filter((s) => norm(s.nombre).includes(norm(q)) && (filtro === 'todas' || (filtro === 'sin' ? !s.trabajos_relevados_en : Boolean(s.trabajos_relevados_en))));
    if (pos) l = [...l].sort((a, b) => (a.lat == null) - (b.lat == null) || (a.lat == null ? 0 : kmEntre(pos.la, pos.ln, a.lat, a.lng) - kmEntre(pos.la, pos.ln, b.lat, b.lng)));
    return l;
  }, [activas, q, filtro, pos]);

  const s = selId && sucById.get(selId);
  if (s) return <Relevar key={s.id} s={s} onVolver={() => onSel(null)} />;

  const cerca = () => {
    if (!navigator.geolocation) { toast('Este navegador no permite ubicarte.'); return; }
    navigator.geolocation.getCurrentPosition((p) => setPos({ la: p.coords.latitude, ln: p.coords.longitude }), () => toast('No pude obtener tu ubicación. Revisa el permiso del navegador.'), { enableHighAccuracy: true, timeout: 10000 });
  };

  return (
    <>
      <div className="perhead">
        <h2>Relevamiento de trabajos</h2>
        <span className="tag">{hechas} de {activas.length} relevadas</span>
      </div>
      <p className="hint" style={{ marginTop: 0 }}>Elige la sucursal que estás visitando, marca los trabajos que hacen falta y carga los materiales cotizados. Las tareas quedan en «Sin asignar» del planificador.</p>
      <div className="inl" style={{ marginTop: 0 }}>
        <input type="search" placeholder="Buscar sucursal…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar sucursal" />
        <button className="btn" onClick={cerca}>{pos ? 'Ordenadas por cercanía' : 'Ordenar por cercanía'}</button>
      </div>
      <div className="seg" role="group" aria-label="Filtro" style={{ margin: '10px 0' }}>
        {[['todas', 'Todas'], ['sin', 'Sin relevar'], ['rel', 'Relevadas']].map(([k, l]) => <button key={k} aria-pressed={filtro === k} onClick={() => setFiltro(k)}>{l}</button>)}
      </div>
      <div className="card">
        {lista.length === 0 && <p className="hint" style={{ margin: 0 }}>No hay sucursales con ese filtro.</p>}
        {lista.map((x) => (
          <div className="row click" key={x.id} onClick={() => onSel(x.id)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onSel(x.id); }}>
            <div style={{ minWidth: 0 }}>
              <b>{x.nombre}</b>
              <div className="sub">{x.unidad_negocio}{pos && x.lat != null ? ' · a ' + kmEntre(pos.la, pos.ln, x.lat, x.lng).toFixed(1) + ' km' : ''}</div>
              {x.trabajos_relevados_en && <div className="sub">Relevada el {new Date(x.trabajos_relevados_en).toLocaleDateString('es-PY')} · {pend.get(x.id) || 0} trabajo(s) pendiente(s){veGastos && cot.get(x.id) ? ' · por pagar ' + gs(cot.get(x.id)) : ''}</div>}
            </div>
            <span className={'pill ' + (x.trabajos_relevados_en ? 'hecha' : 'libre')}>{x.trabajos_relevados_en ? 'Relevada' : 'Sin relevar'}</span>
          </div>
        ))}
      </div>
    </>
  );
}
