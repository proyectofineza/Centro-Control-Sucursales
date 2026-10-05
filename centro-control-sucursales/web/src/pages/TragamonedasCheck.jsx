import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient.js';
import Badge from '../components/Badge.jsx';
import { IconCheck, IconAlert } from '../components/icons.jsx';
import { SLOT_TIMES, SLOT_CHECKS, currentControlDate, fmtControlDate, issuesOf } from '../lib/slots.js';

const MAX_MACHINES = 50;

const newItem = (n) => ({ machine_no: n, is_outside: true, far_from_atc: true, is_operating: true, observation: '' });

// Formulario de control de tragamonedas de UNA sucursal en UN horario.
// Primer control de la sucursal: pide contar cuántas máquinas hay.
export default function TragamonedasCheck() {
  const { branchId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const slot = SLOT_TIMES.includes(params.get('slot')) ? params.get('slot') : SLOT_TIMES[0];
  const controlDate = params.get('date') || currentControlDate();

  const [branch, setBranch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState('count'); // count | checklist | confirm | done
  const [hasConfig, setHasConfig] = useState(false);
  const [count, setCount] = useState('');
  const [items, setItems] = useState([]);
  const [notes, setNotes] = useState('');
  const [existing, setExisting] = useState(null); // control ya registrado para este horario
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [doneSummary, setDoneSummary] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const [{ data: b }, { data: cfg }, { data: chk }] = await Promise.all([
        supabase.from('branches').select('id, code, name, city').eq('id', branchId).single(),
        supabase.from('slot_branch_config').select('machine_count').eq('branch_id', branchId).maybeSingle(),
        supabase.from('slot_checks').select('id, operator_id, notes, created_at').eq('branch_id', branchId).eq('control_date', controlDate).eq('slot', slot).maybeSingle(),
      ]);
      let prevItems = [];
      let operatorName = null;
      if (chk) {
        const [{ data: its }, { data: prof }] = await Promise.all([
          supabase.from('slot_check_items').select('*').eq('check_id', chk.id).order('machine_no'),
          supabase.from('profiles').select('full_name').eq('id', chk.operator_id).maybeSingle(),
        ]);
        prevItems = its || [];
        operatorName = prof?.full_name || null;
      }
      if (!alive) return;
      setBranch(b || null);
      if (cfg) {
        setHasConfig(true);
        setCount(String(cfg.machine_count));
        if (cfg.machine_count > 0) {
          setItems(
            Array.from({ length: cfg.machine_count }, (_, i) => {
              const old = prevItems.find((x) => x.machine_no === i + 1);
              return old ? { ...old, observation: old.observation || '' } : newItem(i + 1);
            })
          );
          setPhase('checklist');
        } else {
          setPhase('count');
        }
      } else {
        setPhase('count');
      }
      if (chk) {
        setExisting({ operatorName, createdAt: chk.created_at });
        setNotes(chk.notes || '');
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [branchId, slot, controlDate]);

  const countNum = count === '' ? NaN : Number(count);
  const countValid = Number.isInteger(countNum) && countNum >= 0 && countNum <= MAX_MACHINES;

  // Cambia la cantidad de máquinas conservando lo ya marcado.
  const resizeItems = (n) => {
    setItems((prev) => Array.from({ length: n }, (_, i) => prev[i] || newItem(i + 1)));
  };

  const confirmCount = async () => {
    if (!countValid) return;
    if (countNum === 0) {
      // Sucursal sin tragamonedas: se guarda la cantidad y listo.
      setSaving(true);
      setError('');
      const { error: err } = await supabase.rpc('save_slot_check', {
        p_branch_id: branchId, p_control_date: controlDate, p_slot: slot, p_machine_count: 0, p_items: [], p_notes: null,
      });
      setSaving(false);
      if (err) { setError('No se pudo guardar: ' + err.message); return; }
      setDoneSummary({ sinMaquinas: true });
      setPhase('done');
      return;
    }
    resizeItems(countNum);
    setPhase('checklist');
  };

  const setItem = (idx, patch) => setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const problems = useMemo(() => items.filter((it) => issuesOf(it).length > 0), [items]);

  const save = async () => {
    setSaving(true);
    setError('');
    const payload = items.map((it) => ({
      machine_no: it.machine_no,
      is_outside: it.is_outside,
      far_from_atc: it.far_from_atc,
      is_operating: it.is_operating,
      observation: it.observation || null,
    }));
    const { error: err } = await supabase.rpc('save_slot_check', {
      p_branch_id: branchId,
      p_control_date: controlDate,
      p_slot: slot,
      p_machine_count: items.length,
      p_items: payload,
      p_notes: notes || null,
    });
    setSaving(false);
    if (err) {
      setPhase('checklist');
      setError('No se pudo guardar el control: ' + err.message);
      return;
    }
    setDoneSummary({ maquinas: items.length, incidencias: problems.length });
    setPhase('done');
  };

  const back = () => navigate('/tragamonedas');

  if (loading) return <div className="text-text3 text-sm py-10 text-center">Cargando…</div>;
  if (!branch) {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center">
        <div className="text-lg font-semibold mb-2">No se encontró la sucursal</div>
        <Link to="/tragamonedas" className="btn btn-primary">← Volver</Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="card flex items-center justify-between mb-4">
        <div>
          <div className="font-mono text-brand text-xs font-semibold tracking-wide">SUCURSAL {branch.code}</div>
          <div className="text-xl font-bold mt-0.5">{branch.name}</div>
          <div className="text-xs text-text3">{branch.city}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-text3 mb-1">Control de las <span className="font-mono text-text2 font-semibold">{slot}</span></div>
          <div className="text-[11px] text-text3 mb-1.5">{fmtControlDate(controlDate)}</div>
          <Badge className="badge-amber">TRAGAMONEDAS</Badge>
        </div>
      </div>

      {existing && phase !== 'done' && (
        <div className="card !py-2.5 mb-4 text-[12.5px] text-text2 border-amber/40">
          Ya hay un control registrado para este horario{existing.operatorName ? ` por ${existing.operatorName}` : ''}. Si lo guardás de nuevo, se reemplaza (queda constancia en Auditoría).
        </div>
      )}

      {phase === 'count' && (
        <div className="card">
          <div className="font-semibold text-sm mb-1">{hasConfig ? 'Cantidad de tragamonedas' : 'Primer control de esta sucursal'}</div>
          <p className="text-[12.5px] text-text3 mb-4">
            {hasConfig
              ? 'Corregí la cantidad si cambió.'
              : 'Contá cuántos tragamonedas hay en la sucursal. Este número queda guardado y se usa en los próximos controles.'}
          </p>
          <span className="block text-[11px] font-bold text-text2 uppercase tracking-wide mb-2">¿Cuántos tragamonedas hay? (0 si no tiene)</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_MACHINES}
            className="input !w-32 font-mono text-lg"
            value={count}
            onChange={(e) => setCount(e.target.value)}
            autoFocus
          />
          {count !== '' && !countValid && <div className="text-[12px] text-red mt-2">Ingresá un número entero entre 0 y {MAX_MACHINES}.</div>}
          {error && <div className="text-[12.5px] text-red mt-3">{error}</div>}
          <div className="flex gap-2.5 justify-end mt-5">
            <button className="btn btn-ghost" onClick={back}>Cancelar</button>
            <button className={`btn ${countValid && !saving ? 'btn-primary' : 'btn-disabled'}`} disabled={!countValid || saving} onClick={confirmCount}>
              {saving ? 'Guardando…' : countNum === 0 ? 'Guardar: sin tragamonedas' : 'Continuar al control →'}
            </button>
          </div>
        </div>
      )}

      {phase === 'checklist' && (
        <>
          <div className="flex items-center justify-between mb-3 text-[12.5px] text-text2">
            <span>{items.length} tragamonedas en esta sucursal</span>
            <button className="text-brand font-semibold hover:underline" onClick={() => setPhase('count')}>Cambiar cantidad</button>
          </div>

          <div className="flex flex-col gap-3 mb-4">
            {items.map((it, idx) => {
              const issues = issuesOf(it);
              return (
                <div key={it.machine_no} className={`card !p-4 ${issues.length ? 'border-orange/50' : ''}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-semibold text-sm">Tragamonedas #{it.machine_no}</div>
                    {issues.length > 0 ? <Badge className="badge-orange">{issues.length} problema{issues.length > 1 ? 's' : ''}</Badge> : <Badge className="badge-green">Todo en orden</Badge>}
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {SLOT_CHECKS.map((c) => (
                      <div key={c.key} className="flex items-center justify-between gap-3 flex-wrap">
                        <span className="text-[12.8px] text-text2">{c.label}</span>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => setItem(idx, { [c.key]: true })}
                            className={`px-3 py-1.5 rounded-[9px] text-[12px] font-semibold border ${it[c.key] ? 'bg-greensoft border-green/50 text-green' : 'bg-surface2 border-border text-text3'}`}
                          >
                            {c.ok}
                          </button>
                          <button
                            type="button"
                            onClick={() => setItem(idx, { [c.key]: false })}
                            className={`px-3 py-1.5 rounded-[9px] text-[12px] font-semibold border ${!it[c.key] ? 'bg-orangesoft border-orange/50 text-orange' : 'bg-surface2 border-border text-text3'}`}
                          >
                            {c.bad}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {issues.length > 0 && (
                    <textarea
                      className="input min-h-[60px] resize-none mt-3"
                      placeholder="Detalle de lo observado (opcional)…"
                      value={it.observation}
                      onChange={(e) => setItem(idx, { observation: e.target.value })}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="card mb-4 !p-4">
            <span className="block text-[11px] font-bold text-text2 uppercase tracking-wide mb-2">Observación general (opcional)</span>
            <textarea className="input min-h-[60px] resize-none" placeholder="Algo que quieras dejar anotado sobre esta sucursal…" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {error && <div className="text-[12.5px] text-red mb-3">{error}</div>}

          <div className="flex gap-2.5 justify-end">
            <button className="btn btn-ghost" onClick={back}>Cancelar</button>
            <button className="btn btn-primary" onClick={() => setPhase('confirm')}>Guardar control</button>
          </div>
        </>
      )}

      {phase === 'confirm' && (
        <>
          <div className="card mb-4 opacity-60 pointer-events-none">
            <div className="text-sm text-text3">Revisando control…</div>
          </div>
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
            <div className="card w-full max-w-[400px]">
              <div className="font-bold text-[15.5px] mb-2">Confirmar control de las {slot}</div>
              {problems.length === 0 ? (
                <p className="text-[13px] text-text2 leading-relaxed mb-5">
                  ¿Confirmás que los {items.length} tragamonedas de <b className="text-text">{branch.code} — {branch.name}</b> están afuera, alejados del ATC y funcionando?
                </p>
              ) : (
                <div className="mb-5">
                  <p className="text-[13px] text-text2 mb-2.5">Se van a registrar <b className="text-orange">{problems.length} tragamonedas con incidencia</b>:</p>
                  <div className="flex flex-col gap-1.5">
                    {problems.map((p) => (
                      <div key={p.machine_no} className="text-[12.5px] bg-surface2 border border-border rounded-lg px-3 py-2">
                        <b>#{p.machine_no}</b> — {issuesOf(p).join(', ')}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-2.5 justify-end">
                <button className="btn btn-ghost" onClick={() => setPhase('checklist')} disabled={saving}>Volver</button>
                <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Confirmar'}</button>
              </div>
            </div>
          </div>
        </>
      )}

      {phase === 'done' && doneSummary && (
        <div className="card flex flex-col items-center text-center">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-2 ${doneSummary.incidencias ? 'bg-orangesoft' : 'bg-greensoft'}`}>
            {doneSummary.incidencias ? <IconAlert width={28} height={28} className="text-orange" /> : <IconCheck width={28} height={28} className="text-green" />}
          </div>
          <h2 className="text-lg font-semibold mt-1 mb-1">{doneSummary.sinMaquinas ? 'Sucursal registrada sin tragamonedas' : 'Control registrado'}</h2>
          <p className="text-[13px] text-text2 mb-5">Sucursal {branch.code} — {branch.name}</p>
          {!doneSummary.sinMaquinas && (
            <div className="w-full text-left text-sm">
              <Row label="Horario" value={slot} />
              <Row label="Tragamonedas controlados" value={doneSummary.maquinas} />
              <Row label="Con incidencia" value={doneSummary.incidencias} />
            </div>
          )}
          <button className="btn btn-primary w-full mt-5" onClick={back}>Volver al listado →</button>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between py-2.5 border-b border-bordersoft last:border-none">
      <span className="text-text3">{label}</span>
      <span className="font-mono font-semibold">{value}</span>
    </div>
  );
}
