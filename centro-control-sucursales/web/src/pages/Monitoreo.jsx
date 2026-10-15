import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient.js';
import { useAuth } from '../lib/auth.jsx';
import { STATUS_LABEL, fmtRelative, SEVERITY_WEIGHT } from '../lib/format.js';
import { IconSearch } from '../components/icons.jsx';
import Kpi from '../components/Kpi.jsx';
import { currentShiftStart } from '../lib/shift.js';

// Estilo de cada celda del panal por estado — mismos códigos de color que se
// usan en el resto de la app (ver STATUS_BADGE en lib/format.js), más el
// color/intensidad/velocidad de su "respiración". Las que necesitan acción
// (pendiente, con incidencia) laten más rápido y más fuerte; las que ya
// están resueltas laten lento y suave, como un pulso de fondo.
const STATUS_STYLE = {
  pendiente: { fill: '#ff5468', glow: 'rgba(255,84,104,.9)', glowSize: '15px', duration: '1.6s' },
  en_revision: { fill: '#ffc736', glow: 'rgba(255,199,54,.75)', glowSize: '10px', duration: '2.6s' },
  verificada: { fill: '#22e2a0', glow: 'rgba(34,226,160,.55)', glowSize: '7px', duration: '3.6s' },
  con_incidencia: { fill: '#ff8a3d', glow: 'rgba(255,138,61,.85)', glowSize: '13px', duration: '1.9s' },
};

// Aclara (percent > 0) u oscurece (percent < 0) un color #rrggbb, para armar
// un degradé sutil dentro de cada hexágono en vez de un color plano.
function shade(hex, percent) {
  const num = parseInt(hex.slice(1), 16);
  const clamp = (v) => Math.max(0, Math.min(255, v));
  const r = clamp((num >> 16) + Math.round(2.55 * percent));
  const g = clamp(((num >> 8) & 0xff) + Math.round(2.55 * percent));
  const b = clamp((num & 0xff) + Math.round(2.55 * percent));
  return `rgb(${r}, ${g}, ${b})`;
}

// Tamaño de cada celda hexagonal y geometría del panal — agrandado
// respecto al original para que entre el nombre completo de la sucursal,
// no solo el código.
const HEX_W = 136;
const HEX_H = 158;
const GAP = 9;
const OVERLAP = HEX_H * 0.25;
const STEP = HEX_H - OVERLAP;
const COL_OFFSET = STEP / 2;

export default function Monitoreo() {
  const navigate = useNavigate();
  const { profile, role } = useAuth();
  const [branches, setBranches] = useState([]);
  const [todayMap, setTodayMap] = useState({});
  const [lastMap, setLastMap] = useState({});
  const [profilesMap, setProfilesMap] = useState({});
  const [incByBranch, setIncByBranch] = useState({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('pendientes');
  const [estado, setEstado] = useState('todas');
  const [search, setSearch] = useState('');
  const [cityFilter, setCityFilter] = useState('');

  const load = async () => {
    setLoading(true);
    const [{ data: br }, { data: today }, { data: last }, { data: profs }, { data: inc }] = await Promise.all([
      supabase.from('branches').select('*').eq('active', true).order('code'),
      supabase.from('branch_today_check').select('*'),
      supabase.from('branch_last_check').select('*'),
      supabase.from('profiles').select('id, full_name'),
      supabase.from('incidents').select('branch_id, severity').gte('occurred_at', currentShiftStart().toISOString()).is('deleted_at', null),
    ]);
    setBranches(br || []);
    const tMap = {};
    (today || []).forEach((c) => (tMap[c.branch_id] = c));
    setTodayMap(tMap);
    const lMap = {};
    (last || []).forEach((c) => (lMap[c.branch_id] = c));
    setLastMap(lMap);
    const pMap = {};
    (profs || []).forEach((p) => (pMap[p.id] = p.full_name));
    setProfilesMap(pMap);
    const iMap = {};
    (inc || []).forEach((i) => {
      if (!iMap[i.branch_id]) iMap[i.branch_id] = { count: 0, maxSeverity: null };
      iMap[i.branch_id].count += 1;
      if (!iMap[i.branch_id].maxSeverity || SEVERITY_WEIGHT[i.severity] > SEVERITY_WEIGHT[iMap[i.branch_id].maxSeverity]) {
        iMap[i.branch_id].maxSeverity = i.severity;
      }
    });
    setIncByBranch(iMap);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const rows = useMemo(() => {
    return branches.map((b) => {
      const today = todayMap[b.id];
      const last = lastMap[b.id];
      let status = 'pendiente';
      if (today) status = today.finished_at ? today.status : 'en_revision';
      return {
        branch: b,
        status,
        check: today,
        lastLabel: today ? null : last ? fmtRelative(last.finished_at) : 'Sin registro',
        operatorName: today ? profilesMap[today.operator_id] : null,
        startedAt: today ? today.started_at : null,
        incInfo: incByBranch[b.id] || { count: 0, maxSeverity: null },
      };
    });
  }, [branches, todayMap, lastMap, profilesMap, incByBranch]);

  const cities = useMemo(() => [...new Set(branches.map((b) => b.city).filter(Boolean))].sort(), [branches]);

  const base = useMemo(() => {
    if (tab === 'pendientes') return rows.filter((r) => ['pendiente', 'en_revision'].includes(r.status));
    if (tab === 'verificadas') return rows.filter((r) => ['verificada', 'con_incidencia'].includes(r.status));
    if (tab === 'general') return rows;
    return [];
  }, [rows, tab]);

  const cityScoped = useMemo(() => {
    if (!cityFilter) return base;
    return base.filter((r) => r.branch.city === cityFilter);
  }, [base, cityFilter]);

  const counts = useMemo(() => {
    const c = { todas: cityScoped.length };
    ['pendiente', 'en_revision', 'verificada', 'con_incidencia'].forEach((s) => {
      c[s] = cityScoped.filter((r) => r.status === s).length;
    });
    return c;
  }, [cityScoped]);

  const filtered = useMemo(() => {
    let list = cityScoped;
    if (estado !== 'todas') list = list.filter((r) => r.status === estado);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((r) => `${r.branch.code} ${r.branch.name} ${r.branch.city}`.toLowerCase().includes(q));
    return list;
  }, [cityScoped, estado, search]);

  const canOperate = role === 'monitoreo' || role === 'admin';
  const canOpenScore = role === 'admin' || role === 'supervisor';

  const startCheck = async (branchId, existingCheckId) => {
    if (existingCheckId) {
      navigate(`/monitoreo/${branchId}`);
      return;
    }
    // Se inicia desde la base: cierra solas las verificaciones viejas que
    // quedaron abiertas y retoma la tuya si sigue abierta.
    let checkId = null;
    const rpc = await supabase.rpc('start_branch_check', { p_branch_id: branchId });
    if (!rpc.error) {
      checkId = rpc.data?.check_id || null;
    } else if (/start_branch_check|schema cache|does not exist/i.test(rpc.error.message)) {
      // Falta correr la migración 0014: se usa el método anterior.
      const { data, error } = await supabase
        .from('branch_checks')
        .insert({ branch_id: branchId, operator_id: profile.id })
        .select()
        .single();
      if (error) {
        alert(
          /one_open_check_per_branch/.test(error.message)
            ? 'Esta sucursal tiene una verificación vieja que quedó abierta. Hay que correr la migración 0014 en Supabase para cerrarla.'
            : 'No se pudo iniciar la verificación: ' + error.message
        );
        return;
      }
      checkId = data.id;
    } else {
      alert('No se pudo iniciar la verificación: ' + rpc.error.message);
      return;
    }
    navigate(`/monitoreo/${branchId}`, { state: { checkId } });
  };

  const verifiedToday = rows.filter((r) => ['verificada', 'con_incidencia'].includes(r.status)).length;

  return (
    <div>
      <div className="flex items-end justify-between mb-5">
        <div>
          <div className="text-[11px] text-brand uppercase tracking-widest font-semibold mb-1">Monitoreo</div>
          <h1 className="text-[22px] font-bold tracking-tight">Sucursales</h1>
        </div>
        <div className="text-[12px] text-text3">
          {verifiedToday} / {branches.length} verificadas hoy · {branches.length ? Math.round((verifiedToday / branches.length) * 100) : 0}%
        </div>
      </div>

      <div className="flex gap-1 bg-surface border border-border rounded-[10px] p-1 w-fit mb-4">
        <div onClick={() => { setTab('verificadas'); setEstado('todas'); }} className={`px-4 py-2 rounded-[7px] text-[12.5px] font-semibold cursor-pointer ${tab === 'verificadas' ? 'bg-brand text-white' : 'text-text2'}`}>
          Verificada
        </div>
        <div onClick={() => { setTab('pendientes'); setEstado('todas'); }} className={`px-4 py-2 rounded-[7px] text-[12.5px] font-semibold cursor-pointer ${tab === 'pendientes' ? 'bg-brand text-white' : 'text-text2'}`}>
          Pendientes
        </div>
        <div onClick={() => { setTab('general'); setEstado('todas'); }} className={`px-4 py-2 rounded-[7px] text-[12.5px] font-semibold cursor-pointer ${tab === 'general' ? 'bg-brand text-white' : 'text-text2'}`}>
          Vista General
        </div>
        <div onClick={() => setTab('resumen')} className={`px-4 py-2 rounded-[7px] text-[12.5px] font-semibold cursor-pointer ${tab === 'resumen' ? 'bg-brand text-white' : 'text-text2'}`}>
          Resumen
        </div>
      </div>

      {tab === 'resumen' ? (
        <GeneralView rows={rows} totalBranches={branches.length} />
      ) : (
        <>
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
              {tab === 'pendientes' && (
                <>
                  <Chip active={estado === 'pendiente'} onClick={() => setEstado('pendiente')} label={`Pendiente ${counts.pendiente}`} />
                  <Chip active={estado === 'en_revision'} onClick={() => setEstado('en_revision')} label={`En revisión ${counts.en_revision}`} />
                </>
              )}
              {tab === 'verificadas' && (
                <>
                  <Chip active={estado === 'verificada'} onClick={() => setEstado('verificada')} label={`Verificada ${counts.verificada}`} />
                  <Chip active={estado === 'con_incidencia'} onClick={() => setEstado('con_incidencia')} label={`Con incidencia ${counts.con_incidencia}`} />
                </>
              )}
              {tab === 'general' && (
                <>
                  <Chip active={estado === 'pendiente'} onClick={() => setEstado('pendiente')} label={`Pendiente ${counts.pendiente}`} />
                  <Chip active={estado === 'en_revision'} onClick={() => setEstado('en_revision')} label={`En revisión ${counts.en_revision}`} />
                  <Chip active={estado === 'verificada'} onClick={() => setEstado('verificada')} label={`Verificada ${counts.verificada}`} />
                  <Chip active={estado === 'con_incidencia'} onClick={() => setEstado('con_incidencia')} label={`Con incidencia ${counts.con_incidencia}`} />
                </>
              )}
            </div>
            <div className="ml-auto flex gap-3.5 text-[11px] text-text3 flex-wrap">
              <LegendDot color={STATUS_STYLE.pendiente.fill} label="Pendiente" />
              <LegendDot color={STATUS_STYLE.en_revision.fill} label="En revisión" />
              <LegendDot color={STATUS_STYLE.verificada.fill} label="Verificada" />
              <LegendDot color={STATUS_STYLE.con_incidencia.fill} label="Con incidencia" />
            </div>
          </div>

          <div className="card">
            {loading && <div className="text-center text-text3 py-10 text-sm">Cargando…</div>}
            {!loading && filtered.length === 0 && (
              <div className="text-center text-text3 py-10 text-sm">No hay sucursales para este filtro.</div>
            )}
            {!loading && filtered.length > 0 && (
              <HoneycombGrid
                rows={filtered}
                canOperate={canOperate}
                canOpenScore={canOpenScore}
                onOperate={(r) => startCheck(r.branch.id, r.check?.check_id)}
                onOpenScore={(r) => navigate(`/score/${r.branch.id}`)}
              />
            )}
            <div className="flex justify-between px-1 pt-3 mt-1 border-t border-bordersoft text-[11.5px] text-text3">
              <span>Mostrando {filtered.length} de {filtered.length} sucursales{estado !== 'todas' || search || cityFilter ? ' (filtradas)' : ''}</span>
              <span>Red completa: {branches.length} sucursales</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function GeneralView({ rows, totalBranches }) {
  const verificadas = rows.filter((r) => ['verificada', 'con_incidencia'].includes(r.status)).length;
  const pendientes = rows.filter((r) => r.status === 'pendiente').length;
  const enRevision = rows.filter((r) => r.status === 'en_revision').length;
  const conIncidencia = rows.filter((r) => r.status === 'con_incidencia').length;
  const pct = totalBranches ? Math.round((verificadas / totalBranches) * 100) : 0;

  const byCity = useMemo(() => {
    const map = {};
    rows.forEach((r) => {
      const city = r.branch.city || 'Sin ciudad';
      if (!map[city]) map[city] = { city, total: 0, verificadas: 0, conIncidencia: 0 };
      map[city].total += 1;
      if (['verificada', 'con_incidencia'].includes(r.status)) map[city].verificadas += 1;
      if (r.status === 'con_incidencia') map[city].conIncidencia += 1;
    });
    return Object.values(map)
      .map((c) => ({ ...c, pct: c.total ? Math.round((c.verificadas / c.total) * 100) : 0 }))
      .sort((a, b) => a.pct - b.pct);
  }, [rows]);

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        <Kpi label="Sucursales activas" value={totalBranches} />
        <Kpi
          label="Verificadas hoy"
          value={`${verificadas}/${totalBranches}`}
          sub={`${pct}% de cobertura`}
          color={pct >= 80 ? STATUS_STYLE.verificada.fill : pct >= 50 ? STATUS_STYLE.en_revision.fill : STATUS_STYLE.pendiente.fill}
        />
        <Kpi label="Pendientes" value={pendientes} color={STATUS_STYLE.pendiente.fill} pulse={pendientes > 0} />
        <Kpi label="En revisión" value={enRevision} color={STATUS_STYLE.en_revision.fill} />
        <Kpi label="Con incidencia" value={conIncidencia} color={STATUS_STYLE.con_incidencia.fill} />
      </div>

      <div className="card">
        <div className="text-sm font-semibold mb-1">Cobertura por ciudad</div>
        <div className="text-[11.5px] text-text3 mb-3.5">Sucursales verificadas hoy sobre el total activo — de menor a mayor cobertura</div>
        <div className="flex flex-col gap-3">
          {byCity.map((c) => (
            <div key={c.city}>
              <div className="flex justify-between items-center text-[12.5px] mb-1">
                <span className="font-medium">{c.city}</span>
                <span className="text-text3 font-mono">
                  {c.verificadas}/{c.total} · {c.pct}%
                  {c.conIncidencia > 0 && (
                    <span className="ml-2" style={{ color: STATUS_STYLE.con_incidencia.fill }}>
                      ⚠ {c.conIncidencia}
                    </span>
                  )}
                </span>
              </div>
              <div className="h-2 rounded-full bg-surface3 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${c.pct}%`,
                    background: c.pct >= 80 ? STATUS_STYLE.verificada.fill : c.pct >= 50 ? STATUS_STYLE.en_revision.fill : STATUS_STYLE.pendiente.fill,
                  }}
                />
              </div>
            </div>
          ))}
          {byCity.length === 0 && <div className="text-text3 text-sm py-4 text-center">Sin datos.</div>}
        </div>
      </div>
    </div>
  );
}

const PENDING_STATUSES = ['pendiente', 'en_revision'];

function HoneycombGrid({ rows, canOperate, canOpenScore, onOperate, onOpenScore }) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setWidth(el.getBoundingClientRect().width);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const numColumns = Math.max(1, Math.floor((width + GAP) / (HEX_W + GAP)) || 1);

  const columns = useMemo(() => {
    const cols = Array.from({ length: numColumns }, () => []);
    rows.forEach((r, i) => cols[i % numColumns].push(r));
    return cols;
  }, [rows, numColumns]);

  return (
    <div ref={containerRef} className="flex justify-center" style={{ gap: GAP }}>
      {columns.map((col, ci) => (
        <div key={ci} style={{ width: HEX_W }}>
          {col.map((r, ri) => {
            // Cada celda decide su propia acción según SU estado — así "Vista
            // General", que mezcla todos los estados en un solo panal, actúa
            // bien celda por celda (iniciar revisión en las pendientes, ver
            // ficha en las ya verificadas).
            const isPending = PENDING_STATUSES.includes(r.status);
            const clickable = isPending ? canOperate : canOpenScore;
            return (
              <HexCell
                key={r.branch.id}
                r={r}
                isPending={isPending}
                clickable={clickable}
                marginTop={ri === 0 ? (ci % 2 === 1 ? COL_OFFSET : 0) : -OVERLAP}
                onClick={() => {
                  if (!clickable) return;
                  if (isPending) onOperate(r);
                  else onOpenScore(r);
                }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

const HEX_CLIP = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)';

function HexCell({ r, isPending, clickable, marginTop, onClick }) {
  const [hover, setHover] = useState(false);
  const cfg = STATUS_STYLE[r.status];

  return (
    <div
      className="hex-breathe relative"
      style={{
        width: HEX_W,
        height: HEX_H,
        marginTop,
        clipPath: HEX_CLIP,
        // El "gutter" oscuro entre celdas — hace que se lean como panal real
        // en vez de un bloque de color continuo.
        background: '#05070c',
        cursor: clickable ? 'pointer' : 'default',
        '--glow-color': cfg.glow,
        '--glow-size': cfg.glowSize,
        animationDuration: cfg.duration,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
    >
      {/* Relleno interior, levemente más chico que la celda — deja ver el
          gutter oscuro como borde y le da forma de panal real. */}
      <div
        className="absolute flex flex-col items-center justify-center px-2.5 overflow-hidden transition-all duration-150"
        style={{
          inset: '5%',
          clipPath: HEX_CLIP,
          background: `linear-gradient(155deg, ${shade(cfg.fill, 20)} 0%, ${cfg.fill} 55%, ${shade(cfg.fill, -14)} 100%)`,
          transform: hover ? 'scale(1.08)' : 'scale(1)',
          filter: hover ? 'brightness(1.1)' : 'brightness(1)',
        }}
      >
        <span className="font-mono font-bold text-[10.5px] leading-none opacity-70" style={{ color: '#0a0e14' }}>
          {r.branch.code}
        </span>
        <span className="text-[9.5px] font-bold leading-[1.2] text-center mt-1" style={{ color: '#0a0e14' }}>
          {r.branch.name}
        </span>
      </div>

      {hover && (
        <div
          className="absolute z-20 bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2 bg-surface2 border border-border rounded-lg px-3 py-2 text-[11.5px] whitespace-nowrap shadow-lg pointer-events-none"
          style={{ color: '#e8ecf2' }}
        >
          <div className="font-semibold mb-0.5">Suc. {r.branch.code} — {r.branch.name}</div>
          <div className="text-text3 mb-1">{r.branch.city}</div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.fill }} />
            <span>{STATUS_LABEL[r.status]}</span>
          </div>
          {isPending ? (
            <div className="text-text3 mt-0.5">Última revisión: {r.lastLabel ?? '—'}</div>
          ) : (
            <>
              <div className="text-text3 mt-0.5">Operador: {r.operatorName || '—'}</div>
              <div className="text-text3">Incidencias: {r.incInfo.count}</div>
              <div className="text-text3">
                Hora inicio: {r.startedAt ? new Date(r.startedAt).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' }) : '—'}
              </div>
            </>
          )}
          {clickable && (
            <div className="text-brand font-semibold mt-1">{isPending ? (r.status === 'en_revision' ? 'Click para continuar →' : 'Click para iniciar revisión →') : 'Click para ver ficha →'}</div>
          )}
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, label }) {
  return (
    <div
      onClick={onClick}
      className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold border cursor-pointer ${
        active ? 'bg-brandsoft border-brand text-brand' : 'bg-surface border-border text-text2'
      }`}
    >
      {label}
    </div>
  );
}

function LegendDot({ color, label }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full flex-none" style={{ background: color }} />
      {label}
    </div>
  );
}
