import { useData } from '../lib/store';
import { avisos, fmtMin, minutosDe, nombreTarea } from '../lib/util';

const GLIFO = { hecha: '✓', en_curso: '◔', pendiente: '○' };

export default function Chip({ t, onClick, onDragStart, onDragEnd }) {
  const { sucById, crewById, catById } = useData();
  const s = sucById.get(t.sucursal_id), c = crewById.get(t.cuadrilla_id), cat = catById.get(t.catalogo_id);
  const w = avisos(t, { crew: c, cat, suc: s });
  const mov = t.estado === 'pendiente';
  return (
    <div className={'chip st-' + t.estado} draggable={mov && !!onDragStart}
      style={{ '--crew': c ? c.color : 'var(--muted)' }} title={w.join(' ')} tabIndex={0}
      onClick={() => onClick && onClick(t)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick && onClick(t); } }}
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; onDragStart && onDragStart(t); }}
      onDragEnd={() => onDragEnd && onDragEnd()}>
      <span className="g">{GLIFO[t.estado]}</span>
      <b>{s ? s.nombre : '—'}</b>
      <span>{nombreTarea(t, cat)}</span>
      <span className="mono">{fmtMin(minutosDe(t, cat))}</span>
      {w.length > 0 && <i className="warnb" aria-label="Aviso">!</i>}
    </div>
  );
}
