import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import Badge from '../components/Badge.jsx';
import Kpi from '../components/Kpi.jsx';
import TragamonedasResumen from '../components/TragamonedasResumen.jsx';
import { IconSearch } from '../components/icons.jsx';
import { downloadCsv, ROLE_LABEL } from '../lib/format.js';
import {
  SLOT_TIMES, SLOT_CHECKS, ISSUE_BY_KEY, describeChanges, fmtDateTimePy, currentControlDate, addDays, fmtControlDate, issuesOf,
  weekRange, monthRange, addMonths, fmtMonthLabel, fmtShortDate,
  datesUpToToday, expectedChecksPerBranch, expectedDaysForSlot,
} from '../lib/slots.js';

const GREEN = '#22e2a0';
const AMBER = '#ffc736';
const RED = '#ff5468';
const pctColor = (p) => (p >= 90 ? GREEN : p >= 50 ? AMBER : RED);
const DOW = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const MODES = [
  { key: 'dia', label: 'Diario' },
  { key: 'semana', label: 'Semanal' },
  { key: 'mes', label: 'Mensual' },
];

// Panel de datos de tragamonedas (rol Tragamonedas y Admin) — solo lectura.
// Tres vistas: diario (detalle del día), semanal (lunes a domingo) y
// mensual (mes calendario; se puede elegir cualquier mes cerrado).
export default function TragamonedasPanel() {
  const today = useMemo(() => currentControlDate(), []);
  const currentMonth = today.slice(0, 7);

  const [mode, setMode] = useState('dia');
  const [date, setDate] = useState(today);
  const [month, setMonth] = useState(addMonths(currentMonth, -1)); // por defecto, el último mes cerrado
  const [branches, setBranches] = useState([]);
  const [configMap, setConfigMap] = useState({});
  const [cityFilter, setCityFilter] = useState('');
  const [search, setSearch] = useState('');
  const [onlyIssues, setOnlyIssues] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: br }, { data: cfg }] = await Promise.all([
        supabase.from('branches').select('id, code, name, city').eq('active', true).order('code'),
        supabase.from('slot_branch_config').select('branch_id, machine_count'),
      ]);
      setBranches(br || []);
      const cMap = {};
      (cfg || []).forEach((c) => (cMap[c.branch_id] = c.machine_count));
      setConfigMap(cMap);
    })();
  }, []);

  const cities = useMemo(() => [...new Set(branches.map((b) => b.city).filter(Boolean))].sort(), [branches]);

  const range = useMemo(() => {
    if (mode === 'semana') return weekRange(date);
    if (mode === 'mes') return monthRange(month);
    return { from: date, to: date };
  }, [mode, date, month]);

  const closed = range.to < today;
  const canNext = mode === 'mes' ? month < currentMonth : range.to < today;

  const prev = () => {
    if (mode === 'dia') setDate(addDays(date, -1));
    else if (mode === 'semana') setDate(addDays(date, -7));
    else setMonth(addMonths(month, -1));
  };
  const next = () => {
    if (!canNext) return;
    if (mode === 'dia') setDate(addDays(date, 1));
    else if (mode === 'semana') setDate(addDays(date, 7));
    else setMonth(addMonths(month, 1));
  };

  const filters = { cities, cityFilter, setCityFilter, search, setSearch, onlyIssues, setOnlyIssues };

  return (
    <div>
      <div className="flex items-end justify-between mb-4 flex-wrap gap-3">
        <div>
          <div className="text-[11px] text-brand uppercase tracking-widest font-semibold mb-1">Tragamonedas</div>
          <h1 className="text-[22px] font-bold tracking-tight">Control de tragamonedas</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button className="btn btn-ghost !px-3 !py-2" onClick={prev} aria-label="Anterior">←</button>
          {mode === 'mes' ? (
            <input type="month" className="input !w-[170px]" value={month} max={currentMonth} onChange={(e) => e.target.value && setMonth(e.target.value)} />
          ) : (
            <input type="date" className="input !w-[160px]" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} />
          )}
          <button className={`btn ${canNext ? 'btn-ghost' : 'btn-disabled'} !px-3 !py-2`} onClick={next} disabled={!canNext} aria-label="Siguiente">→</button>
        </div>
      </div>

      <TragamonedasResumen branches={branches} configMap={configMap} />

      <div className="flex items-center gap-3 flex-wrap mb-4">
        <div className="flex gap-1 bg-surface border border-border rounded-[10px] p-1 w-fit">
          {MODES.map((m) => (
            <div
              key={m.key}
              onClick={() => setMode(m.key)}
              className={`px-4 py-2 rounded-[7px] text-[12.5px] font-semibold cursor-pointer ${mode === m.key ? 'bg-brand text-white' : 'text-text2'}`}
            >
              {m.label}
            </div>
          ))}
        </div>
        <div className="text-[13px] text-text2 font-medium">
          {mode === 'dia' && fmtControlDate(date)}
          {mode === 'semana' && `Semana del ${fmtShortDate(range.from)} al ${fmtShortDate(range.to)}/${range.to.slice(0, 4)}`}
          {mode === 'mes' && fmtMonthLabel(month)}
        </div>
        {mode !== 'dia' && <Badge className={closed ? 'badge-green' : 'badge-amber'}>{closed ? (mode === 'mes' ? 'Mes cerrado' : 'Semana cerrada') : (mode === 'mes' ? 'Mes en curso' : 'Semana en curso')}</Badge>}
      </div>

      {mode === 'dia' ? (
        <DayView date={date} today={today} branches={branches} configMap={configMap} filters={filters} />
      ) : (
        <PeriodView key={mode} mode={mode} from={range.from} to={range.to} closed={closed} branches={branches} configMap={configMap} filters={filters} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Barra de filtros compartida (ciudad / búsqueda / solo con incidencia)
// ---------------------------------------------------------------------
function Filters({ cities, cityFilter, setCityFilter, search, setSearch, onlyIssues, setOnlyIssues }) {
  return (
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
  );
}

const matchesText = (q, ...parts) => !q || parts.join(' ').toLowerCase().includes(q);

const reporterOf = (name, role) => (name ? `${role ? `${ROLE_LABEL[role] || role} — ` : ''}${name}` : '—');

// ---------------------------------------------------------------------
// Problemas sin resolver: máquinas cuyo ÚLTIMO control las dejó marcadas.
// Se resuelven solas cuando un control posterior las marca OK.
// ---------------------------------------------------------------------
function OpenIssuesCard({ filters }) {
  const { cityFilter, search } = filters;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error: err } = await supabase.from('slot_open_issues').select('*').order('since_date').order('branch_code').limit(1000);
      if (!alive) return;
      if (err) setError(err.message);
      setRows(data || []);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const todayIso = currentControlDate();
  const daysOpen = (r) => Math.max(1, Math.round((new Date(`${todayIso}T12:00:00Z`) - new Date(`${r.since_date}T12:00:00Z`)) / 86400000) + 1);
  const q = search.trim().toLowerCase();
  const list = useMemo(() => {
    let l = rows;
    if (cityFilter) l = l.filter((r) => r.branch_city === cityFilter);
    if (q) l = l.filter((r) => matchesText(q, r.branch_code, r.branch_name, r.branch_city));
    return l;
  }, [rows, cityFilter, q]);

  const exportCsv = () => {
    downloadCsv(
      `tragamonedas_problemas_sin_resolver_${todayIso}.csv`,
      list.map((r) => ({
        codigo: r.branch_code,
        sucursal: r.branch_name,
        ciudad: r.branch_city,
        tragamonedas: r.machine_no,
        problema: ISSUE_BY_KEY[r.issue_key]?.issue || r.issue_key,
        desde: `${r.since_date} ${r.since_slot}`,
        dias_abierto: daysOpen(r),
        ultimo_control: `${r.last_date} ${r.last_slot}`,
      }))
    );
  };

  return (
    <div className="card !p-0 overflow-hidden mb-4">
      <div className="px-4 pt-3.5 pb-1 flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm font-semibold">Problemas sin resolver ({loading ? '…' : list.length})</div>
        <button className="btn btn-ghost !text-[12px] !py-1.5" onClick={exportCsv} disabled={list.length === 0}>Exportar CSV</button>
      </div>
      <div className="px-4 pb-2 text-[11.5px] text-text3">
        Máquinas cuyo último control las dejó con problema. Se resuelven solas cuando un control posterior las marca OK.
      </div>
      {error ? (
        <div className="px-4 pb-4 text-sm text-text2">
          No se pudo cargar: {error}
          <div className="text-[12px] text-text3 mt-1">Si recién se actualizó el sistema, falta correr la migración 0010 en Supabase.</div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="datatable">
            <thead>
              <tr><th>Sucursal</th><th>Máquina</th><th>Problema</th><th>Desde</th><th>Días abierto</th><th>Último control</th></tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="text-center text-text3 py-6">Cargando…</td></tr>}
              {!loading && list.length === 0 && <tr><td colSpan={6} className="text-center text-text3 py-6">No hay problemas pendientes. ✔</td></tr>}
              {list.map((r) => {
                const meta = ISSUE_BY_KEY[r.issue_key];
                const d = daysOpen(r);
                return (
                  <tr key={`${r.branch_id}-${r.machine_no}-${r.issue_key}`}>
                    <td><span className="font-mono text-text3 mr-1.5">{r.branch_code}</span>{r.branch_name}<div className="text-[11px] text-text3">{r.branch_city}</div></td>
                    <td className="font-mono">#{r.machine_no}</td>
                    <td><Badge className={r.issue_key === 'not_operating' ? 'badge-red' : 'badge-orange'}>{meta?.issue || r.issue_key}</Badge></td>
                    <td className="font-mono text-text2">{fmtControlDate(r.since_date)} {r.since_slot}</td>
                    <td className="font-mono font-semibold" style={{ color: d >= 3 ? RED : d >= 2 ? AMBER : undefined }}>{d} {d === 1 ? 'día' : 'días'}</td>
                    <td className="font-mono text-text2">{fmtControlDate(r.last_date)} {r.last_slot}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Vista DIARIA
// ---------------------------------------------------------------------
function DayView({ date, today, branches, configMap, filters }) {
  const { cityFilter, search, onlyIssues } = filters;
  const [checks, setChecks] = useState([]);
  const [issues, setIssues] = useState([]);
  const [trend, setTrend] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const from = addDays(date, -6);
      const [{ data: chk }, { data: iss }, { data: week }, { data: hist }] = await Promise.all([
        supabase.from('slot_checks').select('branch_id, slot, has_incident, machine_count').eq('control_date', date),
        supabase.from('slot_items_detailed').select('*').eq('control_date', date).eq('has_issue', true).order('slot').order('branch_code'),
        supabase.from('slot_daily_summary').select('*').gte('control_date', from).lte('control_date', date),
        supabase.from('slot_history_detailed').select('*').eq('control_date', date).order('edited_at', { ascending: false }),
      ]);
      if (!alive) return;
      setHistory(hist || []);
      setChecks(chk || []);
      setIssues(iss || []);
      setTrend(week || []);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [date]);

  const withMachines = useMemo(() => branches.filter((b) => (configMap[b.id] || 0) > 0), [branches, configMap]);

  const checkMap = useMemo(() => {
    const m = {};
    checks.forEach((c) => (m[`${c.branch_id}|${c.slot}`] = c));
    return m;
  }, [checks]);

  const perSlot = useMemo(
    () =>
      SLOT_TIMES.map((s) => {
        const done = checks.filter((c) => c.slot === s);
        return { slot: s, done: done.length, withIssue: done.filter((c) => c.has_incident).length, total: withMachines.length };
      }),
    [checks, withMachines]
  );

  const q = search.trim().toLowerCase();

  const matrixRows = useMemo(() => {
    let list = withMachines;
    if (cityFilter) list = list.filter((b) => b.city === cityFilter);
    if (q) list = list.filter((b) => matchesText(q, b.code, b.name, b.city));
    if (onlyIssues) list = list.filter((b) => SLOT_TIMES.some((s) => checkMap[`${b.id}|${s}`]?.has_incident));
    return list;
  }, [withMachines, cityFilter, q, onlyIssues, checkMap]);

  const issueRows = useMemo(() => {
    let list = issues;
    if (cityFilter) list = list.filter((i) => i.branch_city === cityFilter);
    if (q) list = list.filter((i) => matchesText(q, i.branch_code, i.branch_name, i.branch_city));
    return list;
  }, [issues, cityFilter, q]);

  const historyRows = useMemo(() => {
    let list = history;
    if (cityFilter) list = list.filter((h) => h.branch_city === cityFilter);
    if (q) list = list.filter((h) => matchesText(q, h.branch_code, h.branch_name, h.branch_city));
    return list;
  }, [history, cityFilter, q]);

  const trendDays = useMemo(() => {
    const expected = withMachines.length * SLOT_TIMES.length;
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(date, i - 6);
      const day = trend.find((c) => c.control_date === d);
      const done = day?.checks_done || 0;
      return { date: d, done, withIssue: day?.checks_with_incident || 0, pct: expected ? Math.min(100, Math.round((done / expected) * 100)) : 0 };
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
        reporto: reporterOf(i.operator_name, i.operator_role),
      }))
    );
  };

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        {perSlot.map((p) => (
          <Kpi
            key={p.slot}
            label={`Control ${p.slot}`}
            value={`${p.done}/${p.total}`}
            sub={p.withIssue > 0 ? `⚠ ${p.withIssue} con incidencia` : 'sin incidencias'}
            color={p.total && p.done === p.total ? GREEN : p.done === 0 ? RED : AMBER}
          />
        ))}
      </div>

      <Filters {...filters} />

      <OpenIssuesCard filters={filters} />

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
              <tr><th>Horario</th><th>Sucursal</th><th>Máquina</th><th>Problema</th><th>Observación</th><th>Reportó</th></tr>
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
                  <td className="text-text2">{reporterOf(i.operator_name, i.operator_role)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card !p-0 overflow-hidden mb-4">
        <div className="px-4 pt-3.5 pb-1 text-sm font-semibold">Historial de ediciones del día ({historyRows.length})</div>
        <div className="px-4 pb-2 text-[11.5px] text-text3">
          Cada vez que alguien modifica un informe ya guardado queda registrado acá: quién, cuándo y qué cambió.
        </div>
        {historyRows.length === 0 ? (
          <div className="px-4 pb-5 text-sm text-text3">No hubo ediciones de informes en esta fecha.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="datatable">
              <thead>
                <tr><th>Cuándo</th><th>Sucursal</th><th>Horario</th><th>Editó</th><th>Qué cambió</th></tr>
              </thead>
              <tbody>
                {historyRows.map((h) => (
                  <tr key={h.id}>
                    <td className="font-mono text-text2 whitespace-nowrap">{fmtDateTimePy(h.edited_at)}</td>
                    <td><span className="font-mono text-text3 mr-1.5">{h.branch_code}</span>{h.branch_name}</td>
                    <td className="font-mono">{h.slot}</td>
                    <td className="text-text2">{reporterOf(h.editor_name, h.editor_role)}</td>
                    <td className="text-text2 max-w-[360px]">
                      {describeChanges(h).map((t, k) => <div key={k} className="text-[12px] leading-snug">• {t}</div>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${d.pct}%`, background: pctColor(d.pct) }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------
// Vista SEMANAL / MENSUAL (resumen de un rango de fechas)
// ---------------------------------------------------------------------
function PeriodView({ mode, from, to, closed, branches, configMap, filters }) {
  const { cityFilter, search, onlyIssues } = filters;
  const [rows, setRows] = useState([]);
  const [slotDays, setSlotDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError('');
      const [{ data: br, error: e1 }, { data: sd, error: e2 }] = await Promise.all([
        supabase.rpc('slot_branch_period', { p_from: from, p_to: to }),
        supabase.from('slot_daily_slot_summary').select('*').gte('control_date', from).lte('control_date', to),
      ]);
      if (!alive) return;
      if (e1 || e2) setError((e1 || e2).message);
      setRows(br || []);
      setSlotDays(sd || []);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [from, to]);

  const nBranches = rows.length;
  const days = useMemo(() => datesUpToToday(from, to), [from, to]);
  const expectedPerBranch = useMemo(() => expectedChecksPerBranch(from, to), [from, to]);
  const expectedTotal = nBranches * expectedPerBranch;

  const totals = useMemo(() => {
    const t = { done: 0, withIncident: 0, inside: 0, nearAtc: 0, notOp: 0, branchesWithIncident: 0 };
    rows.forEach((r) => {
      t.done += r.r_checks_done;
      t.withIncident += r.r_checks_with_incident;
      t.inside += r.r_issues_inside;
      t.nearAtc += r.r_issues_near_atc;
      t.notOp += r.r_issues_not_operating;
      if (r.r_checks_with_incident > 0) t.branchesWithIncident += 1;
    });
    t.problems = t.inside + t.nearAtc + t.notOp;
    t.pct = expectedTotal ? Math.min(100, Math.round((t.done / expectedTotal) * 100)) : 0;
    return t;
  }, [rows, expectedTotal]);

  const perSlot = useMemo(
    () =>
      SLOT_TIMES.map((s) => {
        const mine = slotDays.filter((x) => x.slot === s);
        const done = mine.reduce((a, x) => a + x.checks_done, 0);
        const withIssue = mine.reduce((a, x) => a + x.checks_with_incident, 0);
        const expected = nBranches * expectedDaysForSlot(from, to, s);
        return { slot: s, done, withIssue, expected, pct: expected ? Math.min(100, Math.round((done / expected) * 100)) : 0 };
      }),
    [slotDays, nBranches, from, to]
  );

  const perDay = useMemo(
    () =>
      days.map((d) => {
        const mine = slotDays.filter((x) => x.control_date === d);
        const done = mine.reduce((a, x) => a + x.checks_done, 0);
        const withIssue = mine.reduce((a, x) => a + x.checks_with_incident, 0);
        const expected = nBranches * expectedChecksPerBranch(d, d);
        return { date: d, done, withIssue, expected, pct: expected ? Math.min(100, Math.round((done / expected) * 100)) : 0 };
      }),
    [days, slotDays, nBranches]
  );

  const q = search.trim().toLowerCase();
  const tableRows = useMemo(() => {
    let list = rows.map((r) => ({
      ...r,
      problems: r.r_issues_inside + r.r_issues_near_atc + r.r_issues_not_operating,
      pct: expectedPerBranch ? Math.min(100, Math.round((r.r_checks_done / expectedPerBranch) * 100)) : 0,
    }));
    if (cityFilter) list = list.filter((r) => r.r_branch_city === cityFilter);
    if (q) list = list.filter((r) => matchesText(q, r.r_branch_code, r.r_branch_name, r.r_branch_city));
    if (onlyIssues) list = list.filter((r) => r.problems > 0);
    return list.sort((a, b) => b.problems - a.problems || a.r_branch_code.localeCompare(b.r_branch_code));
  }, [rows, cityFilter, q, onlyIssues, expectedPerBranch]);

  const periodName = mode === 'mes' ? 'mes' : 'semana';

  const exportCsv = () => {
    downloadCsv(
      `tragamonedas_resumen_${mode}_${from}_${to}.csv`,
      tableRows.map((r) => ({
        codigo: r.r_branch_code,
        sucursal: r.r_branch_name,
        ciudad: r.r_branch_city,
        maquinas: r.r_machine_count,
        controles_realizados: r.r_checks_done,
        controles_esperados: expectedPerBranch,
        cumplimiento_pct: r.pct,
        controles_con_incidencia: r.r_checks_with_incident,
        sin_sacar: r.r_issues_inside,
        cerca_del_atc: r.r_issues_near_atc,
        apagado: r.r_issues_not_operating,
      }))
    );
  };

  if (error) {
    return (
      <div className="card text-sm text-text2">
        No se pudo cargar el resumen: {error}
        <div className="text-[12px] text-text3 mt-1.5">Si recién se actualizó el sistema, falta correr la migración 0009 en Supabase.</div>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        <Kpi label="Controles realizados" value={`${totals.done}/${expectedTotal}`} sub={`${totals.pct}% de cumplimiento`} color={expectedTotal ? pctColor(totals.pct) : undefined} />
        <Kpi label="Controles con incidencia" value={totals.withIncident} sub={totals.done ? `${Math.round((totals.withIncident / totals.done) * 100)}% de los realizados` : 'sin controles'} color={totals.withIncident > 0 ? '#ff8a3d' : undefined} />
        <Kpi label="Sucursales con incidencia" value={`${totals.branchesWithIncident}/${nBranches}`} sub={`de ${nBranches} con tragamonedas`} />
      </div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Kpi label="Sin sacar" value={totals.inside} sub="máquinas detectadas" color={totals.inside > 0 ? '#ff8a3d' : undefined} />
        <Kpi label="Cerca del ATC" value={totals.nearAtc} sub="máquinas detectadas" color={totals.nearAtc > 0 ? '#ff8a3d' : undefined} />
        <Kpi label="Apagado" value={totals.notOp} sub="máquinas detectadas" color={totals.notOp > 0 ? RED : undefined} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="card">
          <div className="text-sm font-semibold mb-1">Por horario de control</div>
          <div className="text-[11.5px] text-text3 mb-3.5">Controles realizados sobre los esperados en el {periodName}</div>
          <div className="flex flex-col gap-3.5">
            {perSlot.map((p) => (
              <div key={p.slot}>
                <div className="flex justify-between items-center text-[12.5px] mb-1">
                  <span className="font-mono font-medium">{p.slot}</span>
                  <span className="text-text3 font-mono">
                    {p.done}/{p.expected} · {p.pct}%
                    {p.withIssue > 0 && <span className="ml-2 text-orange">⚠ {p.withIssue}</span>}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-surface3 overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-300" style={{ width: `${p.pct}%`, background: pctColor(p.pct) }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="text-sm font-semibold mb-1">Evolución diaria</div>
          <div className="text-[11.5px] text-text3 mb-3">Cumplimiento de controles por día{closed ? '' : ' (hasta hoy)'} — el número naranja son los controles con incidencia</div>
          {perDay.length === 0 ? (
            <div className="text-text3 text-sm py-6 text-center">Todavía no hay días para mostrar.</div>
          ) : (
            <div className="overflow-x-auto">
              <div className="flex items-end gap-1" style={{ minWidth: perDay.length * 24 }}>
                {perDay.map((d) => {
                  const dow = DOW[new Date(`${d.date}T12:00:00Z`).getUTCDay()];
                  return (
                    <div
                      key={d.date}
                      className="flex-1 flex flex-col items-center min-w-[20px]"
                      title={`${fmtControlDate(d.date)} — ${d.done}/${d.expected} controles (${d.pct}%)${d.withIssue ? ` · ${d.withIssue} con incidencia` : ''}`}
                    >
                      <div className="w-full h-24 flex items-end">
                        <div className="w-full rounded-t-[4px] transition-all duration-300" style={{ height: `${Math.max(d.pct, d.done > 0 ? 4 : 0)}%`, background: pctColor(d.pct) }} />
                      </div>
                      <div className="text-[9.5px] text-text3 mt-1 font-mono leading-none">{mode === 'semana' ? dow : d.date.slice(8)}</div>
                      {mode === 'semana' && <div className="text-[9.5px] text-text3 font-mono leading-none mt-0.5">{d.date.slice(8)}</div>}
                      <div className="text-[10px] font-mono mt-0.5 h-3 leading-3 text-orange">{d.withIssue > 0 ? d.withIssue : ''}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <Filters {...filters} />

      <OpenIssuesCard filters={filters} />

      <div className="card !p-0 overflow-hidden">
        <div className="px-4 pt-3.5 pb-2 flex items-center justify-between gap-2 flex-wrap">
          <div className="text-sm font-semibold">Detalle por sucursal — {mode === 'mes' ? 'mes' : 'semana'}</div>
          <button className="btn btn-ghost !text-[12px] !py-1.5" onClick={exportCsv} disabled={tableRows.length === 0}>Exportar CSV</button>
        </div>
        <div className="overflow-x-auto">
          <table className="datatable">
            <thead>
              <tr>
                <th>Código</th><th>Sucursal</th><th>Ciudad</th><th>Máq.</th><th>Controles</th><th>Cumpl.</th><th>Con incidencia</th><th>Sin sacar</th><th>Cerca ATC</th><th>Apagado</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={10} className="text-center text-text3 py-8">Cargando…</td></tr>}
              {!loading && tableRows.length === 0 && <tr><td colSpan={10} className="text-center text-text3 py-8">No hay sucursales para este filtro.</td></tr>}
              {!loading && tableRows.map((r) => (
                <tr key={r.r_branch_id}>
                  <td className="font-mono text-text2">{r.r_branch_code}</td>
                  <td className="font-medium">{r.r_branch_name}</td>
                  <td className="text-text2">{r.r_branch_city}</td>
                  <td className="font-mono">{r.r_machine_count}</td>
                  <td className="font-mono">{r.r_checks_done}/{expectedPerBranch}</td>
                  <td className="font-mono font-semibold" style={{ color: pctColor(r.pct) }}>{r.pct}%</td>
                  <td>{r.r_checks_with_incident > 0 ? <Badge className="badge-orange">{r.r_checks_with_incident}</Badge> : <span className="text-text3">—</span>}</td>
                  <td className="font-mono">{r.r_issues_inside || <span className="text-text3">—</span>}</td>
                  <td className="font-mono">{r.r_issues_near_atc || <span className="text-text3">—</span>}</td>
                  <td className="font-mono">{r.r_issues_not_operating ? <span className="text-red font-semibold">{r.r_issues_not_operating}</span> : <span className="text-text3">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 text-[11.5px] text-text3">
          {tableRows.length} sucursales · ordenadas por cantidad de problemas. Los controles esperados se calculan con las sucursales que tienen tragamonedas hoy.
        </div>
      </div>
    </>
  );
}
