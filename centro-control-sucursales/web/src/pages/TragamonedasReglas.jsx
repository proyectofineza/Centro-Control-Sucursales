import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import Badge from '../components/Badge.jsx';
import { IconSearch } from '../components/icons.jsx';

// Administrador: reglas por sucursal para el control de tragamonedas.
// "Junto al ATC por diseño": en esas sucursales el tragamonedas queda adentro,
// cerca del ATC, para funcionar. Solo cuenta como problema que esté apagado.
export default function TragamonedasReglas() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [search, setSearch] = useState('');
  const [city, setCity] = useState('');
  const [onlyRule, setOnlyRule] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    const [{ data: cfg, error: e1 }, { data: br, error: e2 }] = await Promise.all([
      supabase.from('slot_branch_config').select('branch_id, machine_count, atc_ok').gt('machine_count', 0),
      supabase.from('branches').select('id, code, name, city').eq('active', true).order('code'),
    ]);
    if (e1 || e2) setError((e1 || e2).message + ' — si recién se actualizó el sistema, falta correr la migración 0013 en Supabase.');
    const cMap = Object.fromEntries((cfg || []).map((c) => [c.branch_id, c]));
    setRows((br || []).filter((b) => cMap[b.id]).map((b) => ({ ...b, machines: cMap[b.id].machine_count, atc_ok: !!cMap[b.id].atc_ok })));
    setSelected(new Set());
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  const cities = useMemo(() => [...new Set(rows.map((r) => r.city).filter(Boolean))].sort(), [rows]);
  const q = search.trim().toLowerCase();
  const list = useMemo(() => {
    let l = rows;
    if (city) l = l.filter((r) => r.city === city);
    if (q) l = l.filter((r) => `${r.code} ${r.name} ${r.city}`.toLowerCase().includes(q));
    if (onlyRule) l = l.filter((r) => r.atc_ok);
    return l;
  }, [rows, city, q, onlyRule]);

  const apply = async (ids, value) => {
    if (!ids.length) return;
    setBusy(true);
    setError('');
    setMsg('');
    const { error: err } = await supabase.rpc('set_slot_branch_rule', { p_branch_ids: ids, p_atc_ok: value });
    setBusy(false);
    if (err) return setError('No se pudo guardar: ' + err.message);
    setRows((prev) => prev.map((r) => (ids.includes(r.id) ? { ...r, atc_ok: value } : r)));
    setSelected(new Set());
    setMsg(value ? `${ids.length} sucursal(es) marcadas: solo “Apagado” cuenta como problema.` : `${ids.length} sucursal(es) vuelven a la regla normal.`);
  };

  const toggleSel = (id) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allVisibleSelected = list.length > 0 && list.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected(allVisibleSelected ? new Set() : new Set(list.map((r) => r.id)));
  const nRule = rows.filter((r) => r.atc_ok).length;

  return (
    <div>
      <div className="mb-4">
        <div className="text-[11px] text-brand uppercase tracking-widest font-semibold mb-1">Administración</div>
        <h1 className="text-[22px] font-bold tracking-tight">Reglas por sucursal — Tragamonedas</h1>
      </div>

      <p className="text-[12.5px] text-text3 mb-4 max-w-[780px]">
        Marcá las sucursales donde el tragamonedas queda <b>adentro, junto al ATC, para funcionar</b>. En esas sucursales “Sin sacar” y
        “Cerca del ATC” <b>no cuentan como problema</b>: solo penaliza que esté <b>apagado</b>. La regla rige desde el próximo control; los
        controles anteriores no cambian.
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
        <div
          onClick={() => setOnlyRule((v) => !v)}
          className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold border cursor-pointer ${onlyRule ? 'bg-brandsoft border-brand text-brand' : 'bg-surface border-border text-text2'}`}
        >
          Solo con regla ({nRule})
        </div>
        {selected.size > 0 && (
          <div className="flex gap-2 ml-auto">
            <button className="btn btn-primary !text-[12px] !py-1.5" disabled={busy} onClick={() => apply([...selected], true)}>Marcar {selected.size} como junto al ATC</button>
            <button className="btn btn-ghost !text-[12px] !py-1.5" disabled={busy} onClick={() => apply([...selected], false)}>Quitar regla</button>
          </div>
        )}
      </div>

      <div className="card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="datatable">
            <thead>
              <tr>
                <th style={{ width: 36 }}><input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} aria-label="Seleccionar todas" /></th>
                <th>Código</th><th>Sucursal</th><th>Ciudad</th><th>Máquinas</th><th>Regla</th><th></th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="text-center text-text3 py-8">Cargando…</td></tr>}
              {!loading && list.length === 0 && <tr><td colSpan={7} className="text-center text-text3 py-8">No hay sucursales para este filtro.</td></tr>}
              {!loading && list.map((r) => (
                <tr key={r.id}>
                  <td><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSel(r.id)} /></td>
                  <td className="font-mono text-text2">{r.code}</td>
                  <td className="font-medium">{r.name}</td>
                  <td className="text-text2">{r.city}</td>
                  <td className="font-mono">{r.machines}</td>
                  <td>{r.atc_ok ? <Badge className="badge-amber">Junto al ATC: solo Apagado</Badge> : <Badge className="badge-neutral">Normal</Badge>}</td>
                  <td className="text-right">
                    <button className="text-[11.5px] text-brand font-semibold hover:underline" disabled={busy} onClick={() => apply([r.id], !r.atc_ok)}>
                      {r.atc_ok ? 'Quitar regla' : 'Marcar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 text-[11.5px] text-text3">{list.length} sucursales con tragamonedas · {nRule} con la regla “junto al ATC”.</div>
      </div>
    </div>
  );
}
