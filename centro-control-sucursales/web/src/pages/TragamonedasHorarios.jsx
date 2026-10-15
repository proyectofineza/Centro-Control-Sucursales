import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import Badge from '../components/Badge.jsx';
import { IconPlus } from '../components/icons.jsx';
import { currentControlDate, addDays, fmtControlDate, slotTimesFor } from '../lib/slots.js';
import { useScheduleReload, flash } from '../lib/schedule.jsx';

const DAYS = [
  { key: 'all', label: 'Todos los días', wd: true, we: true },
  { key: 'wd', label: 'Lunes a viernes', wd: true, we: false },
  { key: 'we', label: 'Sábados y domingos', wd: false, we: true },
];
const daysKey = (r) => (r.on_weekdays && r.on_weekend ? 'all' : r.on_weekdays ? 'wd' : 'we');
const daysLabel = (r) => DAYS.find((d) => d.key === daysKey(r)).label;
const TIME_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

// Administrador: editar los horarios de control de tragamonedas.
export default function TragamonedasHorarios() {
  const reload = useScheduleReload();
  const today = useMemo(() => currentControlDate(), []);
  const [rows, setRows] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(flash.msg || '');
  const [error, setError] = useState('');
  const [form, setForm] = useState({ slot: '', days: 'all', valid_from: today });
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    flash.msg = '';
  }, []);

  const load = async () => {
    setLoading(true);
    const { data, error: err } = await supabase.from('slot_schedule').select('*').order('slot').order('valid_from');
    if (err) setError(err.message);
    setRows(data || []);
    setDrafts({});
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  const statusOf = (r) => {
    if (r.valid_to && r.valid_to < today) return 'ended';
    if (r.valid_from > today) return 'future';
    return 'active';
  };

  const draftOf = (r) => ({ days: daysKey(r), valid_from: r.valid_from, valid_to: r.valid_to || '', ...(drafts[r.id] || {}) });
  const setDraft = (id, patch) => setDrafts((d) => ({ ...d, [id]: { ...(d[id] || {}), ...patch } }));
  const dirty = (r) => drafts[r.id] && Object.keys(drafts[r.id]).length > 0;

  const done = async (text) => {
    flash.msg = text;
    await reload(); // vuelve a dibujar la app con los horarios nuevos
  };

  const saveRow = async (r) => {
    const d = draftOf(r);
    if (d.valid_to && d.valid_to < d.valid_from) {
      setError('La fecha "Hasta" no puede ser anterior a "Desde".');
      return;
    }
    const dk = DAYS.find((x) => x.key === d.days);
    setBusy(r.id);
    setError('');
    const { error: err } = await supabase
      .from('slot_schedule')
      .update({ on_weekdays: dk.wd, on_weekend: dk.we, valid_from: d.valid_from, valid_to: d.valid_to || null })
      .eq('id', r.id);
    setBusy('');
    if (err) return setError('No se pudo guardar: ' + err.message);
    await done(`Horario ${r.slot} actualizado.`);
  };

  const endRow = async (r) => {
    const yesterday = addDays(today, -1);
    if (!window.confirm(`¿Dar de baja el horario ${r.slot}? Deja de controlarse desde hoy; los días anteriores no cambian.`)) return;
    setBusy(r.id);
    const to = r.valid_from > yesterday ? r.valid_from : yesterday;
    const { error: err } = await supabase.from('slot_schedule').update({ valid_to: to }).eq('id', r.id);
    setBusy('');
    if (err) return setError('No se pudo dar de baja: ' + err.message);
    await done(`Horario ${r.slot} dado de baja.`);
  };

  const addRow = async () => {
    setError('');
    const slot = form.slot.trim();
    if (!TIME_RE.test(slot)) return setError('Escribí la hora con formato HH:MM, por ejemplo 15:30.');
    const dk = DAYS.find((x) => x.key === form.days);
    // Evita duplicar el mismo horario vigente en los mismos días.
    const clash = rows.find(
      (r) => r.slot === slot && statusOf(r) !== 'ended' && ((r.on_weekdays && dk.wd) || (r.on_weekend && dk.we))
    );
    if (clash) return setError(`Ya existe un horario ${slot} vigente para esos días. Editalo o dalo de baja primero.`);
    setBusy('new');
    const { error: err } = await supabase.from('slot_schedule').insert({ slot, on_weekdays: dk.wd, on_weekend: dk.we, valid_from: form.valid_from || today });
    setBusy('');
    if (err) return setError('No se pudo agregar: ' + err.message);
    await done(`Horario ${slot} agregado.`);
  };

  // Vista previa: cómo queda hoy un día de semana y un fin de semana.
  const preview = useMemo(() => {
    // Próximo día de semana y próximo fin de semana (hoy cuenta si corresponde).
    const dowToday = new Date(`${today}T12:00:00Z`).getUTCDay();
    const wd = dowToday >= 1 && dowToday <= 5 ? today : addDays(today, dowToday === 6 ? 2 : 1);
    const we = dowToday === 0 || dowToday === 6 ? today : addDays(today, 6 - dowToday);
    return { wd: slotTimesFor(wd), we: slotTimesFor(we) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, today]);

  const badge = (r) => {
    const st = statusOf(r);
    return st === 'active' ? <Badge className="badge-green">Vigente</Badge> : st === 'future' ? <Badge className="badge-amber">Próximo</Badge> : <Badge className="badge-neutral">Dado de baja</Badge>;
  };

  return (
    <div>
      <div className="flex items-end justify-between mb-4 flex-wrap gap-2">
        <div>
          <div className="text-[11px] text-brand uppercase tracking-widest font-semibold mb-1">Administración</div>
          <h1 className="text-[22px] font-bold tracking-tight">Horarios de control — Tragamonedas</h1>
        </div>
        <button className="btn btn-primary !text-[12px]" onClick={() => { setShowForm((v) => !v); setError(''); }}>
          <IconPlus /> Agregar horario
        </button>
      </div>

      <p className="text-[12.5px] text-text3 mb-4 max-w-[760px]">
        Acá definís a qué horas se controlan los tragamonedas y en qué días. Los cambios rigen desde la fecha “Desde”; los días anteriores
        mantienen los horarios que tenían, así el cumplimiento de semanas y meses ya cerrados no se altera. Para <b>cambiar la hora</b> de un
        control, dá de baja el horario viejo y agregá el nuevo.
      </p>

      {msg && (
        <div className="card mb-4 !py-2.5 text-[12.5px] text-text2 flex justify-between items-center">
          <span>✔ {msg}</span>
          <button className="text-text3 hover:text-text" onClick={() => setMsg('')}>✕</button>
        </div>
      )}
      {error && (
        <div className="card mb-4 !py-2.5 text-[12.5px] text-red flex justify-between items-center">
          <span>{error}</span>
          <button className="text-text3 hover:text-text" onClick={() => setError('')}>✕</button>
        </div>
      )}

      {showForm && (
        <div className="card mb-4">
          <div className="text-sm font-semibold mb-3">Agregar horario</div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div>
              <div className="text-[10.5px] text-text3 uppercase tracking-wide mb-1">Hora</div>
              <input className="input font-mono" type="time" value={form.slot} onChange={(e) => setForm({ ...form, slot: e.target.value })} />
            </div>
            <div>
              <div className="text-[10.5px] text-text3 uppercase tracking-wide mb-1">Días</div>
              <select className="input" value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })}>
                {DAYS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
            </div>
            <div>
              <div className="text-[10.5px] text-text3 uppercase tracking-wide mb-1">Rige desde</div>
              <input className="input" type="date" value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <button className="btn btn-primary" disabled={busy === 'new'} onClick={addRow}>{busy === 'new' ? 'Guardando…' : 'Agregar'}</button>
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div className="card">
          <div className="text-[10.5px] text-text3 uppercase tracking-wide mb-1.5">Un día de semana (lunes a viernes)</div>
          <div className="flex gap-1.5 flex-wrap">{preview.wd.length ? preview.wd.map((s) => <span key={s} className="font-mono text-[13px] px-2 py-1 rounded-md bg-surface2 border border-border">{s}</span>) : <span className="text-text3 text-sm">Sin controles</span>}</div>
        </div>
        <div className="card">
          <div className="text-[10.5px] text-text3 uppercase tracking-wide mb-1.5">Un sábado o domingo</div>
          <div className="flex gap-1.5 flex-wrap">{preview.we.length ? preview.we.map((s) => <span key={s} className="font-mono text-[13px] px-2 py-1 rounded-md bg-surface2 border border-border">{s}</span>) : <span className="text-text3 text-sm">Sin controles</span>}</div>
        </div>
      </div>

      <div className="card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="datatable">
            <thead><tr><th>Hora</th><th>Días</th><th>Rige desde</th><th>Hasta (opcional)</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="text-center text-text3 py-8">Cargando…</td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={6} className="text-center text-text3 py-8">No hay horarios cargados. Falta correr la migración 0012 en Supabase o agregar uno.</td></tr>}
              {!loading && rows.map((r) => {
                const d = draftOf(r);
                const ended = statusOf(r) === 'ended';
                return (
                  <tr key={r.id} className={ended ? 'opacity-60' : ''}>
                    <td className="font-mono font-semibold text-[14px]">{r.slot}</td>
                    <td>
                      <select className="bg-transparent border border-border rounded-md px-2 py-1 text-[12px]" value={d.days} onChange={(e) => setDraft(r.id, { days: e.target.value })}>
                        {DAYS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                      </select>
                    </td>
                    <td><input className="bg-transparent border border-border rounded-md px-2 py-1 text-[12px] font-mono" type="date" value={d.valid_from} onChange={(e) => setDraft(r.id, { valid_from: e.target.value })} /></td>
                    <td><input className="bg-transparent border border-border rounded-md px-2 py-1 text-[12px] font-mono" type="date" value={d.valid_to} onChange={(e) => setDraft(r.id, { valid_to: e.target.value })} /></td>
                    <td>{badge(r)}</td>
                    <td className="text-right whitespace-nowrap">
                      {dirty(r) && (
                        <button className="text-[11.5px] text-brand font-semibold hover:underline mr-3" disabled={busy === r.id} onClick={() => saveRow(r)}>
                          {busy === r.id ? 'Guardando…' : 'Guardar'}
                        </button>
                      )}
                      {!ended && (
                        <button className="text-[11.5px] hover:underline text-red" disabled={busy === r.id} onClick={() => endRow(r)}>Dar de baja</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 text-[11.5px] text-text3">
          {rows.length} horarios. Un horario “dado de baja” se conserva para que los reportes de esas fechas sigan leyéndose bien.
        </div>
      </div>
    </div>
  );
}
