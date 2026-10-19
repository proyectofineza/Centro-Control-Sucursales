import { useMemo, useState } from 'react';
import { useData } from '../lib/store';
import { CATEG, addDays, gs, hoy, lunesDe } from '../lib/util';

function rangoDe(per) {
  const h = hoy(), mes = h.slice(0, 8) + '01';
  if (per === 'mes') return [mes, h];
  if (per === 'ant') { const fin = addDays(mes, -1); return [fin.slice(0, 8) + '01', fin]; }
  if (per === 'sem') return [lunesDe(h), addDays(lunesDe(h), 6)];
  return ['0000-01-01', '9999-12-31'];
}

export default function GastosView({ onSucursal }) {
  const { gastos, unidades, sucById } = useData();
  const [per, setPer] = useState('mes');
  const [uni, setUni] = useState('');
  const [d0, d1] = rangoDe(per);

  const lista = useMemo(() => gastos.filter((g) => {
    if (g.fecha < d0 || g.fecha > d1) return false;
    const s = sucById.get(g.sucursal_id);
    return s && (!uni || s.unidad_negocio === uni);
  }), [gastos, d0, d1, uni, sucById]);

  const tot = { cotizado: 0, aprobado: 0, comprado: 0 };
  const porSuc = new Map();
  const porCat = {};
  lista.forEach((g) => {
    const m = Number(g.monto) || 0;
    tot[g.estado] += m;
    const r = porSuc.get(g.sucursal_id) || { id: g.sucursal_id, cotizado: 0, aprobado: 0, comprado: 0, n: 0 };
    r[g.estado] += m; r.n += 1; porSuc.set(g.sucursal_id, r);
    porCat[g.categoria] = (porCat[g.categoria] || 0) + m;
  });
  const filas = [...porSuc.values()].map((r) => ({ ...r, total: r.cotizado + r.aprobado + r.comprado })).sort((a, b) => b.total - a.total);
  const total = tot.cotizado + tot.aprobado + tot.comprado;
  const maxCat = Math.max(1, ...Object.values(porCat));

  const exportar = () => {
    const esc = (v) => '"' + String(v).replace(/"/g, '""') + '"';
    const cab = ['Sucursal', 'Unidad de negocio', 'Cotizado', 'Aprobado', 'Comprado', 'Total', 'Movimientos'];
    const cuerpo = filas.map((r) => { const s = sucById.get(r.id); return [s.nombre, s.unidad_negocio, Math.round(r.cotizado), Math.round(r.aprobado), Math.round(r.comprado), Math.round(r.total), r.n].map(esc).join(';'); });
    const blob = new Blob(['﻿' + [cab.map(esc).join(';'), ...cuerpo].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'gastos_por_sucursal.csv';
    document.body.appendChild(a); a.click(); a.remove();
  };

  return (
    <>
      <div className="perhead">
        <h2>Gastos por sucursal</h2>
        <div className="seg" role="group" aria-label="Período">
          {[['mes', 'Este mes'], ['ant', 'Mes anterior'], ['sem', 'Semana'], ['todo', 'Todo']].map(([k, l]) => <button key={k} aria-pressed={per === k} onClick={() => setPer(k)}>{l}</button>)}
        </div>
      </div>
      <div className="inl" style={{ marginTop: 0, marginBottom: 12 }}>
        <select value={uni} onChange={(e) => setUni(e.target.value)} aria-label="Unidad de negocio">
          <option value="">Todas las unidades de negocio</option>
          {unidades.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        <button className="btn" onClick={exportar} disabled={!filas.length}>Descargar para Excel</button>
      </div>
      <div className="kpis">
        <div className="kpi"><div className="n sm">{gs(total)}</div><div className="l">Total registrado</div></div>
        <div className="kpi"><div className="n sm">{gs(tot.cotizado)}</div><div className="l">Cotizado</div></div>
        <div className="kpi"><div className="n sm">{gs(tot.aprobado)}</div><div className="l">Aprobado</div></div>
        <div className="kpi"><div className="n sm">{gs(tot.comprado)}</div><div className="l">Comprado (gastado)</div></div>
      </div>
      <div className="grid-auto" style={{ marginTop: 16, alignItems: 'start' }}>
        <div className="card" style={{ gridColumn: 'span 2', minWidth: 0 }}>
          <h2>Por sucursal</h2>
          {filas.length === 0 && <p className="hint">No hay cotizaciones ni gastos en este período.</p>}
          {filas.length > 0 && (
            <div className="tw">
              <table className="t">
                <thead><tr><th>Sucursal</th><th>Cotizado</th><th>Aprobado</th><th>Comprado</th><th>Total</th></tr></thead>
                <tbody>
                  {filas.map((r) => (
                    <tr key={r.id} className="click" onClick={() => onSucursal(r.id, 'gas')} style={{ cursor: 'pointer' }}>
                      <td><b>{sucById.get(r.id).nombre}</b></td>
                      <td className="mono">{gs(r.cotizado)}</td><td className="mono">{gs(r.aprobado)}</td><td className="mono">{gs(r.comprado)}</td><td className="mono"><b>{gs(r.total)}</b></td>
                    </tr>))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="card">
          <h2>Por tipo</h2>
          {Object.keys(porCat).length === 0 && <p className="hint">Sin datos.</p>}
          {Object.entries(porCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
            <div key={k} style={{ marginBlock: 8, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{CATEG[k]}</span><span className="mono">{gs(v)}</span></div>
              <div className="hbar" style={{ display: 'block', margin: '3px 0 0' }}><div className="t"><i style={{ width: (v / maxCat) * 100 + '%', background: 'var(--accent)' }} /></div></div>
            </div>))}
        </div>
      </div>
      <p className="hint">La fecha de un gasto es el día en que se registró; al pasarlo a «Comprado» toma la fecha de ese día.</p>
    </>
  );
}
