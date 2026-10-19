import { useState } from 'react';
import { useData, useToast } from '../lib/store';
import { fmtDateLong, fmtMin, hoy, hora, minutosDe, nombreTarea } from '../lib/util';

export default function Tecnico() {
  const { perfil, cuadrillas, tareas, tipos, sucById, catById, puede, iniciar, terminar, subirFoto } = useData();
  const toast = useToast();
  const [borrador, setBorrador] = useState({});
  const [fotos, setFotos] = useState({});
  const [ocupado, setOcupado] = useState('');
  const [elegida, setElegida] = useState('');
  // Quien también planifica (supervisor) puede salir con cualquier cuadrilla; el técnico solo con la suya
  const multi = puede('planificar');
  const propia = cuadrillas.find((x) => x.id === perfil.cuadrilla_id);
  const c = multi ? (cuadrillas.find((x) => x.id === elegida) || propia || cuadrillas[0]) : propia;
  if (!c) return <div className="card"><h2>Sin cuadrilla</h2><p>Tu usuario todavía no tiene una cuadrilla asignada. Pídele al administrador que te asigne una en Parámetros &gt; Empleados.</p></div>;

  const h = hoy();
  const orden = { en_curso: 0, pendiente: 1, hecha: 2 };
  const mias = tareas.filter((t) => t.cuadrilla_id === c.id && (t.fecha === h || t.estado === 'en_curso' || (t.estado === 'pendiente' && t.fecha && t.fecha < h)))
    .sort((a, b) => orden[a.estado] - orden[b.estado] || (a.fecha || '').localeCompare(b.fecha || ''));
  const hechas = mias.filter((t) => t.estado === 'hecha').length;

  const invDe = (s) => borrador[s.id] || Object.fromEntries(tipos.map((a) => [a.clave, (s.inventario && s.inventario[a.clave]) || 0]));
  const paso = (s, k, d) => { const cur = invDe(s); setBorrador({ ...borrador, [s.id]: { ...cur, [k]: Math.max(0, (cur[k] || 0) + d) } }); };

  const empezar = async (t) => { setOcupado(t.id); if (await iniciar(t.id)) toast('Llegada registrada'); setOcupado(''); };
  const cerrar = async (t, s, cat) => {
    setOcupado(t.id);
    const rele = /relevar/i.test(cat ? cat.nombre : '');
    if (await terminar(t.id, rele ? invDe(s) : null)) { toast('Tarea cerrada. El director ya la ve.'); setBorrador((b) => { const n = { ...b }; delete n[s.id]; return n; }); }
    setOcupado('');
  };
  const foto = async (t, file) => {
    if (!file) return;
    setOcupado(t.id);
    const u = await subirFoto(t.id, file);
    if (u) { setFotos((f) => ({ ...f, [t.id]: [...(f[t.id] || []), u] })); toast('Foto agregada'); }
    setOcupado('');
  };

  return (
    <div className="phone">
      {multi && cuadrillas.length > 1 && (
        <div className="fld" style={{ marginBottom: 10 }}><label htmlFor="sel-cuad">Trabajando con</label>
          <select id="sel-cuad" value={c.id} onChange={(e) => setElegida(e.target.value)}>{cuadrillas.map((x) => <option key={x.id} value={x.id}>{x.nombre}{x.id === perfil.cuadrilla_id ? ' (mi cuadrilla)' : ''}</option>)}</select></div>
      )}
      <div className="ph"><h2>{c.nombre}</h2><div>{fmtDateLong(h)} · {hechas} de {mias.length} tareas hechas</div></div>
      <div className="pb">
        {mias.length === 0 && <p className="hint">No tienes tareas para hoy.</p>}
        {mias.map((t) => {
          const s = sucById.get(t.sucursal_id), cat = catById.get(t.catalogo_id);
          if (!s) return null;
          const atrasada = t.estado === 'pendiente' && t.fecha < h;
          const rele = /relevar/i.test(cat ? cat.nombre : '');
          return (
            <div className="tcard" key={t.id} style={{ '--crew': c.color }}>
              <div>
                <span className={'pill ' + (t.estado === 'hecha' ? 'hecha' : t.estado === 'en_curso' ? 'curso' : 'pend')}>
                  {t.estado === 'hecha' ? 'Hecha ' + hora(t.terminada_en) : t.estado === 'en_curso' ? 'En curso desde ' + hora(t.iniciada_en) : atrasada ? 'Pendiente de un día anterior' : 'Pendiente'}
                </span>
              </div>
              <h3>{s.nombre}</h3>
              <div>{nombreTarea(t, cat)}</div>
              <div className="sub">{s.unidad_negocio} · estimado {fmtMin(minutosDe(t, cat))}</div>
              {t.nota && <div className="note" style={{ margin: 0 }}>{t.nota}</div>}
              {t.estado === 'pendiente' && <button className="btn primary big" disabled={ocupado === t.id} onClick={() => empezar(t)}>Llegué, empezar</button>}
              {t.estado === 'en_curso' && (
                <>
                  {rele && (
                    <div>{tipos.map((a) => (
                      <div className="stepper" key={a.id}>
                        <span>{a.etiqueta}</span>
                        <div>
                          <button onClick={() => paso(s, a.clave, -1)} aria-label={'Restar ' + a.etiqueta}>−</button>
                          <b>{invDe(s)[a.clave] || 0}</b>
                          <button onClick={() => paso(s, a.clave, 1)} aria-label={'Sumar ' + a.etiqueta}>+</button>
                        </div>
                      </div>))}</div>
                  )}
                  <div className="thumbs">{(fotos[t.id] || []).map((u) => <img key={u} src={u} alt="Foto de la tarea" />)}</div>
                  <label className="btn" style={{ textAlign: 'center' }}>
                    {ocupado === t.id ? 'Subiendo…' : 'Agregar foto (' + (t.fotos || 0) + ')'}
                    <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { foto(t, e.target.files[0]); e.target.value = ''; }} />
                  </label>
                  <button className="btn primary big" disabled={ocupado === t.id} onClick={() => cerrar(t, s, cat)}>Terminé</button>
                </>
              )}
              {t.estado === 'hecha' && <div className="sub">{t.fotos || 0} foto(s) guardadas</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
