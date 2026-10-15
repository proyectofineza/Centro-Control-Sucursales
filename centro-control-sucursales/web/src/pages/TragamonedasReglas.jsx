import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import Badge from '../components/Badge.jsx';
import { IconSearch } from '../components/icons.jsx';
import { MACHINE_RULES, RULE_LABEL } from '../lib/slots.js';

// Administrador: sucursales con tragamonedas.
//  1) Cantidad de tragamonedas de CADA sucursal (una sucursal nueva se carga acá
//     y pasa a aparecer en Tragamonedas).
//  2) Regla por máquina: "Afuera" (normal), "Siempre adentro" o "Junto al ATC".
//     En las dos últimas solo cuenta como problema que esté apagada.
export default function TragamonedasReglas() {
  const [branches, setBranches] = useState([]);
  const [counts, setCounts] = useState({}); // branch_id -> machine_count (solo las que tienen fila)
  const [rules, setRules] = useState({}); // branch_id -> { machine_no: position }
  const [drafts, setDrafts] = useState({}); // branch_id -> texto de la cantidad que se está escribiendo
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [city, setCity] = useState('');
  const [view, setView] = useState('todas'); // todas | con | sin
  const [openId, setOpenId] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    const [{ data: br, error: e1 }, { data: cfg, error: e2 }, { data: rls, error: e3 }] = await Promise.all([
      supabase.from('branches').select('id, code, name, city').eq('active', true).order('code'),
      supabase.from('slot_branch_config').select('branch_id, machine_count'),
      supabase.from('slot_machine_rules').select('branch_id, machine_no, position'),
    ]);
    const err = e1 || e2 || e3;
    if (err) setError(err.message + ' — si recién se actualizó el sistema, falta correr la migración 0013 en Supabase.');
    setBranches(br || []);
    setCounts(Object.fromEntries((cfg || []).map((c) => [c.branch_id, c.machine_count])));
    const rMap = {};
    (rls || []).forEach((r) => {
      (rMap[r.branch_id] = rMap[r.branch_id] || {})[r.machine_no] = r.position;
    });
    setRules(rMap);
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  const cities = useMemo(() => [...new Set(branches.map((b) => b.city).filter(Boolean))].sort(), [branches]);
  const hasCount = (b) => counts[b.id] !== undefined;
  const nSin = branches.filter((b) => !hasCount(b)).length;
  const nCon = branches.filter((b) => (counts[b.id] || 0) > 0).length;

  const list = useMemo(() => {
    let l = branches;
    if (city) l = l.filter((b) => b.city === city);
    const q = search.trim().toLowerCase();
    if (q) l = l.filter((b) => `${b.code} ${b.name} ${b.city}`.toLowerCase().includes(q));
    if (view === 'con') l = l.filter((b) => (counts[b.id] || 0) > 0);
    if (view === 'sin') l = l.filter((b) => counts[b.id] === undefined);
    return l;
  }, [branches, counts, city, search, view]);

  const saveCount = async (b) => {
    const raw = (drafts[b.id] ?? '').toString().trim();
    const n = Number(raw);
    if (raw === '' || !Number.isInteger(n) || n < 0 || n > 50) return setError('Escribí una cantidad entre 0 y 50.');
    setBusy(true);
    setError('');
    setMsg('');
    const { error: err } = await supabase.rpc('set_slot_branch_count', { p_branch_id: b.id, p_count: n });
    setBusy(false);
    if (err) return setError('No se pudo guardar: ' + err.message);
    setCounts((prev) => ({ ...prev, [b.id]: n }));
    setRules((prev) => {
      const cur = { ...(prev[b.id] || {}) };
      Object.keys(cur).forEach((k) => { if (Number(k) > n) delete cur[k]; });
      return { ...prev, [b.id]: cur };
    });
    setDrafts((prev) => { const d = { ...prev }; delete d[b.id]; return d; });
    setMsg(n > 0 ? `${b.name}: ${n} tragamonedas. Ya aparece en Tragamonedas.` : `${b.name}: sin tragamonedas (no aparece en Tragamonedas).`);
  };

  const setRule = async (b, machineNo, value) => {
    setBusy(true);
    setError('');
    setMsg('');
    const { error: err } = await supabase.rpc('set_slot_machine_rule', { p_branch_id: b.id, p_machine_no: machineNo, p_rule: value });
    setBusy(false);
    if (err) return setError('No se pudo guardar: ' + err.message);
    setRules((prev) => {
      const cur = { ...(prev[b.id] || {}) };
      if (value === 'afuera') delete cur[machineNo]; else cur[machineNo] = value;
      return { ...prev, [b.id]: cur };
    });
    setMsg(`${b.name} · máquina #${machineNo}: ${value === 'afuera' ? 'vuelve a la regla normal' : RULE_LABEL[value] + ' (solo cuenta “Apagado”)'}. Rige desde el próximo control.`);
  };

  return (
    <div>
      <div className="mb-4">
        <div className="text-[11px] text-brand uppercase tracking-widest font-semibold mb-1">Administración</div>
        <h1 className="text-[22px] font-bold tracking-tight">Sucursales — Tragamonedas</h1>
      </div>

      <p className="text-[12.5px] text-text3 mb-4 max-w-[800px]">
        Acá cargás la <b>cantidad de tragamonedas</b> de cada sucursal (si agregás una sucursal nueva, ponele la cantidad y pasa a aparecer en
        Tragamonedas) y, si hace falta, la <b>regla de cada máquina</b>: <b>Siempre adentro</b> o <b>Junto al ATC</b> (en esas solo cuenta como
        problema que esté <b>apagada</b>); el resto se controla normal. Las reglas rigen desde el próximo control; los anteriores no cambian.
      </p>

      {msg && <div className="card mb-3 !py-2.5 text-[12.5px] text-text2 flex justify-between"><span>✔ {msg}</span><button className="text-text3" onClick={() => setMsg('')}>✕</button></div>}
      {error && <div className="card mb-3 !py-2.5 text-[12.5px] text-red">{error}</div>}

      <div className="flex items-center gap-2.5 mb-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-[320px]">
          <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text3" />
          <input className="input !pl-8" placeholder="Buscar por código, nombre o ciudad…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input !w-[170px]" value={city} onChange={(e) => setCity(e.target.value)}>
          <option value="">Todas las ciudades</option>
          {cities.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <Chip active={view === 'todas'} onClick={() => setView('todas')} label={`Todas ${branches.length}`} />
        <Chip active={view === 'con'} onClick={() => setView('con')} label={`Con tragamonedas ${nCon}`} />
        <Chip active={view === 'sin'} onClick={() => setView('sin')} label={`Sin cantidad cargada ${nSin}`} warn={nSin > 0} />
      </div>

      <div className="card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="datatable">
            <thead>
              <tr><th>Código</th><th>Sucursal</th><th>Ciudad</th><th>Cantidad</th><th>Reglas por máquina</th><th></th></tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="text-center text-text3 py-8">Cargando…</td></tr>}
              {!loading && list.length === 0 && <tr><td colSpan={6} className="text-center text-text3 py-8">No hay sucursales para este filtro.</td></tr>}
              {!loading && list.map((b) => {
                const n = counts[b.id];
                const draft = drafts[b.id];
                const dirty = draft !== undefined && draft !== String(n ?? '');
                const bRules = rules[b.id] || {};
                const nRules = Object.keys(bRules).length;
                const open = openId === b.id;
                return (
                  <React.Fragment key={b.id}>
                    <tr>
                      <td className="font-mono text-text2">{b.code}</td>
                      <td className="font-medium">{b.name}</td>
                      <td className="text-text2">{b.city}</td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="0"
                            max="50"
                            className="input !w-[72px] !py-1 text-center"
                            placeholder={n === undefined ? '—' : ''}
                            value={draft ?? (n === undefined ? '' : String(n))}
                            onChange={(e) => setDrafts((p) => ({ ...p, [b.id]: e.target.value }))}
                          />
                          {(dirty || (n === undefined && draft !== undefined)) && (
                            <button className="btn btn-primary !text-[11.5px] !py-1 !px-2.5" disabled={busy} onClick={() => saveCount(b)}>Guardar</button>
                          )}
                          {n === undefined && draft === undefined && <Badge className="badge-amber">Sin cargar</Badge>}
                        </div>
                      </td>
                      <td>
                        {(n || 0) === 0 ? <span className="text-text3 text-[12px]">—</span>
                          : nRules === 0 ? <Badge className="badge-neutral">Todas normales</Badge>
                          : <Badge className="badge-amber">{nRules} con regla</Badge>}
                      </td>
                      <td className="text-right">
                        {(n || 0) > 0 && (
                          <button className="text-[11.5px] text-brand font-semibold hover:underline" onClick={() => setOpenId(open ? null : b.id)}>
                            {open ? 'Cerrar' : 'Reglas →'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {open && (n || 0) > 0 && (
                      <tr>
                        <td colSpan={6} className="!bg-surface2">
                          <div className="flex flex-wrap gap-3 py-1">
                            {Array.from({ length: n }, (_, i) => i + 1).map((m) => (
                              <label key={m} className="flex items-center gap-2 text-[12.5px] text-text2">
                                <span className="font-semibold">Máquina #{m}</span>
                                <select
                                  className="input !w-[160px] !py-1"
                                  value={bRules[m] || 'afuera'}
                                  disabled={busy}
                                  onChange={(e) => setRule(b, m, e.target.value)}
                                >
                                  {MACHINE_RULES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                                </select>
                              </label>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 text-[11.5px] text-text3">{list.length} sucursales · {nCon} con tragamonedas · {nSin} sin cantidad cargada.</div>
      </div>
    </div>
  );
}

function Chip({ active, onClick, label, warn }) {
  return (
    <div
      onClick={onClick}
      className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold border cursor-pointer ${active ? 'bg-brandsoft border-brand text-brand' : warn ? 'bg-surface border-amber/50 text-amber' : 'bg-surface border-border text-text2'}`}
    >
      {label}
    </div>
  );
}
