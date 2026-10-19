import { useMemo, useState } from 'react';
import MapView from '../components/MapView';
import { CuadrillasAhora, Leyenda, barras, itemsMapa } from '../components/Comun';
import { useData } from '../lib/store';
import { addDays, hoy, lunesDe, MESL, minutosDe } from '../lib/util';

function GraficoDiario({ dias, conteo, resaltar }) {
  const top = Math.max(4, Math.ceil(Math.max(...conteo, 0) / 4) * 4);
  const W = 640, H = 220, l = 34, r = 8, t = 20, b = 28, pw = W - l - r, ph = H - t - b;
  const slot = pw / dias.length, bw = Math.min(30, slot * 0.64);
  const hoyIso = hoy();
  return (
    <svg className="chart" viewBox={'0 0 ' + W + ' ' + H} role="img" aria-label="Tareas terminadas por día">
      {[0, 1, 2, 3, 4].map((i) => {
        const v = (top / 4) * i, y = t + ph - (v / top) * ph;
        return <g key={i}><line x1={l} y1={y} x2={W - r} y2={y} stroke="var(--line)" strokeWidth="1" /><text x={l - 6} y={y + 4} textAnchor="end">{v}</text></g>;
      })}
      {dias.map((d, i) => {
        const v = conteo[i], x = l + slot * i + (slot - bw) / 2, h = (v / top) * ph, y = t + ph - h;
        return (
          <g key={d}>
            <rect x={x} y={y} width={bw} height={h} rx="2" fill={resaltar.includes(d) ? 'var(--accent)' : 'var(--surface2)'} />
            {v > 0 && <text x={x + bw / 2} y={y - 4} textAnchor="middle" style={{ fill: 'var(--ink)' }}>{v}</text>}
            <text x={x + bw / 2} y={H - 10} textAnchor="middle" style={d === hoyIso ? { fill: 'var(--ink)', fontWeight: 600 } : undefined}>{Number(d.slice(8))}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function Panel({ onSucursal }) {
  const { tareas, cuadrillas, catById, sucursales, estadoSucursal, crewById, perfiles } = useData();
  const [periodo, setPeriodo] = useState('dia');
  const h = hoy();
  const semana = Array.from({ length: 7 }, (_, i) => addDays(lunesDe(h), i));
  const mes = useMemo(() => { const out = []; for (let d = h.slice(0, 8) + '01'; d <= h; d = addDays(d, 1)) out.push(d); return out; }, [h]);
  const dias = periodo === 'dia' ? [h] : periodo === 'sem' ? semana : mes;
  const hechas = tareas.filter((t) => t.estado === 'hecha' && dias.includes(t.fecha));
  const horas = Math.round(hechas.reduce((a, t) => a + minutosDe(t, catById.get(t.catalogo_id)), 0) / 6) / 10;
  const enCurso = tareas.filter((t) => t.estado === 'en_curso').length;
  const pendientes = tareas.filter((t) => t.estado === 'pendiente').length;
  const porCuadrilla = cuadrillas.map((c) => ({ l: c.nombre, v: hechas.filter((t) => t.cuadrilla_id === c.id).length, c: c.color }));
  const grupos = {};
  hechas.forEach((t) => { grupos[t.catalogo_id] = (grupos[t.catalogo_id] || 0) + 1; });
  const porTipo = Object.keys(grupos).map((k) => ({ l: catById.get(k) ? catById.get(k).nombre : 'Tarea', v: grupos[k], c: 'var(--accent)' })).sort((a, b) => b.v - a.v).slice(0, 6);
  const items = useMemo(() => itemsMapa({ sucursales, estadoSucursal, crewById, tareas, perfiles }), [sucursales, estadoSucursal, crewById, tareas, perfiles]);
  const conteoMes = mes.map((d) => tareas.filter((t) => t.estado === 'hecha' && t.fecha === d).length);
  const etiqueta = { dia: 'hoy', sem: 'esta semana', mes: MESL[Number(h.slice(5, 7)) - 1] + ' (hasta hoy)' }[periodo];

  return (
    <>
      <div className="perhead">
        <h2>Trabajo realizado: {etiqueta}</h2>
        <div className="seg" role="group" aria-label="Período">
          {[['dia', 'Hoy'], ['sem', 'Semana'], ['mes', 'Mes']].map(([k, l]) => <button key={k} onClick={() => setPeriodo(k)} aria-pressed={periodo === k}>{l}</button>)}
        </div>
      </div>
      <div className="kpis">
        <div className="kpi"><div className="n">{hechas.length}</div><div className="l">Tareas terminadas</div></div>
        <div className="kpi"><div className="n">{new Set(hechas.map((t) => t.sucursal_id)).size}</div><div className="l">Sucursales atendidas</div></div>
        <div className="kpi"><div className="n">{String(horas).replace('.', ',')}</div><div className="l">Horas de trabajo estimadas</div></div>
        <div className="kpi"><div className="n">{enCurso}</div><div className="l">En curso ahora</div></div>
      </div>
      <div className="cols" style={{ marginTop: 16 }}>
        <div className="stack">
          <div className="mapbox"><MapView items={items} onPick={onSucursal} alto={420} /><Leyenda /></div>
          <div className="card">
            <h2>Tareas terminadas por día</h2>
            <GraficoDiario dias={mes} conteo={conteoMes} resaltar={dias} />
            <p className="hint" style={{ margin: '6px 0 0' }}>Barras de color: el período elegido. Quedan {pendientes} tareas pendientes en el plan.</p>
          </div>
        </div>
        <div className="stack">
          <div className="card"><h2>Dónde trabajan ahora</h2><CuadrillasAhora /></div>
          <div className="card"><h2>Por cuadrilla</h2>{barras(porCuadrilla, Math.max(0, ...porCuadrilla.map((x) => x.v)))}</div>
          <div className="card"><h2>Por tipo de tarea</h2>{barras(porTipo, Math.max(0, ...porTipo.map((x) => x.v)))}</div>
        </div>
      </div>
    </>
  );
}
