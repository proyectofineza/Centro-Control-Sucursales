import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import Badge from '../components/Badge.jsx';
import Kpi from '../components/Kpi.jsx';
import { IconSearch } from '../components/icons.jsx';
import { downloadCsv } from '../lib/format.js';
import {
  SLOT_CHECKS, PENALTY_LIMITS, currentControlDate, monthRange, addMonths, fmtMonthLabel,
} from '../lib/slots.js';

const RED = '#ff5468';
const AMBER = '#ffc736';
const DOW = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const fmtDay = (iso) => `${DOW[new Date(`${iso}T12:00:00Z`).getUTCDay()]} ${iso.slice(8)}/${iso.slice(5, 7)}`;

// Estado de un contador: penalidad (llegó al límite), riesgo (a 1 del límite) o normal.
const stateOf = (n, limit) => (n >= limit ? 'pen' : n === limit - 1 && n > 0 ? 'risk' : n > 0 ? 'some' : 'none');
const STATE_STYLE = {
  pen: 'bg-red/15 border-red/50 text-red',
  risk: 'bg-amber/15 border-amber/50 text-amber',
  some: 'bg-surface2 border-border text-text2',
  none: 'bg-surface border-border text-text3',
};

// Trae todas las filas del mes (el servidor corta en 1000 por consulta).
async function fetchAll(from, to) {
  const out = [];
  for (let page = 0; page < 20; page += 1) {
    const { data, error } = await supabase.rpc('slot_penalty_days', { p_from: from, p_to: to }).range(page * 1000, page * 1000 + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

// Penalidades: sucursales con problemas recurrentes en el mes, agrupadas por
// sucursal y con el desglose por fecha. Solo lectura.
export default function TragamonedasPenalidades() {
  const today = useMemo(() => currentControlDate(), []);
  const currentMonth = today.slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [city, setCity] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('todas');
  const [totalBranches, setTotalBranches] = useState(0);

  const { from, to } = monthRange(month);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const [data, { count }] = await Promise.all([
          fetchAll(from, to),
          supabase.from('slot_branch_config').select('branch_id', { count: 'exact', head: true }).gt('machine_count', 0),
        ]);
        if (!alive) return;
        setRows(data);
        setTotalBranches(count || 0);
      } catch (e) {
        if (alive) setError(e.message || String(e));
      }
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [from, to]);

  // Agrupa por sucursal: por tipo, la lista de días (con horarios y máquinas).
  const branches = useMemo(() => {
    const map = new Map();
    rows.forEach((r) => {
      if (!map.has(r.r_branch_id)) {
        map.set(r.r_branch_id, { id: r.r_branch_id, code: r.r_branch_code, name: r.r_branch_name, city: r.r_branch_city, days: {}, byDate: {} });
      }
      const b = map.get(r.r_branch_id);
      (b.days[r.r_issue_key] ||= []).push(r);
      (b.byDate[r.r_control_date] ||= {})[r.r_issue_key] = r;
    });
    return [...map.values()].map((b) => {
      const counts = {};
      let pen = 0;
      let risk = 0;
      SLOT_CHECKS.forEach((c) => {
        const n = (b.days[c.issueKey] || []).length;
        counts[c.issueKey] = n;
        const st = stateOf(n, PENALTY_LIMITS[c.issueKey]);
        if (st === 'pen') pen += 1;
        else if (st === 'risk') risk += 1;
      });
      return { ...b, counts, pen, risk, total: Object.values(counts).reduce((a, x) => a + x, 0), dates: Object.keys(b.byDate).sort() };
    });
  }, [rows]);

  const cities = useMemo(() => [...new Set(branches.map((b) => b.city).filter(Boolean))].sort(), [branches]);

  const kpi = useMemo(() => ({
    pen: branches.filter((b) => b.pen > 0).length,
    risk: branches.filter((b) => b.pen === 0 && b.risk > 0).length,
    some: branches.length,
  }), [branches]);

  const q = search.trim().toLowerCase();
  const list = useMemo(() => {
    let l = branches;
    if (city) l = l.filter((b) => b.city === city);
    if (q) l = l.filter((b) => `${b.code} ${b.name} ${b.city}`.toLowerCase().includes(q));
    if (typeFilter) l = l.filter((b) => (b.counts[typeFilter] || 0) > 0);
    if (statusFilter === 'pen') l = l.filter((b) => b.pen > 0);
    if (statusFilter === 'risk') l = l.filter((b) => b.risk > 0 && b.pen === 0);
    return [...l].sort((a, b) => b.pen - a.pen || b.risk - a.risk || b.total - a.total || a.code.localeCompare(b.code));
  }, [branches, city, q, typeFilter, statusFilter]);

  const exportCsv = () => {
    const out = [];
    list.forEach((b) => {
      SLOT_CHECKS.forEach((c) => {
        (b.days[c.issueKey] || []).forEach((r, i) => {
          out.push({
            codigo: b.code, sucursal: b.name, ciudad: b.city, fecha: r.r_control_date, problema: c.issue,
            horarios: r.r_slots.join(' / '), maquinas: r.r_machines.map((m) => `#${m}`).join(' / '),
            dia_n_del_mes: i + 1, limite: PENALTY_LIMITS[c.issueKey], en_penalidad: i + 1 >= PENALTY_LIMITS[c.issueKey] ? 'SI' : 'no',
          });
        });
      });
    });
    downloadCsv(`tragamonedas_penalidades_${month}.csv`, out);
  };

  const prev = () => setMonth(addMonths(month, -1));
  const next = () => month < currentMonth && setMonth(addMonths(month, 1));

  return (
    <div>
      <div className="flex items-end justify-between mb-2 flex-wrap gap-3">
        <div>
          <div className="text-[11px] text-brand uppercase tracking-widest font-semibold mb-1">Tragamonedas</div>
          <h1 className="text-[22px] font-bold tracking-tight">Penalidades del mes</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button className="btn btn-ghost !px-3 !py-2" onClick={prev} aria-label="Mes anterior">←</button>
          <input type="month" className="input !w-[170px]" value={month} max={currentMonth} onChange={(e) => e.target.value && setMonth(e.target.value)} />
          <button className={`btn ${month < currentMonth ? 'btn-ghost' : 'btn-disabled'} !px-3 !py-2`} onClick={next} disabled={month >= currentMonth} aria-label="Mes siguiente">→</button>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <div className="text-[13px] text-text2 font-medium">{fmtMonthLabel(month)}</div>
        <Badge className={month < currentMonth ? 'badge-green' : 'badge-amber'}>{month < currentMonth ? 'Mes cerrado' : 'Mes en curso'}</Badge>
      </div>
      <p className="text-[12px] text-text3 mb-4 max-w-[760px]">
        Cada día cuenta <b>una sola vez</b> por tipo de problema, aunque haya aparecido en varios controles. Límite por mes:{' '}
        {SLOT_CHECKS.map((c) => `${c.issue} ${PENALTY_LIMITS[c.issueKey]}`).join(' · ')}. Al llegar al límite la sucursal entra en penalidad.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Kpi label="En penalidad" value={kpi.pen} sub="llegaron al límite del mes" color={kpi.pen > 0 ? RED : undefined} />
        <Kpi label="A un paso de la penalidad" value={kpi.risk} sub="les falta 1 día para el límite" color={kpi.risk > 0 ? AMBER : undefined} />
        <Kpi label="Con algún problema" value={kpi.some} sub={`de ${totalBranches} con tragamonedas`} />
        <Kpi label="Sin ningún problema" value={Math.max(0, totalBranches - kpi.some)} sub="en el mes" color={totalBranches - kpi.some > 0 ? '#22e2a0' : undefined} />
      </div>

      <div className="flex items-center gap-2.5 mb-3.5 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-[320px]">
          <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text3" />
          <input className="input !pl-8" placeholder="Buscar por código, nombre o ciudad…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input !w-[170px]" value={city} onChange={(e) => setCity(e.target.value)}>
          <option value="">Todas las ciudades</option>
          {cities.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="input !w-[170px]" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">Todos los problemas</option>
          {SLOT_CHECKS.map((c) => <option key={c.issueKey} value={c.issueKey}>{c.issue}</option>)}
        </select>
        <div className="flex gap-1.5 flex-wrap">
          {[['todas', 'Todas'], ['pen', 'En penalidad'], ['risk', 'A un paso']].map(([k, label]) => (
            <div
              key={k}
              onClick={() => setStatusFilter(k)}
              className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold border cursor-pointer ${statusFilter === k ? 'bg-brandsoft border-brand text-brand' : 'bg-surface border-border text-text2'}`}
            >
              {label}
            </div>
          ))}
        </div>
        <button className="btn btn-ghost !text-[12px] !py-1.5 ml-auto" onClick={exportCsv} disabled={list.length === 0}>Exportar CSV</button>
      </div>

      {error && (
        <div className="card text-sm text-text2 mb-4">
          No se pudo cargar: {error}
          <div className="text-[12px] text-text3 mt-1.5">Si recién se actualizó el sistema, falta correr la migración 0011 en Supabase.</div>
        </div>
      )}
      {loading && <div className="card text-center text-text3 py-8">Cargando…</div>}
      {!loading && !error && list.length === 0 && (
        <div className="card text-center text-text3 py-8">No hay sucursales con problemas para este filtro en {fmtMonthLabel(month)}. ✔</div>
      )}

      {!loading && list.map((b) => (
        <div key={b.id} className={`card !p-0 overflow-hidden mb-3 ${b.pen > 0 ? 'border-red/50' : ''}`}>
          <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap border-b border-border">
            <div>
              <div className="font-semibold text-[14.5px]">
                <span className="font-mono text-text3 mr-1.5">{b.code}</span>{b.name}
                {b.pen > 0 && <span className="ml-2 align-middle"><Badge className="badge-red">EN PENALIDAD</Badge></span>}
                {b.pen === 0 && b.risk > 0 && <span className="ml-2 align-middle"><Badge className="badge-amber">A un paso</Badge></span>}
              </div>
              <div className="text-[11.5px] text-text3">{b.city}</div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {SLOT_CHECKS.map((c) => {
                const n = b.counts[c.issueKey];
                const limit = PENALTY_LIMITS[c.issueKey];
                return (
                  <div key={c.issueKey} className={`rounded-lg border px-3 py-1.5 text-center min-w-[96px] ${STATE_STYLE[stateOf(n, limit)]}`}>
                    <div className="text-[10.5px] uppercase tracking-wide opacity-80">{c.issue}</div>
                    <div className="font-mono font-bold text-[15px] leading-tight">{n}/{limit}</div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="datatable" style={{ tableLayout: 'fixed', minWidth: 640 }}>
              <thead>
                <tr><th style={{ width: 110 }}>Fecha</th>{SLOT_CHECKS.map((c) => <th key={c.issueKey}>{c.issue}</th>)}</tr>
              </thead>
              <tbody>
                {b.dates.map((d) => (
                  <tr key={d}>
                    <td className="font-mono whitespace-nowrap">{fmtDay(d)}</td>
                    {SLOT_CHECKS.map((c) => {
                      const r = b.byDate[d][c.issueKey];
                      if (!r) return <td key={c.issueKey} className="text-text3">—</td>;
                      const nth = b.days[c.issueKey].findIndex((x) => x.r_control_date === d) + 1;
                      const limit = PENALTY_LIMITS[c.issueKey];
                      return (
                        <td key={c.issueKey}>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`inline-block rounded-md px-1.5 py-0.5 text-[10.5px] font-bold font-mono ${nth >= limit ? 'bg-red/15 text-red' : nth === limit - 1 ? 'bg-amber/15 text-amber' : 'bg-surface2 text-text2'}`}>
                              {nth}.º día
                            </span>
                            <span className="font-mono text-[12px]">{r.r_slots.join(' · ')}</span>
                          </div>
                          <div className="text-[11px] text-text3 mt-0.5">Máq. {r.r_machines.map((m) => `#${m}`).join(', ')}</div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {!loading && list.length > 0 && <div className="text-[11.5px] text-text3 mt-2">{list.length} sucursales · ordenadas: primero las que están en penalidad.</div>}
    </div>
  );
}
