import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient.js';
import { useAuth } from '../lib/auth.jsx';
import Badge from '../components/Badge.jsx';
import { IconCheck, IconAlert } from '../components/icons.jsx';
import { ROLE_LABEL } from '../lib/format.js';
import {
  SLOT_TIMES, SLOT_CHECKS, ISSUE_BY_KEY, EDIT_WINDOW_SECONDS,
  currentControlDate, fmtControlDate, fmtShortDate, fmtDateTimePy, issuesOf, describeChanges,
} from '../lib/slots.js';

const MAX_MACHINES = 50;

const newItem = (n) => ({ machine_no: n, is_outside: true, far_from_atc: true, is_operating: true, observation: '' });

// Formulario de control de tragamonedas de UNA sucursal en UN horario.
//  - Quien reporta puede editar el informe durante 60 segundos después de guardarlo.
//  - Pasado ese tiempo queda cerrado (solo lo edita un Administrador).
//  - Toda edición queda en el historial.
export default function TragamonedasCheck() {
  const { branchId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { profile, role } = useAuth();
  const slot = SLOT_TIMES.includes(params.get('slot')) ? params.get('slot') : SLOT_TIMES[0];
  const controlDate = params.get('date') || currentControlDate();

  const [branch, setBranch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState('count'); // count | checklist | confirm | done | readonly
  const [hasConfig, setHasConfig] = useState(false);
  const [count, setCount] = useState('');
  const [items, setItems] = useState([]);
  const [notes, setNotes] = useState('');
  const [existing, setExisting] = useState(null); // { id, createdAt, operatorName, operatorRole }
  const [canEdit, setCanEdit] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [history, setHistory] = useState([]);
  const [openIssues, setOpenIssues] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [doneSummary, setDoneSummary] = useState(null);

  // Cuenta regresiva de edición (solo quien reporta, no el Administrador)
  const [deadline, setDeadline] = useState(null); // performance.now() en que se cierra
  const [secondsLeft, setSecondsLeft] = useState(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const loadHistory = useCallback(async (checkId) => {
    if (!checkId) return setHistory([]);
    const { data } = await supabase.from('slot_history_detailed').select('*').eq('check_id', checkId).order('edited_at', { ascending: false });
    setHistory(data || []);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [{ data: b }, { data: cfg }, { data: chk }, { data: open }] = await Promise.all([
      supabase.from('branches').select('id, code, name, city').eq('id', branchId).single(),
      supabase.from('slot_branch_config').select('machine_count').eq('branch_id', branchId).maybeSingle(),
      supabase.from('slot_checks').select('id, operator_id, notes, created_at').eq('branch_id', branchId).eq('control_date', controlDate).eq('slot', slot).maybeSingle(),
      supabase.from('slot_open_issues').select('*').eq('branch_id', branchId),
    ]);
    setBranch(b || null);
    setOpenIssues(open || []);

    let prevItems = [];
    let ex = null;
    let status = { can_edit: true, is_admin: role === 'admin', seconds_left: null };
    if (chk) {
      const [{ data: its }, { data: prof }, { data: st }] = await Promise.all([
        supabase.from('slot_check_items').select('*').eq('check_id', chk.id).order('machine_no'),
        supabase.from('profiles').select('full_name, role').eq('id', chk.operator_id).maybeSingle(),
        supabase.rpc('slot_check_edit_status', { p_check_id: chk.id }),
      ]);
      prevItems = its || [];
      ex = { id: chk.id, createdAt: chk.created_at, operatorName: prof?.full_name || null, operatorRole: prof?.role || null };
      if (st) status = st;
      loadHistory(chk.id);
      setNotes(chk.notes || '');
    } else {
      setHistory([]);
    }
    setExisting(ex);
    setCanEdit(!!status.can_edit);
    setIsAdmin(!!status.is_admin);
    if (ex && !status.is_admin && status.can_edit && status.seconds_left > 0) {
      setDeadline(performance.now() + status.seconds_left * 1000);
      setSecondsLeft(status.seconds_left);
    } else {
      setDeadline(null);
      setSecondsLeft(null);
    }

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
        setPhase(ex && !status.can_edit ? 'readonly' : 'checklist');
      } else {
        setItems([]);
        setPhase('count');
      }
    } else {
      setPhase('count');
    }
    setLoading(false);
  }, [branchId, slot, controlDate, role, loadHistory]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Reloj de la cuenta regresiva
  useEffect(() => {
    if (deadline == null) return undefined;
    const timer = setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) {
        clearInterval(timer);
        setDeadline(null);
        setCanEdit(false);
        // Si estaba editando, se descartan los cambios sin guardar y queda en solo lectura.
        if (['checklist', 'confirm', 'count'].includes(phaseRef.current)) {
          setNotice(`El informe se cerró: pasaron ${EDIT_WINDOW_SECONDS} segundos. Los cambios sin guardar se descartaron.`);
          loadAll();
        }
      }
    }, 500);
    return () => clearInterval(timer);
  }, [deadline, loadAll]);

  const countNum = count === '' ? NaN : Number(count);
  const countValid = Number.isInteger(countNum) && countNum >= 0 && countNum <= MAX_MACHINES;

  const resizeItems = (n) => setItems((prev) => Array.from({ length: n }, (_, i) => prev[i] || newItem(i + 1)));

  const confirmCount = async () => {
    if (!countValid) return;
    if (countNum === 0) {
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

  // Problemas de controles ANTERIORES que siguen sin resolver, por máquina.
  const priorByMachine = useMemo(() => {
    const cutoff = `${controlDate} ${slot}`;
    const map = {};
    openIssues.forEach((o) => {
      const since = `${o.since_date} ${o.since_slot}`;
      if (since >= cutoff) return; // nació en este mismo control
      (map[o.machine_no] = map[o.machine_no] || []).push(o);
    });
    return map;
  }, [openIssues, controlDate, slot]);
  const priorCount = Object.values(priorByMachine).reduce((s, a) => s + a.length, 0);

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
    const { data, error: err } = await supabase.rpc('save_slot_check', {
      p_branch_id: branchId,
      p_control_date: controlDate,
      p_slot: slot,
      p_machine_count: items.length,
      p_items: payload,
      p_notes: notes || null,
    });
    setSaving(false);
    if (err) {
      if (/cerrado/i.test(err.message)) {
        setNotice(err.message);
        loadAll();
      } else {
        setPhase('checklist');
        setError('No se pudo guardar el control: ' + err.message);
      }
      return;
    }
    // Se guardó: arranca (o sigue) la cuenta regresiva de edición
    const secs = data?.seconds_left;
    if (data && !data.is_admin && secs > 0) {
      setDeadline(performance.now() + secs * 1000);
      setSecondsLeft(secs);
    } else {
      setDeadline(null);
      setSecondsLeft(null);
    }
    setIsAdmin(!!data?.is_admin);
    setCanEdit(true);
    setExisting((prev) => prev || { id: data?.check_id, createdAt: data?.created_at, operatorName: profile?.full_name || null, operatorRole: role });
    loadHistory(data?.check_id);
    supabase.from('slot_open_issues').select('*').eq('branch_id', branchId).then(({ data: open }) => setOpenIssues(open || []));
    setNotice('');
    setDoneSummary({ maquinas: items.length, incidencias: problems.length, edited: !!data?.edited });
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

  const timerOn = secondsLeft != null && secondsLeft > 0 && !isAdmin;

  return (
    <div className="max-w-2xl mx-auto">
      <button className="btn btn-ghost !px-3.5 !py-2 !text-[12.5px] mb-3" onClick={back}>← Volver al listado</button>

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

      {existing && (
        <div className="card !py-2.5 mb-4 text-[12.5px] text-text2">
          Informe reportado por{' '}
          <b className="text-text">{ROLE_LABEL[existing.operatorRole] || 'Monitoreo'}{existing.operatorName ? ` — ${existing.operatorName}` : ''}</b>
          {' '}· {fmtDateTimePy(existing.createdAt)}
          {phase === 'readonly' && <Badge className="badge-neutral ml-2">CERRADO</Badge>}
        </div>
      )}

      {notice && (
        <div className="card !py-2.5 mb-4 text-[12.5px] text-orange border-orange/40">{notice}</div>
      )}

      {existing && isAdmin && ['checklist', 'confirm'].includes(phase) && (
        <div className="card !py-2.5 mb-4 text-[12.5px] text-text2 border-amber/40">
          Estás editando un informe ya guardado. Como Administrador podés hacerlo en cualquier momento; el cambio queda en el historial.
        </div>
      )}
      {existing && !isAdmin && timerOn && ['checklist', 'confirm', 'count'].includes(phase) && (
        <div className="card !py-2.5 mb-4 text-[12.5px] border-amber/40 flex items-center justify-between">
          <span className="text-text2">Podés modificar este informe unos segundos más; después se cierra.</span>
          <span className="font-mono font-bold text-amber text-base">{secondsLeft}s</span>
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
            <button className="btn btn-ghost" onClick={items.length ? () => setPhase('checklist') : back}>Volver</button>
            <button className={`btn ${countValid && !saving ? 'btn-primary' : 'btn-disabled'}`} disabled={!countValid || saving} onClick={confirmCount}>
              {saving ? 'Guardando…' : countNum === 0 ? 'Guardar: sin tragamonedas' : 'Continuar al control →'}
            </button>
          </div>
        </div>
      )}

      {phase === 'checklist' && (
        <>
          <div className="flex items-center justify-between mb-2 text-[12.5px] text-text2">
            <span>{items.length} tragamonedas en esta sucursal</span>
            <button className="text-brand font-semibold hover:underline" onClick={() => setPhase('count')}>Cambiar cantidad</button>
          </div>
          <div className="text-[11.5px] text-text3 mb-3">
            <b className="text-orange">Sin sacar</b>, <b className="text-orange">Cerca del ATC</b> y <b className="text-orange">Apagado</b> cuentan como problema y quedan registrados como incidencia.
          </div>

          {priorCount > 0 && (
            <div className="card !py-3 mb-3 border-orange/50">
              <div className="text-[13px] font-semibold text-orange mb-0.5">Hay {priorCount} problema{priorCount > 1 ? 's' : ''} de controles anteriores sin resolver</div>
              <div className="text-[12px] text-text3">Revisá cada máquina marcada abajo. Si ya se solucionó, dejala en OK; si sigue igual, tocá “Sigue igual”.</div>
            </div>
          )}

          <div className="flex flex-col gap-3 mb-4">
            {items.map((it, idx) => {
              const issues = issuesOf(it);
              const prior = priorByMachine[it.machine_no] || [];
              return (
                <div key={it.machine_no} className={`card !p-4 ${issues.length ? 'border-orange/50' : ''}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-semibold text-sm">Tragamonedas #{it.machine_no}</div>
                    {issues.length > 0 ? <Badge className="badge-orange">{issues.length} problema{issues.length > 1 ? 's' : ''}</Badge> : <Badge className="badge-green">Todo en orden</Badge>}
                  </div>

                  {prior.length > 0 && (
                    <div className="flex flex-col gap-1.5 mb-3">
                      {prior.map((o) => {
                        const c = ISSUE_BY_KEY[o.issue_key];
                        const marked = c && it[c.key] === false;
                        return (
                          <div key={o.issue_key} className="flex items-center justify-between gap-2 bg-orangesoft rounded-lg px-3 py-2 text-[12px]">
                            <span className="text-orange font-semibold">
                              Sin resolver: {c?.issue || o.issue_key} <span className="font-normal opacity-80">· desde {fmtShortDate(o.since_date)} ({o.since_slot})</span>
                            </span>
                            {c && (marked
                              ? <span className="text-text3 text-[11px]">Marcado abajo</span>
                              : <button type="button" className="text-[11.5px] font-semibold text-orange underline" onClick={() => setItem(idx, { [c.key]: false })}>Sigue igual</button>)}
                          </div>
                        );
                      })}
                    </div>
                  )}

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
            <button className="btn btn-primary" onClick={() => setPhase('confirm')}>{existing ? 'Guardar cambios' : 'Guardar control'}</button>
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
              {!isAdmin && !existing && (
                <p className="text-[11.5px] text-text3 mb-4">Después de guardar tenés {EDIT_WINDOW_SECONDS} segundos para editar el informe; luego se cierra.</p>
              )}
              <div className="flex gap-2.5 justify-end">
                <button className="btn btn-ghost" onClick={() => setPhase('checklist')} disabled={saving}>Volver</button>
                <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Confirmar'}</button>
              </div>
            </div>
          </div>
        </>
      )}

      {phase === 'readonly' && (
        <>
          <div className="card !py-2.5 mb-3 text-[12.5px] text-text2">
            Este informe está cerrado: pasaron más de {EDIT_WINDOW_SECONDS} segundos desde que se guardó. Solo un Administrador puede modificarlo.
          </div>
          <div className="flex flex-col gap-3 mb-4">
            {items.map((it) => {
              const issues = issuesOf(it);
              return (
                <div key={it.machine_no} className={`card !p-4 ${issues.length ? 'border-orange/50' : ''}`}>
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-sm">Tragamonedas #{it.machine_no}</div>
                    {issues.length > 0 ? (
                      <div className="flex gap-1 flex-wrap justify-end">{issues.map((x) => <Badge key={x} className={x === 'Apagado' ? 'badge-red' : 'badge-orange'}>{x}</Badge>)}</div>
                    ) : <Badge className="badge-green">Todo en orden</Badge>}
                  </div>
                  {it.observation && <div className="text-[12.5px] text-text2 mt-2">{it.observation}</div>}
                </div>
              );
            })}
            {notes && <div className="card !p-4 text-[12.5px] text-text2"><b className="text-text">Observación general:</b> {notes}</div>}
          </div>
          <div className="flex justify-end"><button className="btn btn-primary" onClick={back}>Volver al listado →</button></div>
        </>
      )}

      {phase === 'done' && doneSummary && (
        <div className="card flex flex-col items-center text-center">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-2 ${doneSummary.incidencias ? 'bg-orangesoft' : 'bg-greensoft'}`}>
            {doneSummary.incidencias ? <IconAlert width={28} height={28} className="text-orange" /> : <IconCheck width={28} height={28} className="text-green" />}
          </div>
          <h2 className="text-lg font-semibold mt-1 mb-1">
            {doneSummary.sinMaquinas ? 'Sucursal registrada sin tragamonedas' : doneSummary.edited ? 'Cambios guardados' : 'Control registrado'}
          </h2>
          <p className="text-[13px] text-text2 mb-5">Sucursal {branch.code} — {branch.name}</p>
          {!doneSummary.sinMaquinas && (
            <div className="w-full text-left text-sm">
              <Row label="Horario" value={slot} />
              <Row label="Tragamonedas controlados" value={doneSummary.maquinas} />
              <Row label="Con incidencia" value={doneSummary.incidencias} />
              <Row label="Reportó" value={`${ROLE_LABEL[existing?.operatorRole || role] || 'Monitoreo'} — ${existing?.operatorName || profile?.full_name || ''}`} />
            </div>
          )}
          {!doneSummary.sinMaquinas && (
            <div className="w-full mt-5">
              {isAdmin ? (
                <button className="btn btn-ghost w-full" onClick={() => setPhase('checklist')}>Editar informe</button>
              ) : timerOn ? (
                <button className="btn btn-ghost w-full" onClick={() => setPhase('checklist')}>Editar informe ({secondsLeft}s)</button>
              ) : (
                <div className="text-[12px] text-text3">El informe se cerró: pasaron {EDIT_WINDOW_SECONDS} segundos. Solo un Administrador puede modificarlo.</div>
              )}
            </div>
          )}
          <button className="btn btn-primary w-full mt-3" onClick={back}>Volver al listado →</button>
        </div>
      )}

      {history.length > 0 && phase !== 'count' && (
        <div className="card mt-4 !p-4">
          <div className="text-sm font-semibold mb-3">Historial de cambios ({history.length})</div>
          <div className="flex flex-col gap-3">
            {history.map((h) => (
              <div key={h.id} className="text-[12.5px] border-b border-bordersoft pb-3 last:border-none last:pb-0">
                <div className="text-text2 mb-1">
                  <b className="text-text">{fmtDateTimePy(h.edited_at)}</b> · {ROLE_LABEL[h.editor_role] || 'Usuario'}{h.editor_name ? ` — ${h.editor_name}` : ''}
                </div>
                <ul className="list-disc pl-5 text-text3">
                  {describeChanges(h).map((line, i) => <li key={i}>{line}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between py-2.5 border-b border-bordersoft last:border-none">
      <span className="text-text3">{label}</span>
      <span className="font-mono font-semibold text-right">{value}</span>
    </div>
  );
}
