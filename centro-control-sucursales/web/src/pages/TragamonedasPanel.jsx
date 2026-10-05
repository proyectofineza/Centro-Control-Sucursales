import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import Badge from '../components/Badge.jsx';
import Kpi from '../components/Kpi.jsx';
import { IconSearch } from '../components/icons.jsx';
import { downloadCsv } from '../lib/format.js';
import { SLOT_TIMES, SLOT_CHECKS, currentControlDate, addDays, fmtControlDate, issuesOf } from '../lib/slots.js';

// Panel de datos de tragamonedas (rol Tragamonedas y Admin) — solo lectura.
export default function TragamonedasPanel() {
  const today = useMemo(() => currentControlDate(), []);
  const [date, setDate] = useState(today);
  const [branches, setBranches] = useState([]);
  const [configMap, setConfigMap] = useState({});
  const [checks, setChecks] = useState([]);
  const [issues, setIssues] = useState([]);
  const [trend, setTrend] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cityFilter, setCityFilter] = useState('');
  const [search, setSearch] = useState('');
  const [onlyIssues, setOnlyIssues] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const from = addDays(date, -6);
      const [{ data: br }, { data: cfg }, { data: chk }, { data: iss }, { data: week }] = await Promise.all([
        supabase.from('branches').select('id, code, name, city').eq('active', true).order('code'),
        supabase.from('slot_branch_config').select('branch_id, machine_count'),
        supabase.from('slot_checks').select('branch_id, slot, has_incident, machine_count').eq('control_date', date),
        supabase.from('slot_items_detailed').select('*').eq('control_date', date).eq('has_issue', true).order('slot').order('branch_code'),
        supabase.from('slot_daily_summary').select('*').gte('control_date', from).lte('control_date', date),
      ]);
      if (!alive) return;
      setBranches(br || []);
      const cMap = {};
      (cfg || []).forEach((c) => (cMap[c.branch_id] = c.machine_count));
      setConfigMap(cMap);
      setChecks(chk || []);
      setIssues(iss || []);
      setTrend(week || []);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [date]);

  const cities = useMemo(() => [...new Set(branches.map((b) => b.city).filter(Boolean))].sort(), [branches]);

  const withMachines = useMemo(() => branches.filter((b) => (configMap[b.id] || 0) > 0), [branches, configMap]);
  const unsurveyed = branches.filter((b) => configMap[b.id] === undefined).length;
  const totalMachines = withMachines.reduce((s, b) => s + configMap[b.id], 0);

  const checkMap = useMemo(() => {
    const m = {};
    checks.forEach((c) => (m[`${c.branch_id}|${c.slot}`] = c));
    return m;
  }, [checks]);

  // Resumen por horario
  const perSlot = useMemo(
    () =>
      SLOT_TIMES.map((s) => {
        const done = checks.filter((c) => c.slot === s);
        return { slot: s, done: done.length, withIssue: done.filter((c) => c.has_incident).length, total: withMachines.length };
      }),
    [checks, withMachines]
  );

  const matrixRows = useMemo(() => {
    let list = withMachines;
    if (cityFilter) list = list.filter((b) => b.city === cityFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((b) => `${b.code} ${b.name} ${b.city}`.toLowerCase().includes(q));
    if (onlyIssues) list = list.filter((b) => SLOT_TIMES.some((s) => checkMap[`${b.id}|${s}`]?.has_incident));
    return list;
  }, [withMachines, cityFilter, search, onlyIssues, checkMap]);

  const issueRows = useMemo(() => {
    let list = issues;
    if (cityFilter) list = list.filter((i) => i.branch_city === cityFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((i) => `${i.branch_code} ${i.branch_name} ${i.branch_city}`.toLowerCase().includes(q));
    return list;
  }, [issues, cityFilter, search]);

  // Tendencia de los últimos 7 días: controles hechos vs. esperados, y cuántos con incidencia.
  const trendDays = useMemo(() => {
    const expected = withMachines.length * SLOT_TIMES.length;
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(date, i - 6);
      const day = trend.find((c) => c.control_date === d);
      const done = day?.checks_done || 0;
      return {
        date: d,
        done,
        withIssue: day?.checks_with_incident || 0,
        pct: expected ? Math.min(100, Math.round((done / expected) * 100)) : 0,
      };
    });
  }, [trend, date, withMachines]);

  const exportCsv = () => {
    downloadCsv(
      `tragamonedas_incidencias_${date}.csv`,
      issueRows.map((i) => ({
        fecha: i.control_date,
        horario: i.slot,
        codigo: i.branch_code,
        sucursal: i.branch_name,
        ciudad: i.branch_city,
        tragamonedas: i.machine_no,
        problemas: issuesOf(i).join(' / '),
        observacion: i.observation || '',
        operador: i.operator_name || '',
      }))
    );
  };

  return (
    <div>
      <div className="flex items-end justify-between mb-5 flex-wrap gap-3">
        <div>
          <div className="text-[11px] text-brand uppercase tracking-widest font-semibold mb-1">Tragamonedas</div>
          <h1 className="text-[22px] font-bold tracking-tight">Control de tragamonedas</h1>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-ghost !px-3 !py-2" onClick={() => setDate(addDays(date, -1))} aria-label="Día anterior">←</button>
          <input type="date" className="input !w-[160px]" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} />
          <button className="btn btn-ghost !px-3 !py-2" onClick={() => setDate(addDays(date, 1))} disabled={date >= today} aria-label="Día siguiente">→</button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        {perSlot.map((p) => (
          <Kpi
            key={p.slot}
            label={`Control ${p.slot}`}
            value={`${p.done}/${p.total}`}
            sub={p.withIssue > 0 ? `⚠ ${p.withIssue} con incidencia` : 'sin incidencias'}
            color={p.total && p.done === p.total ? '#22e2a0' : p.done === 0 ? '#ff5468' : '#ffc736'}
          />
        ))}
        <Kpi label="Sucursales con tragamonedas" value={withMachines.length} sub={`${totalMachines} máquinas en total`} />
        <Kpi label="Sin relevar" value={unsurveyed} sub="aún sin contar máquinas" />
      </div>

      <div className="flex items-center gap-2.5 mb-3.5 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-[320px]">
          <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text3" />
          <input className="input !pl-8" placeholder="Buscar por código, nombre o ciudad…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input !w-[170px]" value={cityFilter} onChange={(e) => setCityFilter(e.target.value)}>
          <option value="">Todas las ciudades</option>
          {cities.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <div
          onClick={() => setOnlyIssues((v) => !v)}
          className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold border cursor-pointer ${onlyIssues ? 'bg-brandsoft border-brand text-brand' : 'bg-surface border-border text-text2'}`}
        >
          Solo con incidencia
        </div>
      </div>

      <div className="card !p-0 overflow-hidden mb-4">
        <div className="px-4 pt-3.5 pb-2 text-sm font-semibold">Estado por sucursal — {fmtControlDate(date)}</div>
        <div className="overflow-x-auto">
          <table className="datatable">
            <thead>
              <tr><th>Código</th><th>Sucursal</th><th>Ciudad</th><th>Máquinas</th>{SLOT_TIMES.map((s) => <th key={s}>{s}</th>)}</tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={4 + SLOT_TIMES.length} className="text-center text-text3 py-8">Cargando…</td></tr>}
              {!loading && matrixRows.length === 0 && <tr><td colSpan={4 + SLOT_TIMES.length} className="text-center text-text3 py-8">No hay sucursales para este filtro.</td></tr>}
              {!loading && matrixRows.map((b) => (
                <tr key={b.id}>
                  <td className="font-mono text-text2">{b.code}</td>
                  <td className="font-medium">{b.name}</td>
                  <td className="text-text2">{b.city}</td>
                  <td className="font-mono">{configMap[b.id]}</td>
                  {SLOT_TIMES.map((s) => {
                    const c = checkMap[`${b.id}|${s}`];
                    return (
                      <td key={s}>
                        {!c ? <Badge className="badge-neutral">Sin control</Badge> : c.has_incident ? <Badge className="badge-orange">Incidencia</Badge> : <Badge className="badge-green">OK</Badge>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 text-[11.5px] text-text3">{matrixRows.length} sucursales con tragamonedas</div>
      </div>

      <div className="card !p-0 overflow-hidden mb-4">
        <div className="px-4 pt-3.5 pb-2 flex items-center justify-between">
          <div className="text-sm font-semibold">Incidencias del día ({issueRows.length})</div>
          <button className="btn btn-ghost !text-[12px] !py-1.5" onClick={exportCsv} disabled={issueRows.length === 0}>Exportar CSV</button>
        </div>
        <div className="overflow-x-auto">
          <table className="datatable">
            <thead>
              <tr><th>Horario</th><th>Sucursal</th><th>Máquina</th><th>Problema</th><th>Observación</th><th>Operador</th></tr>
            </thead>
            <tbody>
              {!loading && issueRows.length === 0 && <tr><td colSpan={6} className="text-center text-text3 py-8">Sin incidencias de tragamonedas en esta fecha.</td></tr>}
              {issueRows.map((i) => (
                <tr key={i.id}>
                  <td className="font-mono">{i.slot}</td>
                  <td><span className="font-mono text-text3 mr-1.5">{i.branch_code}</span>{i.branch_name}<div className="text-[11px] text-text3">{i.branch_city}</div></td>
                  <td className="font-mono">#{i.machine_no}</td>
                  <td>
                    <div className="flex gap-1 flex-wrap">
                      {SLOT_CHECKS.filter((c) => i[c.key] === false).map((c) => (
                        <Badge key={c.key} className={c.key === 'is_operating' ? 'badge-red' : 'badge-orange'}>{c.issue}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="text-text2 max-w-[240px]">{i.observation || '—'}</td>
                  <td className="text-text2">{i.operator_name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="text-sm font-semibold mb-1">Últimos 7 días</div>
        <div className="text-[11.5px] text-text3 mb-3.5">Controles realizados sobre los esperados ({withMachines.length} sucursales × {SLOT_TIMES.length} horarios por día)</div>
        <div className="flex flex-col gap-3">
          {trendDays.map((d) => (
            <div key={d.date}>
              <div className="flex justify-between items-center text-[12.5px] mb-1">
                <span className="font-medium">{fmtControlDate(d.date)}</span>
                <span className="text-text3 font-mono">
                  {d.done} controles · {d.pct}%
                  {d.withIssue > 0 && <span className="ml-2 text-orange">⚠ {d.withIssue}</span>}
                </span>
              </div>
              <div className="h-2 rounded-full bg-surface3 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${d.pct}%`, background: d.pct >= 90 ? '#22e2a0' : d.pct >= 50 ? '#ffc736' : '#ff5468' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
