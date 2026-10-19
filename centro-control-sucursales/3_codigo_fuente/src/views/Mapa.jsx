import { useMemo } from 'react';
import MapView from '../components/MapView';
import { CuadrillasAhora, Leyenda, itemsMapa } from '../components/Comun';
import { useData } from '../lib/store';
import { fmtDateLong, hoy } from '../lib/util';

export default function Mapa({ onSucursal }) {
  const { sucursales, estadoSucursal, crewById, perfiles, tareas, listo } = useData();
  const items = useMemo(() => itemsMapa({ sucursales, estadoSucursal, crewById, tareas, perfiles }), [sucursales, estadoSucursal, crewById, tareas, perfiles]);
  const sinCoord = sucursales.filter((s) => s.activa && (s.lat == null || s.lng == null)).length;
  const conCurso = items.filter((i) => i.clase === 'curso').length;
  const conPend = items.filter((i) => i.clase === 'pend').length;
  return (
    <div className="cols">
      <div className="mapbox">
        <MapView items={items} onPick={onSucursal} alto={560} />
        <Leyenda />
        {sinCoord > 0 && <div className="maplabel">{sinCoord} sucursal(es) sin coordenadas no aparecen en el mapa. El administrador las carga en Parámetros &gt; Sucursales.</div>}
        {listo && sucursales.length === 0 && <div className="maplabel">Aún no hay sucursales. El administrador las importa en Parámetros &gt; Sucursales.</div>}
      </div>
      <div className="stack">
        <div className="card"><h2>Hoy, {fmtDateLong(hoy())}</h2><CuadrillasAhora /></div>
        <div className="card">
          <h2>Resumen</h2>
          <div className="kpis two-up">
            <div className="kpi"><div className="n">{conCurso}</div><div className="l">Sucursales en trabajo</div></div>
            <div className="kpi"><div className="n">{conPend}</div><div className="l">Con tareas pendientes</div></div>
          </div>
          <p className="hint" style={{ marginBottom: 0 }}>Haz clic en una sucursal del mapa para abrir su ficha.</p>
        </div>
      </div>
    </div>
  );
}
