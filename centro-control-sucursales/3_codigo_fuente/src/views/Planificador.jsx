import { useEffect, useRef, useState } from 'react';
import Chip from '../components/Chip';
import { useData, useToast } from '../lib/store';
import { addDays, avisos, DN, fmtMin, hoy, lunesDe, MESL, minutosDe } from '../lib/util';

export default function Planificador({ onNueva, onEditar, onSemana }) {
  const { tareas, cuadrillas, catById, sucById, crewById, jornada, moverTarea } = useData();
  const toast = useToast();
  const [off, setOff] = useState(0);
  const [sobre, setSobre] = useState('');
  const arrastrando = useRef(null);
  const key = (z, c, f) => z + '|' + c + '|' + f;
  const lunes = addDays(lunesDe(hoy()), off * 7);
  const dias = Array.from({ length: 7 }, (_, i) => addDays(lunes, i));
  useEffect(() => { onSemana(lunes); }, [lunes, onSemana]);
  const pool = tareas.filter((t) => t.estado === 'pendiente' && (!t.cuadrilla_id || !t.fecha));
  const titulo = 'Semana del ' + Number(dias[0].slice(8)) + ' al ' + Number(dias[6].slice(8)) + ' de ' + MESL[Number(dias[6].slice(5, 7)) - 1];

  const soltar = async (e, cuadrilla_id, fecha, zona) => {
    e.preventDefault(); setSobre('');
    const id = arrastrando.current; arrastrando.current = null;
    const t = tareas.find((x) => x.id === id);
    if (!t) return;
    const patch = { cuadrilla_id, fecha };
    if (!cuadrilla_id) patch.estado = 'pendiente';
    const ok = await moverTarea(id, patch);
    if (!ok) return;
    if (zona === 'pool') { toast('Tarea devuelta a «Sin asignar»'); return; }
    const w = avisos({ ...t, ...patch }, { crew: crewById.get(cuadrilla_id), cat: catById.get(t.catalogo_id), suc: sucById.get(t.sucursal_id) });
    toast(w.length ? 'Movida con aviso: ' + w[0] : 'Tarea movida');
  };
  const dnd = (zona, cuad, fecha) => ({
    onDragOver: (e) => { if (arrastrando.current) { e.preventDefault(); setSobre(key(zona, cuad, fecha)); } },
    onDragLeave: () => setSobre(''),
    onDrop: (e) => soltar(e, cuad, fecha, zona)
  });
  const chipProps = { onClick: onEditar, onDragStart: (t) => { arrastrando.current = t.id; }, onDragEnd: () => { arrastrando.current = null; setSobre(''); } };

  return (
    <>
      <div className="card">
        <div className="perhead" style={{ margin: 0 }}>
          <h2 style={{ margin: 0 }}>{titulo}</h2>
          <div className="acts" style={{ margin: 0 }}>
            <button className="btn" onClick={() => setOff(off - 1)} aria-label="Semana anterior">‹ Anterior</button>
            <button className="btn" onClick={() => setOff(0)} disabled={off === 0}>Esta semana</button>
            <button className="btn" onClick={() => setOff(off + 1)} aria-label="Semana siguiente">Siguiente ›</button>
            <button className="btn primary" onClick={() => onNueva('')}>+ Programar tarea</button>
          </div>
        </div>
        <p className="hint" style={{ marginBottom: 0 }}>Arrastra una tarea a una cuadrilla y un día, o haz clic para editarla. Las tareas terminadas quedan fijas. El signo ! avisa si la tarea no corresponde a la cuadrilla o a la sucursal ese día.</p>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h2>Sin asignar ({pool.length})</h2>
        <div className={'pool' + (sobre === key('pool', null, null) ? ' over' : '')} {...dnd('pool', null, null)}>
          {pool.length ? pool.map((t) => <Chip key={t.id} t={t} {...chipProps} />) : <span className="sub">Todo está asignado. Suelta aquí una tarea para quitarla del plan.</span>}
        </div>
      </div>
      <div className="gridwrap" style={{ marginTop: 16 }}>
        <table className="plan">
          <thead>
            <tr>
              <th className="rowh">Cuadrilla</th>
              {dias.map((d, i) => <th key={d} className={d === hoy() ? 'today' : ''}>{DN[i]} {Number(d.slice(8))}<small>{d === hoy() ? 'Hoy' : i >= 5 ? 'Fin de semana' : ' '}</small></th>)}
            </tr>
          </thead>
          <tbody>
            {cuadrillas.map((c) => (
              <tr key={c.id}>
                <td className="rowh"><b><i className="dot" style={{ background: c.color }} />{c.nombre}</b><small>{c.especialidades.join(', ')}</small></td>
                {dias.map((d, i) => {
                  const ts = tareas.filter((t) => t.cuadrilla_id === c.id && t.fecha === d);
                  const m = ts.reduce((a, t) => a + minutosDe(t, catById.get(t.catalogo_id)), 0), over = m > jornada;
                  return (
                    <td key={d} className={'cell' + (i >= 5 ? ' we' : '') + (sobre === key('cell', c.id, d) ? ' over' : '')} {...dnd('cell', c.id, d)}>
                      {ts.map((t) => <Chip key={t.id} t={t} {...chipProps} />)}
                      {ts.length > 0 && (
                        <div className={'load' + (over ? ' over' : '')}>
                          <div className="bar"><i style={{ width: Math.min(100, (m / jornada) * 100) + '%' }} /></div>
                          {fmtMin(m)} de {fmtMin(jornada)}{over ? ' · Sobrecarga' : ''}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
