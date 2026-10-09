import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient.js';
import Badge from '../components/Badge.jsx';
import Kpi from '../components/Kpi.jsx';
import { IconSearch } from '../components/icons.jsx';
import { ROLE_LABEL } from '../lib/format.js';
import { SLOT_TIMES, currentControlDate, suggestedSlot, isSlotInFuture, fmtControlDate } from '../lib/slots.js';

// Estados posibles de una sucursal para el horario elegido.
const ESTADO = {
  sin_relevar: { label: 'Sin relevar', badge: 'badge-neutral' },
  pendiente: { label: 'Pendiente', badge: 'badge-red' },
  ok: { label: 'Controlada', badge: 'badge-green' },
  con_incidencia: { label: 'Con incidencia', badge: 'badge-orange' },
  sin_tragamonedas: { label: 'Sin tragamonedas', badge: 'badge-neutral' },
};

// Lista de sucursales para controlar tragamonedas (Monitoreo y Admin).
export default function TragamonedasControl() {
  const navigate = useNavigate();
  const controlDate = useMemo(() => currentControlDate(), []);
  const [slot, setSlot] = useState(suggestedSlot());
  const [branches, setBranches] = useState([]);
  const [configMap, setConfigMap] = useState({});
  const [checksMap, setChecksMap] = useState({});
  const [whoMap, setWhoMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [estado, setEstado] = useState('todas');
  const [cityFilter, setCityFilter] = useState('');
  const [search, setSearch] = useState('');

  const load = async (s = slot) => {
    setLoading(true);
    const [{ data: br }, { data: cfg }, { data: chk }] = await Promise.all([
      supabase.from('branches').select('id, code, name, city').eq('active', true).order('code'),
      supabase.from('slot_branch_config').select('branch_id, machine_count'),
      supabase.from('slot_checks').select('branch_id, has_incident, machine_count, operator_id').eq('control_date', controlDate).eq('slot', s),
    ]);
    setBranches(br || []);
    const cMap = {};
    (cfg || []).forEach((c) => (cMap[c.branch_id] = c.machine_count));
    setConfigMap(cMap);
    const kMap = {};
    (chk || []).forEach((c) => (kMap[c.branch_id] = c));
    setChecksMap(kMap);
    // Quién reportó cada control (rol + nombre). Si no se pueden leer los
    // perfiles, simplemente no se muestra la columna con datos.
    const ids = [...new Set((chk || []).map((c) => c.operator_id).filter(Boolean))];
    const wMap = {};
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name, role').in('id', ids);
      (profs || []).forEach((p) => (wMap[p.id] = `${ROLE_LABEL[p.role] || p.role} — ${p.full_name}`));
    }
    setWhoMap(wMap);
    setLoading(false);
  };

  useEffect(() => {
    load(slot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot]);

  const rows = useMemo(
    () =>
      branches.map((b) => {
        const count = configMap[b.id];
        const check = checksMap[b.id];
        let status = 'pendiente';
        if (count === undefined) status = 'sin_relevar';
        else if (count === 0) status = 'sin_tragamonedas';
        else if (check) status = check.has_incident ? 'con_incidencia' : 'ok';
        return { branch: b, count, status };
      }),
    [branches, configMap, checksMap]
  );

  const cities = useMemo(() => [...new Set(branches.map((b) => b.city).filter(Boolean))].sort(), [branches]);

  const scoped = useMemo(() => (cityFilter ? rows.filter((r) => r.branch.city === cityFilter) : rows), [rows, cityFilter]);

  const counts = useMemo(() => {
    const c = { todas: scoped.length };
    Object.keys(ESTADO).forEach((k) => (c[k] = scoped.filter((r) => r.status === k).length));
    return c;
  }, [scoped]);

  const filtered = useMemo(() => {
    let list = scoped;
    if (estado !== 'todas') list = list.filter((r) => r.status === estado);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((r) => `${r.branch.code} ${r.branch.name} ${r.branch.city}`.toLowerCase().includes(q));
    return list;
  }, [scoped, estado, search]);

  const withMachines = rows.filter((r) => ['pendiente', 'ok', 'con_incidencia'].includes(r.status));
  const done = withMachines.filter((r) => r.status !== 'pendiente').length;
  const future = isSlotInFuture(controlDate, slot);

  const open = (r) => navigate(`/tragamonedas/control/${r.branch.id}?slot=${encodeURIComponent(slot)}&date=${controlDate}`);

  return (
    <div>
      <div className="flex items-end justify-between mb-5 flex-wrap gap-2">
        <div>
          <div className="text-[11px] text-brand uppercase tracking-widest font-semibold mb-1">Tragamonedas</div>
          <h1 className="text-[22px] font-bold tracking-tight">Control de tragamonedas</h1>
        </div>
        <div className="text-[12px] text-text3">Fecha de control: {fmtControlDate(controlDate)}</div>
      </div>

      <div className="flex gap-1 bg-surface border border-border rounded-[10px] p-1 w-fit mb-3">
        {SLOT_TIMES.map((s) => (
          <div
            key={s}
            onClick={() => { setSlot(s); setEstado('todas'); }}
            className={`px-4 py-2 rounded-[7px] text-[12.5px] font-semibold cursor-pointer font-mono ${slot === s ? 'bg-brand text-white' : 'text-text2'}`}
          >
            {s}
          </div>
        ))}
      </div>

      {future && (
        <div className="card !py-2.5 mb-3 text-[12.5px] text-text2 border-amber/40">
          Todavía no llegó la hora del control de las {slot}. Verificá que estés cargando el horario correcto.
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Kpi label={`Controladas ${slot}`} value={`${done}/${withMachines.length}`} sub="sucursales con tragamonedas" color={withMachines.length && done === withMachines.length ? '#22e2a0' : undefined} />
        <Kpi label="Pendientes" value={counts.pendiente} color="#ff5468" pulse={counts.pendiente > 0} />
        <Kpi label="Con incidencia" value={counts.con_incidencia} color="#ff8a3d" />
        <Kpi label="Sin relevar" value={counts.sin_relevar} sub="falta contar las máquinas" />
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
        <div className="flex gap-1.5 flex-wrap">
          <Chip active={estado === 'todas'} onClick={() => setEstado('todas')} label={`Todas ${counts.todas}`} />
          {Object.keys(ESTADO).map((k) => (
            <Chip key={k} active={estado === k} onClick={() => setEstado(k)} label={`${ESTADO[k].label} ${counts[k]}`} />
          ))}
        </div>
      </div>

      <div className="card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="datatable">
            <thead>
              <tr><th>Código</th><th>Sucursal</th><th>Ciudad</th><th>Máquinas</th><th>Estado {slot}</th><th>Reportó</th><th></th></tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="text-center text-text3 py-8">Cargando…</td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={7} className="text-center text-text3 py-8">No hay sucursales para este filtro.</td></tr>}
              {!loading && filtered.map((r) => (
                <tr key={r.branch.id}>
                  <td className="font-mono text-text2">{r.branch.code}</td>
                  <td className="font-medium">{r.branch.name}</td>
                  <td className="text-text2">{r.branch.city}</td>
                  <td className="font-mono">{r.count === undefined ? '—' : r.count}</td>
                  <td><Badge className={ESTADO[r.status].badge}>{ESTADO[r.status].label}</Badge></td>
                  <td className="text-text2 text-[12px]">{whoMap[checksMap[r.branch.id]?.operator_id] || '—'}</td>
                  <td className="text-right">
                    <button className="text-[12px] font-semibold text-brand hover:underline" onClick={() => open(r)}>
                      {r.status === 'sin_relevar' ? 'Relevar →' : r.status === 'sin_tragamonedas' ? 'Editar cantidad' : r.status === 'pendiente' ? 'Controlar →' : 'Ver / editar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 text-[11.5px] text-text3">Mostrando {filtered.length} de {rows.length} sucursales</div>
      </div>
    </div>
  );
}

function Chip({ active, onClick, label }) {
  return (
    <div
      onClick={onClick}
      className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold border cursor-pointer ${active ? 'bg-brandsoft border-brand text-brand' : 'bg-surface border-border text-text2'}`}
    >
      {label}
    </div>
  );
}
