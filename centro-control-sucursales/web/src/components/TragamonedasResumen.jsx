import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import Kpi from './Kpi.jsx';

const GREEN = '#22e2a0';
const ORANGE = '#ff8a3d';

// Resumen general de tragamonedas: cantidad total de máquinas y cuántas
// sucursales están sin inconvenientes (sin problemas pendientes de resolver).
// Solo cuenta sucursales que tienen tragamonedas cargadas en la base.
export default function TragamonedasResumen({ branches, configMap }) {
  const [openRows, setOpenRows] = useState(null); // null = cargando

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase.from('slot_open_issues').select('branch_id, machine_no, issue_key').limit(5000);
      if (!alive) return;
      setOpenRows(error ? [] : data || []);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const stats = useMemo(() => {
    const withMachines = branches.filter((b) => (configMap[b.id] || 0) > 0);
    const total = withMachines.reduce((s, b) => s + configMap[b.id], 0);
    const ids = new Set(withMachines.map((b) => b.id));
    const conProblema = new Set((openRows || []).filter((r) => ids.has(r.branch_id)).map((r) => r.branch_id));
    const machinesBad = new Set((openRows || []).filter((r) => ids.has(r.branch_id)).map((r) => `${r.branch_id}|${r.machine_no}`)).size;
    return {
      sucursales: withMachines.length,
      total,
      conProblema: conProblema.size,
      sinProblema: withMachines.length - conProblema.size,
      machinesBad,
    };
  }, [branches, configMap, openRows]);

  const ready = openRows !== null;
  const pct = stats.sucursales ? Math.round((stats.sinProblema / stats.sucursales) * 100) : 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
      <Kpi label="Tragamonedas en total" value={stats.total} sub={`en ${stats.sucursales} sucursales`} />
      <Kpi
        label="Sucursales sin inconvenientes"
        value={ready ? `${stats.sinProblema}/${stats.sucursales}` : '…'}
        sub={ready ? `${pct}% sin problemas pendientes` : 'calculando…'}
        color={ready && stats.sucursales && stats.sinProblema === stats.sucursales ? GREEN : undefined}
      />
      <Kpi
        label="Sucursales con inconvenientes"
        value={ready ? stats.conProblema : '…'}
        sub="con problemas sin resolver"
        color={ready && stats.conProblema > 0 ? ORANGE : undefined}
      />
      <Kpi
        label="Máquinas con problema"
        value={ready ? stats.machinesBad : '…'}
        sub={`de ${stats.total} tragamonedas`}
        color={ready && stats.machinesBad > 0 ? ORANGE : undefined}
      />
    </div>
  );
}
